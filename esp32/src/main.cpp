#include <Arduino.h>
#include <ArduinoJson.h>
#include <HTTPClient.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <math.h>
#include <time.h>

#include "config.h"
#include "ppg_sensor.h"
#include "tls_ca.h"

namespace {
TaskHandle_t networkTaskHandle = nullptr;

// FUNÇÕES AUXILIARES

// Valida se a leitura do sensor tem qualidade suficiente e se os dados são recentes
bool validReading(const ppg::Reading& reading) {
  return reading.state == ppg::SignalState::Valid && isfinite(reading.bpm) &&
         isfinite(reading.spo2) && reading.bpm >= 40 && reading.bpm <= 160 &&
         reading.spo2 >= 75 && reading.spo2 <= 100 &&
         static_cast<uint32_t>(millis() - reading.sampleMillis) <= config::MAX_SAMPLE_AGE_MS;
}

// Constrói o pacote de dados no formato JSON
String makePayload(const ppg::Reading& reading) {
  StaticJsonDocument<256> body;
  body["dispositivo"] = config::DEVICE_ID;
  body["bpm"] = static_cast<int>(lroundf(reading.bpm));
  body["spo2"] = static_cast<int>(lroundf(reading.spo2));
  String result;
  serializeJson(body, result);
  return result;
}

// LOOP DA REDE
void networkTask(void*) {
  String server = config::SERVER_URL;
  while (server.endsWith("/")) server.remove(server.length() - 1);
  server += "/api/dados";

  WiFi.persistent(false);
  WiFi.mode(WIFI_STA);
  WiFi.setHostname("bioiot-esp32");
  WiFi.setAutoReconnect(true);
  WiFi.begin(config::WIFI_SSID, config::WIFI_PASSWORD);
  Serial.println("[WIFI] Conectando a rede de 2.4 GHz...");

  uint32_t nextSend = millis();
  uint32_t backoff = config::SEND_INTERVAL_MS;

  for (;;) {
    const uint32_t now = millis();
    const ppg::Reading reading = ppg::latest();

    if (WiFi.status() != WL_CONNECTED) {
      vTaskDelay(pdMS_TO_TICKS(100));
      continue;
    }

    if (static_cast<int32_t>(now - nextSend) < 0 || !validReading(reading)) {
      vTaskDelay(pdMS_TO_TICKS(50));
      continue;
    }

    WiFiClient plainClient;
    HTTPClient request;
    request.setConnectTimeout(config::HTTP_TIMEOUT_MS);
    request.setTimeout(config::HTTP_TIMEOUT_MS);
    
    if (request.begin(plainClient, server)) {
      request.addHeader("Content-Type", "application/json");
      int status = request.POST(makePayload(reading));
      
      if (status == 201) {
        Serial.printf("[ENVIO OK] %s | BPM %d | SpO2 %d%% | HTTP 201\n", config::DEVICE_ID,
                      static_cast<int>(lroundf(reading.bpm)), static_cast<int>(lroundf(reading.spo2)));
        backoff = config::SEND_INTERVAL_MS;
      } else {
        Serial.printf("[ENVIO FALHOU] HTTP %d\n", status);
        backoff = min(backoff * 2, static_cast<uint32_t>(30000));
      }
      request.end();
    }
    
    nextSend = millis() + backoff;
    vTaskDelay(pdMS_TO_TICKS(50));
  }
}
}

// INICIALIZAÇÃO
void setup() {
  Serial.begin(115200);
  Serial.println("\nBioIoT | ESP32 + MAX30102 | Envio Direto");
  ppg::begin();
  xTaskCreatePinnedToCore(networkTask, "bioiot_wifi", 8192, nullptr, 1, &networkTaskHandle, 0);
}

// LOOP PRINCIPAL
void loop() {
  ppg::poll();
  delay(1);
}