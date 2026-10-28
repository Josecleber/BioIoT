#include "ppg_sensor.h"

#include <Arduino.h>
#include <Wire.h>
#include <math.h>
#include "MAX30105.h"

namespace ppg {
namespace {

constexpr int kSdaPin = 33;
constexpr int kSclPin = 32;
constexpr uint8_t kSensorAddress = 0x57;
constexpr uint8_t kOverflowRegister = 0x05;
constexpr uint8_t kFifoPointersRegister = 0x04;
constexpr uint8_t kFifoDataRegister = 0x07;
constexpr uint32_t kNoSampleTimeoutMs = 1000;
constexpr uint32_t kRetryIntervalMs = 2000;
constexpr uint32_t kFreshnessMs = 4000;
constexpr uint32_t kPollingGapMs = 320;
constexpr uint32_t kFingerThreshold = 50000;
constexpr uint32_t kSaturatedThreshold = 260000;
constexpr float kSampleRate = 100.0f;
constexpr float kCutoff = 5.0f;
const float kLowPassAlpha = 1.0f - expf(-2.0f * PI * kCutoff / kSampleRate);
constexpr float kDcAlpha = 0.02f;
constexpr float kBeatAlpha = 0.15f;

MAX30105 sensor;
bool sensorReady = false;
uint32_t lastAttemptMillis = 0;
uint32_t lastPollMillis = 0;
uint32_t waitingSinceMillis = 0;
uint32_t lastSampleMillis = 0;
bool hasSample = false;
SignalState signalState = SignalState::SensorMissing;

float filteredRed = 0.0f;
float filteredIr = 0.0f;
float dcRed = 0.0f;
float dcIr = 0.0f;
float pulseWave = 0.0f;
float pulseEnvelope = 20.0f;
uint32_t sampleIndex = 0;
uint32_t fingerSamples = 0;
bool pulseArmed = false;
float peakIr = -1e6f;
float troughIr = 1e6f;
float peakRed = -1e6f;
float troughRed = 1e6f;
uint32_t lastPeakSample = 0;
float bpmHistory[5] = {};
float spo2History[5] = {};
uint8_t bpmIndex = 0;
uint8_t bpmCount = 0;
uint8_t spo2Index = 0;
uint8_t spo2Count = 0;
float finalBpm = NAN;
float finalSpo2 = NAN;
bool hasBpm = false;
bool hasSpo2 = false;
uint32_t lastBpmMillis = 0;
uint32_t lastSpo2Millis = 0;

portMUX_TYPE readingMux = portMUX_INITIALIZER_UNLOCKED;
Reading published = {NAN, NAN, 0, SignalState::SensorMissing};
Diagnostics diagnostic = {};
Diagnostics publishedDiagnostic = {};

void resetBpm() {
  bpmIndex = 0;
  bpmCount = 0;
  finalBpm = NAN;
  hasBpm = false;
  lastBpmMillis = 0;
  for (float& value : bpmHistory) value = 0.0f;
}

void resetSpo2() {
  spo2Index = 0;
  spo2Count = 0;
  finalSpo2 = NAN;
  hasSpo2 = false;
  lastSpo2Millis = 0;
  for (float& value : spo2History) value = 0.0f;
}

void resetExtremes() {
  peakIr = peakRed = -1e6f;
  troughIr = troughRed = 1e6f;
}

void resetSignal() {
  resetBpm();
  resetSpo2();
  resetExtremes();
  filteredRed = filteredIr = dcRed = dcIr = pulseWave = 0.0f;
  pulseEnvelope = 20.0f;
  sampleIndex = 0;
  fingerSamples = 0;
  pulseArmed = false;
  lastPeakSample = 0;
}

void expireMeasurements(uint32_t now) {
  if (hasBpm && now - lastBpmMillis > kFreshnessMs) resetBpm();
  if (hasSpo2 && now - lastSpo2Millis > kFreshnessMs) resetSpo2();
}

void publish(uint32_t now) {
  expireMeasurements(now);
  SignalState state = signalState;
  if (state == SignalState::Acquiring || state == SignalState::Valid) {
    state = (bpmCount >= 3 && hasBpm && hasSpo2 &&
             isfinite(finalBpm) && isfinite(finalSpo2))
                ? SignalState::Valid
                : SignalState::Acquiring;
  }
  const Reading next = {hasBpm ? finalBpm : NAN,
                        hasSpo2 ? finalSpo2 : NAN,
                        hasSample ? lastSampleMillis : 0,
                        state};
  portENTER_CRITICAL(&readingMux);
  published = next;
  diagnostic.fingerSamples = fingerSamples;
  diagnostic.acceptedBeats = bpmCount;
  publishedDiagnostic = diagnostic;
  portEXIT_CRITICAL(&readingMux);
}

float median(const float* values, uint8_t count) {
  float sorted[5];
  for (uint8_t i = 0; i < count; ++i) sorted[i] = values[i];
  for (uint8_t i = 0; i + 1 < count; ++i) {
    for (uint8_t j = i + 1; j < count; ++j) {
      if (sorted[j] < sorted[i]) {
        const float temporary = sorted[i];
        sorted[i] = sorted[j];
        sorted[j] = temporary;
      }
    }
  }
  return sorted[count / 2];
}

bool readRegisters(uint8_t address, uint8_t* values, uint8_t count);

void discardFifo() {
  // O MAX30102 tambem limpa OVF_COUNTER ao remover uma amostra completa.
  // Consumir e descartar antes de zerar os ponteiros evita ficar preso num
  // contador saturado, sem jamais voltar a ler o FIFO.
  uint8_t discarded[6];
  readRegisters(kFifoDataRegister, discarded, sizeof(discarded));
  // clearFIFO limpa o FIFO fisico; nextSample esvazia tambem o anel da biblioteca.
  sensor.clearFIFO();
  while (sensor.available()) sensor.nextSample();
}

bool readRegisters(uint8_t address, uint8_t* values, uint8_t count) {
  Wire.beginTransmission(kSensorAddress);
  if (Wire.write(address) != 1) {
    Wire.endTransmission(true);
    return false;
  }
  if (Wire.endTransmission(false) != 0) return false;
  const uint8_t received = Wire.requestFrom(kSensorAddress, count,
                                            static_cast<uint8_t>(true));
  if (received != count || Wire.available() != count) {
    while (Wire.available()) Wire.read();
    return false;
  }
  for (uint8_t index = 0; index < count; ++index) {
    const int value = Wire.read();
    if (value < 0) return false;
    values[index] = static_cast<uint8_t>(value);
  }
  return true;
}

void markSensorMissing(uint32_t now) {
  sensorReady = false;
  lastAttemptMillis = now;
  resetSignal();
  signalState = SignalState::SensorMissing;
  publish(now);
}

bool initializeSensor() {
  const uint32_t now = millis();
  lastAttemptMillis = now;
  resetSignal();
  if (!sensor.begin(Wire, 100000)) {
    markSensorMissing(now);
    return false;
  }
  // Mesma montagem e parametros do projeto original: RED+IR, 100 pares/s, media 1.
  sensor.setup(0x1F, 1, 2, 100, 411, 8192);
  discardFifo();
  sensorReady = true;
  waitingSinceMillis = millis();
  lastPollMillis = waitingSinceMillis;
  signalState = SignalState::Stabilizing;
  publish(waitingSinceMillis);
  return true;
}

// PROCESSAMENTO DO SINAL
// Recebe a luz vermelha (red) e infravermelha (ir) brutas e extrai os sinais vitais.
void processSample(uint32_t red, uint32_t ir, uint32_t now) {
  diagnostic.red = red;
  diagnostic.ir = ir;
  ++diagnostic.samples;
  lastSampleMillis = now;
  hasSample = true;
  waitingSinceMillis = now;
  ++sampleIndex;

  if (ir < kFingerThreshold) {
    resetSignal();
    signalState = SignalState::NoFinger;
    return;
  }
  if (ir >= kSaturatedThreshold || red >= kSaturatedThreshold) {
    resetSignal();
    signalState = SignalState::Saturated;
    return;
  }

  ++fingerSamples;
  signalState = SignalState::Stabilizing;
  if (fingerSamples == 1) {
    filteredRed = dcRed = static_cast<float>(red);
    filteredIr = dcIr = static_cast<float>(ir);
    pulseWave = 0.0f;
    lastPeakSample = sampleIndex;
    return;
  }

  filteredRed += kLowPassAlpha * (static_cast<float>(red) - filteredRed);
  filteredIr += kLowPassAlpha * (static_cast<float>(ir) - filteredIr);
  dcRed += kDcAlpha * (filteredRed - dcRed);
  dcIr += kDcAlpha * (filteredIr - dcIr);
  const float acRed = filteredRed - dcRed;
  const float acIr = filteredIr - dcIr;
  pulseWave += kBeatAlpha * (acIr - pulseWave);
  if (fingerSamples < 300) return;
  signalState = SignalState::Acquiring;

  pulseEnvelope = 0.99f * pulseEnvelope + 0.01f * fabsf(pulseWave);
  if (pulseEnvelope < 10.0f) pulseEnvelope = 10.0f;
  if (acIr > peakIr) peakIr = acIr;
  if (acIr < troughIr) troughIr = acIr;
  if (acRed > peakRed) peakRed = acRed;
  if (acRed < troughRed) troughRed = acRed;

  if (!pulseArmed && pulseWave < -0.35f * pulseEnvelope) pulseArmed = true;
  const uint32_t delta = sampleIndex - lastPeakSample;
  if (!pulseArmed || pulseWave <= 0.45f * pulseEnvelope || delta <= 35) return;
  pulseArmed = false;

  if (delta >= 38 && delta <= 140) {
    const float instantaneousBpm = 6000.0f / static_cast<float>(delta);
    bpmHistory[bpmIndex] = instantaneousBpm;
    bpmIndex = (bpmIndex + 1) % 5;
    if (bpmCount < 5) ++bpmCount;
    const float middleBpm = median(bpmHistory, bpmCount);
    finalBpm = hasBpm ? 0.75f * finalBpm + 0.25f * middleBpm : middleBpm;
    hasBpm = true;
    lastBpmMillis = now;

    const float amplitudeIr = peakIr - troughIr;
    const float amplitudeRed = peakRed - troughRed;
    if (dcIr > 0.0f && dcRed > 0.0f && amplitudeIr > 0.0f) {
      const float perfusionIndex = amplitudeIr / dcIr * 100.0f;
      if (perfusionIndex >= 0.05f && perfusionIndex <= 5.0f && amplitudeRed > 15.0f) {
        const float ratio = (amplitudeRed / dcRed) / (amplitudeIr / dcIr);
        if (isfinite(ratio) && ratio >= 0.35f && ratio <= 1.10f) {
          const float instantaneousSpo2 = -45.060f * ratio * ratio + 30.354f * ratio + 94.845f;
          // O original limitava o resultado a 75..100, mascarando valores fora da faixa.
          // Aqui uma estimativa fora da faixa e rejeitada, sem fabricar 75% ou 100%.
          if (isfinite(instantaneousSpo2) && instantaneousSpo2 >= 75.0f && instantaneousSpo2 <= 100.0f) {
            spo2History[spo2Index] = instantaneousSpo2;
            spo2Index = (spo2Index + 1) % 5;
            if (spo2Count < 5) ++spo2Count;
            const float middleSpo2 = median(spo2History, spo2Count);
            finalSpo2 = hasSpo2 ? 0.85f * finalSpo2 + 0.15f * middleSpo2 : middleSpo2;
            hasSpo2 = true;
            lastSpo2Millis = now;
          }
        }
      }
    }
  }
  lastPeakSample = sampleIndex;
  resetExtremes();
}

}  // namespace

bool begin() {
  Wire.begin(kSdaPin, kSclPin, 100000);
  Wire.setTimeOut(10);
  return initializeSensor();
}

// Esvazia o registrador físico para garantir que não ocorra overflow
void poll() {
  const uint32_t now = millis();
  if (!sensorReady) {
    if (now - lastAttemptMillis >= kRetryIntervalMs) initializeSensor();
    return;
  }
  if (now - waitingSinceMillis > kNoSampleTimeoutMs) {
    ++diagnostic.noSampleTimeouts;
    markSensorMissing(now);
    return;
  }

  const bool pollingGap = now - lastPollMillis >= kPollingGapMs;
  const uint32_t gap = now - lastPollMillis;
  if (gap > diagnostic.maxPollingGapMs) diagnostic.maxPollingGapMs = gap;
  lastPollMillis = now;
  uint8_t pointers[3];

  if (!readRegisters(kFifoPointersRegister, &pointers[0], 1) ||
      !readRegisters(kOverflowRegister, &pointers[1], 1) ||
      !readRegisters(kFifoPointersRegister + 2, &pointers[2], 1)) {
    ++diagnostic.i2cErrors;
    markSensorMissing(now);
    return;
  }
  const uint8_t overflow = pointers[1] & 0x1F;
  diagnostic.fifoWrite = pointers[0] & 0x1F;
  diagnostic.fifoRead = pointers[2] & 0x1F;
  diagnostic.fifoOverflow = overflow;
  const uint8_t pending = ((pointers[0] & 0x1F) - (pointers[2] & 0x1F) + 32) % 32;
  if (pollingGap || overflow != 0) {
    if (pollingGap) ++diagnostic.pollingGaps;
    if (overflow != 0) ++diagnostic.fifoDiscards;
    // Esvaziar por leitura limpa o contador de estouro sem reescrever os
    // ponteiros enquanto o sensor produz novas amostras. Ponteiros iguais
    // com estouro podem representar as 32 posicoes ocupadas.
    const uint8_t discardCount = pending ? pending : 32;
    for (uint8_t index = 0; index < discardCount; ++index) {
      uint8_t discarded[6];
      if (!readRegisters(kFifoDataRegister, discarded, sizeof(discarded))) {
        ++diagnostic.i2cErrors;
        markSensorMissing(millis());
        return;
      }
    }
    resetSignal();
    waitingSinceMillis = millis();
    signalState = SignalState::Stabilizing;
    publish(millis());
    return;
  }

  expireMeasurements(now);
  for (uint8_t index = 0; index < pending; ++index) {
    uint8_t bytes[6];
    if (!readRegisters(kFifoDataRegister, bytes, sizeof(bytes))) {
      ++diagnostic.i2cErrors;
      markSensorMissing(millis());
      return;
    }
    const uint32_t red = ((static_cast<uint32_t>(bytes[0]) << 16) |
                          (static_cast<uint32_t>(bytes[1]) << 8) | bytes[2]) & 0x3FFFF;
    const uint32_t ir = ((static_cast<uint32_t>(bytes[3]) << 16) |
                         (static_cast<uint32_t>(bytes[4]) << 8) | bytes[5]) & 0x3FFFF;
    // Mantem a ordem e o intervalo das amostras ja acumuladas no FIFO.
    processSample(red, ir, now - static_cast<uint32_t>(pending - 1 - index) * 10);
  }
  publish(millis());
}

Reading latest() {
  portENTER_CRITICAL(&readingMux);
  const Reading reading = published;
  portEXIT_CRITICAL(&readingMux);
  return reading;
}

Diagnostics diagnostics() {
  portENTER_CRITICAL(&readingMux);
  const Diagnostics result = publishedDiagnostic;
  portEXIT_CRITICAL(&readingMux);
  return result;
}

const char* statusText(SignalState state) {
  switch (state) {
    case SignalState::SensorMissing: return "Sensor nao encontrado ou sem amostras";
    case SignalState::NoFinger: return "Apoie o dedo levemente no sensor";
    case SignalState::Saturated: return "Sensor saturado; ajuste a pressao do dedo";
    case SignalState::Stabilizing: return "Estabilizando sinal por 3 segundos";
    case SignalState::Acquiring: return "Capturando pulsos; mantenha o dedo imovel";
    case SignalState::Valid: return "Estimativa com sinal valido";
  }
  return "Estado desconhecido";
}

}  // namespace ppg
