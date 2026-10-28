# BioIoT - Firmware ESP32

Este diretório contém o código-fonte em C++ para o microcontrolador ESP32, responsável por ler o sensor MAX30102, processar os sinais vitais e enviar os resultados via Wi-Fi diretamente para o servidor.

## Esquema de Ligação

O projeto está configurado para a placa **ESP32 Dev Module**[cite: 4]. Efetue as seguintes ligações elétricas:

| MAX30102 | ESP32 |
| :--- | :--- |
| SDA | GPIO 33|
| SCL | GPIO 32|
| GND | GND|
| VIN / VCC | 3.3V (3V3)|

## Configuração Prévia

Antes de compilar, abra o ficheiro `include/config.h` (ou `include/config_local.h` se tiver sido criado) e atualize os parâmetros de rede[cite: 19, 20]:
* `BIOIOT_WIFI_SSID`: O nome da rede Wi-Fi (apenas 2.4 GHz).
* `BIOIOT_WIFI_PASSWORD`: A senha da rede Wi-Fi.
* `BIOIOT_SERVER_URL`: O endereço IP local do servidor Docker (ex: `http://192.168.1.X:3000`).
* `BIOIOT_RELAY_MODE`: Deve estar definido como `0` para ativar o envio HTTP direto.

## Gravação e Monitorização (PlatformIO)

1. **Abrir o projeto:** Abra apenas esta pasta `esp32` no VS Code. O PlatformIO irá detetar automaticamente o ficheiro `platformio.ini`[cite: 5].
2. **Gravação (Upload):** Ligue a placa por USB e clique no botão de *Upload* (ícone de seta) na barra inferior azul.
3. **Monitor Serial:** Clique no ícone do *Serial Monitor* (ícone de ficha elétrica). A comunicação ocorre a **115200 baud**[cite: 5].
4. **Visualizar Registos:** Devido à configuração do terminal, a placa não reinicia automaticamente ao abrir o monitor[cite: 5]. Pressione fisicamente o botão **EN** (ou RST) na ESP32 para ver as mensagens de arranque.
5. **Utilização:** Apoie o dedo suavemente no sensor MAX30102. Aguarde que o algoritmo estabilize o sinal e identifique uma onda limpa para visualizar a confirmação de envio (`HTTP 201`).