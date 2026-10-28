#pragma once
#include <stdint.h>

// IMPORTAÇÃO DE CREDENCIAIS PRIVADAS
#if __has_include("config_local.h")
#include "config_local.h"
#endif

// VALORES FALLBACK
#ifndef BIOIOT_WIFI_SSID
#define BIOIOT_WIFI_SSID ""
#endif
#ifndef BIOIOT_WIFI_PASSWORD
#define BIOIOT_WIFI_PASSWORD ""
#endif
#ifndef BIOIOT_SERVER_URL
#define BIOIOT_SERVER_URL ""
#endif
#ifndef BIOIOT_DEVICE_ID
#define BIOIOT_DEVICE_ID "ESP32-BANCADA-01"
#endif
#ifndef BIOIOT_RELAY_MODE
#define BIOIOT_RELAY_MODE 1
#endif

// CONSTANTES SEGURAS DO PROGRAMA
namespace config {
constexpr const char* WIFI_SSID = BIOIOT_WIFI_SSID;
constexpr const char* WIFI_PASSWORD = BIOIOT_WIFI_PASSWORD;
constexpr bool RELAY_MODE = BIOIOT_RELAY_MODE != 0;
constexpr const char* SERVER_URL = BIOIOT_SERVER_URL;
constexpr const char* DEVICE_ID = BIOIOT_DEVICE_ID;

// PARÂMETROS DE REDE E TEMPORIZAÇÃO
constexpr uint32_t SEND_INTERVAL_MS = 2000;       // 2000 = 2 seg entre cada envio valido
constexpr uint32_t MAX_SAMPLE_AGE_MS = 1500;      // 1500 = 1,5 seg de idade maxima para amostras validas
constexpr uint16_t HTTP_TIMEOUT_MS = 4000;        // 4000 = 4 seg de timeout para conexao HTTP
}
