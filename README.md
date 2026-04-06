# BioID — Cadastro Biométrico

Sistema de gerenciamento de cadastros biométricos em web usando o leitor DigitalPersona (HID/U.are.U 4000).

Este projeto é composto por três partes principais:

1. **Agente (Python)**: localizado na pasta `agent/`
   Um servidor WebSockets local (`bio_agent.py`) que usa a biblioteca `libfprint-2.0` para capturar templates biométricos do leitor e se comunica com o frontend via ws:// localhost:15896.

2. **Interface Web**: localizada na pasta `web/`
   Página autônoma HTML (`cadastro-biometrico.html`) que fornece a interface para realizar o cadastro de novos usuários, gerenciar digitas e simular a conexão com o scanner.

3. **Extensão do Chrome**: localizada na pasta `extension/`
   Extensão para sincronizar os dados e automatizar preenchimentos dentro do sistema Worklab (`app.worklabweb.com.br`).

## Requisitos

- Python 3.x
- Pacotes Python: `websockets`, `PyGObject` (e suporte nativo libfprint no sistema se for Linux)
- *Para Windows*, o DigitalPersona Lite Client (SDK) precisa estar instalado para a integração via WebSocket se a extensão web.

## Como usar

**1. Rodando o Agente:**
```bash
cd agent
pip install websockets
python bio_agent.py
```
O agente vai iniciar a escuta de websockets na porta `15896`.

**2. Abrindo a Interface de Captura:**
Abra o arquivo `cadastro-biometrico.html` dentro da pasta `web/` em seu navegador. Esta página comunica-se com o local SDK e o agente para detectar toques e amostras da biometria.

> [!IMPORTANT]
> **Atenção (Windows):** Se você estiver usando o driver oficial da HID (Lite Client), **feche o terminal do Python** antes de usar a extensão. O driver do Windows e o script Python podem entrar em conflito pelo controle do leitor USB. Use o script Python apenas se estiver em Linux ou se não tiver o software oficial instalado.

## Licença

Este projeto é licenciado sob os termos da licença [MIT](LICENSE).
