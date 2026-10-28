#!/usr/bin/env bash
set -euo pipefail
project_dir="$(cd -- "$(dirname -- "$0")/.." && pwd)"
mode="${1:-local}"
if [[ "$mode" != local && "$mode" != publico ]]; then
    echo 'Uso: bash deploy/instalar-servidor.sh [local|publico]'
    exit 1
fi
if [[ "$EUID" -ne 0 ]]; then
    echo 'A preparacao do servidor usa sudo para instalar/iniciar Docker.'
    exec sudo bash "$0" "$mode"
fi
if ! command -v docker >/dev/null 2>&1; then
    . /etc/os-release
    case "$ID" in
        ubuntu) distro=ubuntu; codename="${UBUNTU_CODENAME:-$VERSION_CODENAME}" ;;
        debian) distro=debian; codename="$VERSION_CODENAME" ;;
        *) echo 'Instalacao automatica: Ubuntu ou Debian. Instale Docker Engine + Compose para outra distribuicao.'; exit 1 ;;
    esac
    echo 'Instalando Docker Engine, Compose e Git pelo repositorio oficial...'
    apt-get update
    apt-get install -y ca-certificates curl git
    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL "https://download.docker.com/linux/$distro/gpg" -o /etc/apt/keyrings/docker.asc
    chmod a+r /etc/apt/keyrings/docker.asc
    arch="$(dpkg --print-architecture)"
    cat > /etc/apt/sources.list.d/docker.sources <<EOF
Types: deb
URIs: https://download.docker.com/linux/$distro
Suites: $codename
Components: stable
Architectures: $arch
Signed-By: /etc/apt/keyrings/docker.asc
EOF
    apt-get update
    apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi
docker compose version
cd "$project_dir"
if [[ "$mode" == publico ]]; then
    if [[ ! -f .env ]]; then
        echo 'Copie .env.example para .env e preencha dominio/email antes de publicar.'
        exit 1
    fi
    docker compose -f compose.yaml -f compose.publico.yaml up -d --build
    echo 'Site iniciado. O dominio deve apontar para este servidor e as portas 80/443 devem estar acessiveis.'
else
    docker compose up -d --build
    echo 'Site iniciado somente no servidor: http://127.0.0.1:3000'
fi
