#pragma once

#include <stdint.h>

namespace ppg {

enum class SignalState {
  SensorMissing,
  NoFinger,
  Saturated,
  Stabilizing,
  Acquiring,
  Valid
};

struct Reading {
  // Valores ainda nao adquiridos ou vencidos sao NAN; somente Valid e uma medida completa.
  float bpm;
  float spo2;
  // Instante local (millis) da ultima amostra realmente consumida do sensor.
  uint32_t sampleMillis;
  SignalState state;
};

struct Diagnostics {
  uint32_t red;
  uint32_t ir;
  uint32_t samples;
  uint32_t i2cErrors;
  uint32_t noSampleTimeouts;
  uint32_t pollingGaps;
  uint32_t fifoDiscards;
  uint32_t maxPollingGapMs;
  uint32_t fingerSamples;
  uint32_t acceptedBeats;
  uint32_t fifoWrite;
  uint32_t fifoRead;
  uint32_t fifoOverflow;
};

// begin/poll pertencem a uma unica tarefa; latest pode ser lido por outra tarefa.
bool begin();
void poll();
Reading latest();
Diagnostics diagnostics();
const char* statusText(SignalState state);

}  // namespace ppg
