#!/usr/bin/env python3
import asyncio, json, logging, base64, os, struct, io
import subprocess
from PIL import Image
import websockets

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(message)s')
os.chdir(os.path.dirname(os.path.abspath(__file__)))

class BioAgentCLI:
    def __init__(self):
        self.process = None
        self.ready = False

    def start(self):
        cli_path = "./watson_cli"
        if not os.path.exists(cli_path):
            logging.error("Binário C++ watson_cli não encontrado.")
            return False
            
        env = os.environ.copy()
        env["LD_LIBRARY_PATH"] = "/usr/lib:" + os.path.abspath("libs")
        self.process = subprocess.Popen(
            [cli_path], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            text=True, env=env, bufsize=1
        )
        
        line = self.process.stdout.readline().strip()
        if line == "READY":
            self.ready = True
            return True
        else:
            logging.error(f"Erro no C++: {line}")
            return False

    def capture(self):
        if not self.ready: return None, "Leitor não inicializado"
        
        try:
            self.process.stdin.write("CAPTURE\n")
            self.process.stdin.flush()
            
            line = self.process.stdout.readline().strip()
            if line == "SUCCESS":
                with open("capture.raw", "rb") as f:
                    w = struct.unpack("i", f.read(4))[0]
                    h = struct.unpack("i", f.read(4))[0]
                    raw_data = f.read(w * h)
                
                img = Image.frombytes('L', (w, h), raw_data)
                out = io.BytesIO()
                img.save(out, format="PNG")
                b64 = base64.b64encode(out.getvalue()).decode('utf-8')
                return {"image": b64, "template": ""}, None
            else:
                return None, f"Erro no sensor: {line}"
        except Exception as e:
            return None, f"Falha na comunicação C++: {str(e)}"

agent = BioAgentCLI()

async def handle(ws):
    await ws.send(json.dumps({"Path": "/dp/fp/device/connected"}))
    async for m in ws:
        msg = json.loads(m)
        if msg.get("Path") == "/dp/fp/acquire":
            logging.info("Solicitação de captura recebida do navegador.")
            loop = asyncio.get_running_loop()
            res, err = await loop.run_in_executor(None, agent.capture)
            if err: await ws.send(json.dumps({"Path": "/dp/reply/error", "Data": {"Reason": err}}))
            else: await ws.send(json.dumps({"Path": "/dp/fp/sample", "Data": {"Samples": [res]}}))

async def main():
    if agent.start():
        logging.info("Motor C++ Blindado rodando com sucesso.")
    else:
        logging.error("Falha ao iniciar motor C++.")
        return

    async with websockets.serve(handle, "127.0.0.1", 15896, ping_interval=None, ping_timeout=None):
        logging.info("Servidor WebSocket online. Pode testar a captura!")
        await asyncio.Future()

if __name__ == "__main__":
    asyncio.run(main())
