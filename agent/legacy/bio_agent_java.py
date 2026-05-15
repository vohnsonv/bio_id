#!/usr/bin/env python3
import asyncio, json, logging, base64, os, subprocess
import websockets

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(message)s')
os.chdir(os.path.dirname(os.path.abspath(__file__)))

class JavaAgentBridge:
    def __init__(self):
        self.process = None
        self.ready = False

    def start(self):
        java_agent_dir = "java_agent"
        libs_dir = os.path.abspath(os.path.join(java_agent_dir, "libs"))
        classpath = f".:libs/IBScanUltimate.jar:libs/IBScanCommon.jar"
        
        env = os.environ.copy()
        
        self.process = subprocess.Popen(
            ["java", "-cp", classpath, "-Djava.library.path=libs", "BioAgent"],
            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            text=True, env=env, bufsize=1, cwd=java_agent_dir
        )
        
        line = self.process.stdout.readline().strip()
        if line == "READY":
            self.ready = True
            return True
        else:
            logging.error(f"Erro no Java: {line}")
            return False

    def capture(self):
        if not self.ready: return None, "Leitor não inicializado"
        self.process.stdin.write("CAPTURE\n")
        self.process.stdin.flush()
        
        line = self.process.stdout.readline().strip()
        if line.startswith("SUCCESS_"):
            b64 = line.replace("SUCCESS_", "")
            return {"image": b64, "template": ""}, None
        return None, f"Falha no Java: {line}"

bridge = JavaAgentBridge()

async def handle(ws):
    await ws.send(json.dumps({"Path": "/dp/fp/device/connected"}))
    async for m in ws:
        msg = json.loads(m)
        if msg.get("Path") == "/dp/fp/acquire":
            logging.info("Solicitação de captura...")
            loop = asyncio.get_running_loop()
            res, err = await loop.run_in_executor(None, bridge.capture)
            if err: await ws.send(json.dumps({"Path": "/dp/reply/error", "Data": {"Reason": err}}))
            else: await ws.send(json.dumps({"Path": "/dp/fp/sample", "Data": {"Samples": [res]}}))

async def main():
    if bridge.start():
        logging.info("Motor JAVA robusto online.")
    else:
        logging.error("Falha ao iniciar motor Java.")
        return

    async with websockets.serve(handle, "127.0.0.1", 15896, ping_interval=None, ping_timeout=None):
        logging.info("Aguardando conexão...")
        await asyncio.Future()

if __name__ == "__main__":
    asyncio.run(main())
