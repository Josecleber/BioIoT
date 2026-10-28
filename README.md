# BioIoT - Monitoramento PPG com ESP32

Este sistema utiliza uma placa ESP32 e um sensor MAX30102 para estimar batimentos cardíacos (BPM) e oxigenação sanguínea (SpO₂). A placa processa os sinais e envia os dados via rede Wi-Fi para um painel web executado em contêineres Docker.

**1. Servidor e Painel Web**
* Certifique-se de ter o Docker instalado na sua máquina.
* No terminal da raiz do projeto, execute `docker compose up -d` para construir a imagem e iniciar o site.
* Descubra o IP local da sua máquina (via `ipconfig` ou `ip a`) e aceda ao painel no navegador, seja no computador ou no telemóvel (ex: `http://192.168.1.X:3000`).

**2. Firmware da Placa**
* Abra a pasta `esp32` no VS Code com a extensão PlatformIO instalada.
* Configure as credenciais da rede Wi-Fi e a variável `BIOIOT_SERVER_URL` com o IP da sua máquina no ficheiro `esp32/include/config_local.h`.
* Ligue a ESP32 via USB e faça o upload do código.
* Consulte o ficheiro README dentro da pasta `esp32` para detalhes sobre o diagrama de ligação dos fios.

**3. Publicação em Nuvem (Opcional)**
* A pasta `deploy` e o ficheiro `compose.publico.yaml` contêm a infraestrutura necessária para hospedar este painel num servidor Linux remoto, utilizando o Caddy como proxy reverso para gerar certificados HTTPS automáticos num domínio personalizado.