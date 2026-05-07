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
- Pacotes Python: `websockets`
- Para biometria via libfprint (Linux): `PyGObject` + `libfprint-2.0`
- Para ponto com cartao 125kHz (Windows keyboard wedge): `pynput`
- Para persistencia no PostgreSQL: `psycopg2-binary`
- *Para Windows*, o DigitalPersona Lite Client (SDK) precisa estar instalado para a integração via WebSocket se a extensão web.

## Como usar

**1. Rodando o Agente:**
```bash
cd agent
pip install websockets pynput psycopg2-binary
python bio_agent.py
```
O agente vai iniciar a escuta de websockets na porta `15896`.

Para salvar ponto no PostgreSQL, configure a variavel de ambiente:

```bash
ATTENDANCE_DB_URL=postgresql://USUARIO:SENHA@HOST:5432/BANCO
```

### App Desktop (.exe) com mini GUI e checklist

O projeto inclui uma GUI operacional em `agent/gui_app.py` com:
- Configuracao do dispositivo e URL PostgreSQL
- Acionamento iniciar/parar agente
- Acionamento iniciar/parar escuta RFID
- Checklist de saude (agente, websocket, escuta, banco, extensao conectada, ultimo cartao)
- Visualizacao de eventos em tempo real

Build do executavel no Windows:

```powershell
cd agent
.\build.ps1
```

Executavel gerado em `agent/dist/BioID-Agent.exe`.

Assinatura de codigo (requer certificado PFX valido):

```powershell
cd agent
.\sign-exe.ps1 -PfxPath "C:\caminho\certificado.pfx" -PfxPassword "SENHA"
```

**2. Abrindo a Interface de Captura:**
Abra o arquivo `cadastro-biometrico.html` dentro da pasta `web/` em seu navegador. Esta página comunica-se com o local SDK e o agente para detectar toques e amostras da biometria.

> [!IMPORTANT]
> **Atenção (Windows):** Se você estiver usando o driver oficial da HID (Lite Client), **feche o terminal do Python** antes de usar a extensão. O driver do Windows e o script Python podem entrar em conflito pelo controle do leitor USB. Use o script Python apenas se estiver em Linux ou se não tiver o software oficial instalado.

## Licença

Este projeto é licenciado sob os termos da licença [MIT](LICENSE).
