#!/usr/bin/env python3
"""
BioAgent V2 - Identificação Real (1:N)
Usa libfprint-2.0 nativamente para capturar templates biométricos.
"""

import asyncio
import json
import logging
import base64
import gi

gi.require_version('FPrint', '2.0')
from gi.repository import FPrint, GLib

try:
    import websockets
except ImportError:
    print("ERRO: Módulo 'websockets' necessário. Instale com: pip install websockets")
    exit(1)

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(message)s')

class BioAgent:
    def __init__(self):
        self.device = None
        self.find_device()

    def find_device(self):
        try:
            # Recriamos o contexto do zero em cada tentativa para evitar
            # handles USB mortos (o erro No Such Device).
            self.ctx = FPrint.Context.new()
            self.ctx.enumerate() 
            devices = self.ctx.get_devices()
            
            if not devices:
                logging.error("Nenhum leitor biométrico detectado no barramento USB.")
                self.device = None
                return False
            
            self.device = devices[0]
            logging.info(f"Dispositivo reiniciado e localizado com sucesso: {self.device.get_driver()}")
            return True
        except Exception as e:
            logging.error(f"Erro ao inicializar contexto libfprint: {e}")
            return False

    def capture_finger(self):
        """Captura um template para cadastro"""
        if not self.find_device(): return None, "Leitor não encontrado. Verifique a conexão USB."
        try:
            if not self.device.is_open(): self.device.open_sync(None)
            logging.info("Aguardando toque para CADASTRO...")
            
            template = FPrint.Print.new(self.device)
            # Enroll: capturamos o objeto Print
            print_obj = self.device.enroll_sync(template, None, None, None)
            
            # Serializa
            data = print_obj.serialize()
            return base64.b64encode(data).decode('utf-8'), None
        except Exception as e:
            return None, str(e)
        finally:
            if self.device and self.device.is_open(): self.device.close_sync(None)

    def identify_finger(self, existing_templates_b64):
        """Gira um loop de matching (1:N) para identificar quem é o dedo"""
        if not self.find_device(): return None, "Leitor não encontrado. Verifique a conexão USB."
        try:
            if not self.device.is_open(): self.device.open_sync(None)
            logging.info("Aguardando toque para IDENTIFICAÇÃO (1:N)...")

            # 1. Faz uma captura simples (verify_sync requer um template para comparar)
            # No fprint-2.0, para identificar, o ideal é capturar e comparar.
            # Como o uru4000 não tem match em hardware, fazemos em host:
            
            for base64_str in existing_templates_b64:
                try:
                    raw_data = base64.b64decode(base64_str)
                    stored_print = FPrint.Print.deserialize(raw_data)
                    
                    # Tenta verificar o toque atual contra este template
                    # O verify_sync retorna (resultado, print_objeto, erro)
                    matched, _, _ = self.device.verify_sync(stored_print, None, None, None)
                    
                    if matched:
                        logging.info("Match encontrado via LibFprint!")
                        return base64_str, None # Retorna o template que bateu
                except Exception:
                    continue
            
            return None, "Digital não reconhecida em nossa base."
        except Exception as e:
            return None, str(e)
        finally:
            if self.device and self.device.is_open(): self.device.close_sync(None)

agent = BioAgent()

async def handle_client(websocket):
    logging.info("Cliente Web Conectado.")
    
    # Notificar presença do hardware
    await websocket.send(json.dumps({
        "Path": "/dp/fp/device/connected", 
        "Data": {}
    }))

    try:
        async for message in websocket:
            msg = json.loads(message)
            path = msg.get("Path", "")

            if path == "/dp/fp/acquire":
                logging.info("Iniciando captura.")
                template, err = agent.capture_finger()
                if err:
                    await websocket.send(json.dumps({"Path": "/dp/reply/error", "Data": {"Reason": err}}))
                else:
                    await websocket.send(json.dumps({
                        "Path": "/dp/fp/sample",
                        "Data": { "Samples": [template], "HardwareLog": "Sucesso LibFprint" }
                    }))

            elif path == "/dp/fp/identify":
                logging.info("Iniciando Identificação 1:N.")
                templates = msg.get("Data", {}).get("Gallery", [])
                matched_b64, err = agent.identify_finger(templates)
                
                if err:
                    await websocket.send(json.dumps({"Path": "/dp/reply/error", "Data": {"Reason": err}}))
                else:
                    await websocket.send(json.dumps({
                        "Path": "/dp/fp/sample", # Respondemos com o template que deu MATCH
                        "Data": { "Samples": [matched_b64], "HardwareLog": "Usuário Identificado" }
                    }))

    except Exception as e:
        logging.error(f"Erro no socket: {e}")

async def main():
    port = 15896
    print(f"=== Agente Mavi Bio Pro (LibFprint 2.0) em ws://localhost:{port} ===")
    async with websockets.serve(handle_client, "localhost", port):
        await asyncio.Future()

if __name__ == "__main__":
    asyncio.run(main())
