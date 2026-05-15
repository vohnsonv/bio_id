import os
import sys
import json
import logging
import asyncio
import signal
import websockets
from ctypes import CDLL, CFUNCTYPE, c_char_p, c_int, c_void_p
from PIL import Image

# 1. Configuração do Logger (DEVE SER A PRIMEIRA COISA)
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler("agent_debug.log")
    ]
)
logger = logging.getLogger("BioID")

# 2. Imports que podem falhar (RFID)
keyboard = None
try:
    # No Linux, forçar backend uinput/evdev para serviços sem X11
    if sys.platform.startswith('linux'):
        os.environ['PYNPUT_BACKEND_KEYBOARD'] = 'uinput'
    from pynput import keyboard
    logger.info("Módulo pynput (RFID) carregado.")
except Exception as e:
    logger.warning(f"Aviso: RFID operando em modo limitado ou falha no pynput: {e}")
    # Tenta fallback para backend padrão se falhou o uinput
    try:
        from pynput import keyboard
    except:
        keyboard = None

class BioAgentIB:
    def __init__(self):
        self.lib = None
        self.connected = False
        self._load_lib()

    def _load_lib(self):
        try:
            lib_path = os.path.join(os.path.dirname(__file__), "libs", "libbio_helper.so")
            if not os.path.exists(lib_path):
                # Tenta caminho relativo para quando rodar via PyInstaller
                lib_path = os.path.join(sys._MEIPASS, "libs", "libbio_helper.so") if hasattr(sys, '_MEIPASS') else "libs/libbio_helper.so"
            
            self.lib = CDLL(lib_path)
            self.lib.init_sdk.restype = c_int
            self.lib.open_device.restype = c_int
            self.lib.capture_fingerprint.restype = c_int
            self.lib.close_device.restype = c_int
            
            if self.lib.init_sdk() == 0:
                logger.info("SDK Biométrico inicializado.")
            else:
                logger.error("Falha ao inicializar SDK Biométrico.")
        except Exception as e:
            logger.error(f"Erro ao carregar bibliotecas nativas: {e}")

    def open_device(self):
        if not self.lib: return False
        res = self.lib.open_device()
        self.connected = (res == 0)
        if self.connected:
            logger.info("Leitor Biométrico conectado.")
        return self.connected

    def capture(self):
        if not self.connected: return None, "Device not connected"
        logger.info("Capturando digital...")
        
        # Buffer para a imagem (ajuste conforme o SDK)
        # Para simplificar, o helper salva em temp.bmp e retorna sucesso
        res = self.lib.capture_fingerprint()
        if res == 0:
            if os.path.exists("temp.bmp"):
                with open("temp.bmp", "rb") as f:
                    import base64
                    img_data = base64.b64encode(f.read()).decode('utf-8')
                    return img_data, None
            return None, "Image file not found"
        return None, f"Capture error code: {res}"

    def close(self):
        if self.lib and self.connected:
            self.lib.close_device()
            self.connected = False

class RFIDManager:
    def __init__(self, callback):
        self.callback = callback
        self.listener = None
        self.buffer = ""
        self._active = False

    def on_press(self, key):
        if not self._active: return
        try:
            char = key.char
            if char == '\r' or char == '\n':
                if self.buffer:
                    self.callback(self.buffer)
                    self.buffer = ""
            else:
                self.buffer += char
        except AttributeError:
            if key == keyboard.Key.enter:
                if self.buffer:
                    self.callback(self.buffer)
                    self.buffer = ""
            elif key == keyboard.Key.space:
                self.buffer += " "

    def start(self):
        if not keyboard:
            logger.warning("pynput indisponível. RFID desativado.")
            return
        self._active = True
        if not self.listener:
            self.listener = keyboard.Listener(on_press=self.on_press)
            self.listener.start()
            logger.info("Escuta RFID iniciada.")

    def stop(self):
        self._active = False
        logger.info("Escuta RFID pausada.")

agent = BioAgentIB()

def rfid_callback(uid):
    if not connected_clients: return
    message = json.dumps({"Path": "/rfid/card-read", "Data": {"uid": uid}})
    asyncio.run_coroutine_threadsafe(broadcast_rfid(message), main_loop)

async def broadcast_rfid(message):
    for client in list(connected_clients):
        try:
            await client.send(message)
        except:
            connected_clients.remove(client)

rfid_mgr = RFIDManager(rfid_callback)
connected_clients = set()
main_loop = None

async def handle_websocket(ws):
    remote_addr = ws.remote_address
    logger.info(f"Nova conexão de: {remote_addr}")
    connected_clients.add(ws)
    
    await ws.send(json.dumps({"Path": "/dp/fp/device/connected"}))
    
    # Biometria opcional
    agent.open_device()

    try:
        async for message in ws:
            data = json.loads(message)
            path = data.get("Path")
            
            if path == "/dp/fp/acquire":
                loop = asyncio.get_running_loop()
                sample, err = await loop.run_in_executor(None, agent.capture)
                if err:
                    await ws.send(json.dumps({"Path": "/dp/reply/error", "Data": {"Reason": err}}))
                else:
                    await ws.send(json.dumps({"Path": "/dp/fp/sample", "Data": {"Samples": [sample]}}))
            
            elif path == "/dp/fp/ping":
                await ws.send(json.dumps({"Path": "/dp/reply/pong"}))

            elif path == "/rfid/start-listen":
                rfid_mgr.start()
                await ws.send(json.dumps({"Path": "/rfid/status", "Data": {"listening": True}}))

            elif path == "/agent/health":
                await ws.send(json.dumps({
                    "Path": "/agent/health", 
                    "Data": {"status": "ok", "has_rfid": keyboard is not None}
                }))

    except Exception as e:
        logger.error(f"Erro no socket {remote_addr}: {e}")
    finally:
        if ws in connected_clients:
            connected_clients.remove(ws)

async def main():
    global main_loop
    main_loop = asyncio.get_event_loop()
    
    stop_event = asyncio.Event()
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(sig, stop_event.set)
    
    async with websockets.serve(handle_websocket, "127.0.0.1", 15896, ping_interval=20):
        logger.info("BioID Agent ativo em 127.0.0.1:15896")
        await stop_event.wait()
    
    agent.close()
    logger.info("Agente encerrado.")

if __name__ == "__main__":
    asyncio.run(main())
