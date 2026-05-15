#!/bin/bash

# Configurações
SERVICE_NAME="bioid-agent"
WORKING_DIR=$(pwd)
EXEC_PATH="$WORKING_DIR/dist/bio_agent"
USER_NAME=$(whoami)

echo "--- Instalando BioID Agent como Serviço ---"

# Verificar se o executável existe
if [ ! -f "$EXEC_PATH" ]; then
    echo "Erro: Executável não encontrado em $EXEC_PATH."
    echo "Rode 'make build-exe' primeiro."
    exit 1
fi

# Criar o arquivo de serviço
cat <<EOF | sudo tee /etc/systemd/system/$SERVICE_NAME.service
[Unit]
Description=BioID Biometric and RFID Agent
After=network.target

[Service]
Type=simple
User=$USER_NAME
WorkingDirectory=$WORKING_DIR
ExecStart=$EXEC_PATH
Restart=always
RestartSec=5
# Garante que o driver USB tenha tempo de inicializar
ExecStartPre=/bin/sleep 2

[Install]
WantedBy=multi-user.target
EOF

# Recarregar systemd e ativar serviço
echo "Ativando serviço..."
sudo systemctl daemon-reload
sudo systemctl enable $SERVICE_NAME
sudo systemctl restart $SERVICE_NAME

echo "---"
echo "Serviço $SERVICE_NAME instalado e iniciado!"
echo "Comandos úteis:"
echo "  sudo systemctl status $SERVICE_NAME   (Ver status)"
echo "  sudo journalctl -u $SERVICE_NAME -f   (Ver logs em tempo real)"
echo "---"
