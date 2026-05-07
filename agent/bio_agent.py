#!/usr/bin/env python3
"""
BioAgent V3 - Biometria + Ponto 125kHz.

Inclui:
- Fluxo biometrico legado (quando libfprint estiver disponivel)
- Modo de escuta de cartao 125kHz (keyboard wedge) em background
- Persistencia de ponto em PostgreSQL
"""

import asyncio
import base64
import json
import logging
import os
import threading
from datetime import datetime, timezone

try:
    import websockets
except ImportError:
    print("ERRO: Módulo 'websockets' necessário. Instale com: pip install websockets")
    raise SystemExit(1)

try:
    import gi
    gi.require_version("FPrint", "2.0")
    from gi.repository import FPrint
    HAS_FPRINT = True
except Exception:
    HAS_FPRINT = False

try:
    from pynput import keyboard
    HAS_PYNPUT = True
except Exception:
    HAS_PYNPUT = False

try:
    import psycopg2
    from psycopg2.extras import Json
    HAS_PG = True
except Exception:
    HAS_PG = False

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(message)s")


class BioAgent:
    def __init__(self):
        self.device = None
        if HAS_FPRINT:
            self.find_device()

    def find_device(self):
        if not HAS_FPRINT:
            return False
        try:
            self.ctx = FPrint.Context.new()
            self.ctx.enumerate()
            devices = self.ctx.get_devices()
            if not devices:
                logging.error("Nenhum leitor biometrico detectado no barramento USB.")
                self.device = None
                return False
            self.device = devices[0]
            logging.info("Leitor biometrico inicializado: %s", self.device.get_driver())
            return True
        except Exception as exc:
            logging.error("Erro ao inicializar libfprint: %s", exc)
            return False

    def capture_finger(self):
        if not HAS_FPRINT:
            return None, "Biometria indisponivel neste sistema operacional."
        if not self.find_device():
            return None, "Leitor biometrico nao encontrado."
        try:
            if not self.device.is_open():
                self.device.open_sync(None)
            logging.info("Aguardando toque para cadastro biometrico...")
            template = FPrint.Print.new(self.device)
            print_obj = self.device.enroll_sync(template, None, None, None)
            data = print_obj.serialize()
            return base64.b64encode(data).decode("utf-8"), None
        except Exception as exc:
            return None, str(exc)
        finally:
            if self.device and self.device.is_open():
                self.device.close_sync(None)

    def identify_finger(self, existing_templates_b64):
        if not HAS_FPRINT:
            return None, "Identificacao biometrica indisponivel neste sistema operacional."
        if not self.find_device():
            return None, "Leitor biometrico nao encontrado."
        try:
            if not self.device.is_open():
                self.device.open_sync(None)
            logging.info("Aguardando toque para identificacao 1:N...")
            for base64_str in existing_templates_b64:
                try:
                    raw_data = base64.b64decode(base64_str)
                    stored_print = FPrint.Print.deserialize(raw_data)
                    matched, _, _ = self.device.verify_sync(stored_print, None, None, None)
                    if matched:
                        return base64_str, None
                except Exception:
                    continue
            return None, "Digital nao reconhecida."
        except Exception as exc:
            return None, str(exc)
        finally:
            if self.device and self.device.is_open():
                self.device.close_sync(None)


class AttendanceService:
    def __init__(self):
        self.db_url = os.getenv("ATTENDANCE_DB_URL", "")
        self.listen_enabled = False
        self._listener = None
        self._thread = None
        self._buffer = ""
        self._lock = threading.Lock()
        self.last_uid = ""
        self.pending_uid = ""
        self.event_loop = None
        self.clients = set()

    def configure_runtime(self, loop, clients):
        self.event_loop = loop
        self.clients = clients

    def start_listen(self):
        if not HAS_PYNPUT:
            return False, "Dependencia ausente: instale pynput para escuta de cartao."
        if self.listen_enabled:
            return True, None
        self.listen_enabled = True
        self._thread = threading.Thread(target=self._run_listener, daemon=True)
        self._thread.start()
        logging.info("Escuta RFID iniciada.")
        return True, None

    def stop_listen(self):
        self.listen_enabled = False
        if self._listener:
            self._listener.stop()
            self._listener = None
        logging.info("Escuta RFID parada.")
        return True, None

    def _run_listener(self):
        def on_press(key):
            if not self.listen_enabled:
                return False
            try:
                if key == keyboard.Key.enter:
                    uid = self._buffer.strip()
                    self._buffer = ""
                    if uid:
                        with self._lock:
                            self.last_uid = uid
                            self.pending_uid = uid
                        self._emit_card_event(uid)
                    return
                if hasattr(key, "char") and key.char:
                    self._buffer += key.char
            except Exception as exc:
                logging.error("Falha durante leitura RFID: %s", exc)

        with keyboard.Listener(on_press=on_press) as listener:
            self._listener = listener
            listener.join()

    def _emit_card_event(self, uid):
        if not self.event_loop:
            return

        payload = {
            "Path": "/rfid/card-read",
            "Data": {
                "uid": uid,
                "read_at": datetime.now(timezone.utc).isoformat()
            }
        }
        for ws in list(self.clients):
            asyncio.run_coroutine_threadsafe(_safe_send(ws, payload), self.event_loop)

    def _ensure_schema(self, conn):
        with conn.cursor() as cur:
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS attendance_logs (
                    id BIGSERIAL PRIMARY KEY,
                    card_uid TEXT NOT NULL,
                    collaborator_id TEXT NOT NULL,
                    collaborator_name TEXT NOT NULL,
                    photo_url TEXT,
                    event_type TEXT NOT NULL DEFAULT 'clock_in_out',
                    event_at TIMESTAMPTZ NOT NULL,
                    source TEXT NOT NULL DEFAULT 'bioid_extension',
                    metadata JSONB NOT NULL DEFAULT '{}'::jsonb
                );
                """
            )
            cur.execute(
                "CREATE INDEX IF NOT EXISTS idx_attendance_logs_card_uid ON attendance_logs(card_uid);"
            )
            cur.execute(
                "CREATE INDEX IF NOT EXISTS idx_attendance_logs_collab_event ON attendance_logs(collaborator_id, event_at DESC);"
            )
        conn.commit()

    def save_punch(self, payload):
        if not HAS_PG:
            return False, "Dependencia ausente: instale psycopg2-binary para persistencia."
        if not self.db_url:
            return False, "ATTENDANCE_DB_URL nao configurada no ambiente."

        card_uid = (payload.get("card_uid") or self.pending_uid or "").strip()
        collaborator_id = (payload.get("collaborator_id") or "").strip()
        collaborator_name = (payload.get("collaborator_name") or "").strip()
        photo_url = (payload.get("photo_url") or "").strip() or None

        if not card_uid:
            return False, "Card UID obrigatorio para registro de ponto."
        if not collaborator_id or not collaborator_name:
            return False, "collaborator_id e collaborator_name sao obrigatorios."

        try:
            conn = psycopg2.connect(self.db_url, connect_timeout=5)
            self._ensure_schema(conn)
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO attendance_logs (
                        card_uid,
                        collaborator_id,
                        collaborator_name,
                        photo_url,
                        event_type,
                        event_at,
                        source,
                        metadata
                    )
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                    """,
                    (
                        card_uid,
                        collaborator_id,
                        collaborator_name,
                        photo_url,
                        "clock_in_out",
                        datetime.now(timezone.utc),
                        "bioid_agent",
                        Json({"host": os.getenv("COMPUTERNAME", "unknown")}),
                    ),
                )
            conn.commit()
            conn.close()
            self.pending_uid = ""
            return True, None
        except Exception as exc:
            logging.error("Erro ao salvar ponto no PostgreSQL: %s", exc)
            return False, str(exc)


async def _safe_send(websocket, payload):
    try:
        await websocket.send(json.dumps(payload))
    except Exception:
        return


agent = BioAgent()
attendance = AttendanceService()
connected_clients = set()
# Clientes que enviaram handshake da extensao Chrome (popup)
extension_clients = set()


async def handle_client(websocket):
    connected_clients.add(websocket)
    attendance.configure_runtime(asyncio.get_running_loop(), connected_clients)
    logging.info("Cliente Web conectado.")

    await _safe_send(websocket, {"Path": "/dp/fp/device/connected", "Data": {}})
    await _safe_send(
        websocket,
        {"Path": "/rfid/status", "Data": {"listening": attendance.listen_enabled, "last_uid": attendance.last_uid}},
    )

    try:
        async for message in websocket:
            msg = json.loads(message)
            path = msg.get("Path", "")
            data = msg.get("Data", {}) or {}

            if path == "/dp/client/registrar":
                extension_clients.add(websocket)

            elif path == "/dp/fp/acquire":
                template, err = agent.capture_finger()
                if err:
                    await _safe_send(websocket, {"Path": "/dp/reply/error", "Data": {"Reason": err}})
                else:
                    await _safe_send(
                        websocket,
                        {"Path": "/dp/fp/sample", "Data": {"Samples": [template], "HardwareLog": "Biometria capturada"}},
                    )

            elif path == "/dp/fp/identify":
                templates = data.get("Gallery", [])
                matched_b64, err = agent.identify_finger(templates)
                if err:
                    await _safe_send(websocket, {"Path": "/dp/reply/error", "Data": {"Reason": err}})
                else:
                    await _safe_send(
                        websocket,
                        {"Path": "/dp/fp/sample", "Data": {"Samples": [matched_b64], "HardwareLog": "Usuario identificado"}},
                    )

            elif path == "/rfid/start-listen":
                ok, err = attendance.start_listen()
                if err:
                    await _safe_send(websocket, {"Path": "/dp/reply/error", "Data": {"Reason": err}})
                else:
                    await _safe_send(
                        websocket,
                        {"Path": "/rfid/status", "Data": {"listening": ok, "last_uid": attendance.last_uid}},
                    )

            elif path == "/rfid/stop-listen":
                attendance.stop_listen()
                await _safe_send(
                    websocket,
                    {"Path": "/rfid/status", "Data": {"listening": False, "last_uid": attendance.last_uid}},
                )

            elif path == "/rfid/status":
                await _safe_send(
                    websocket,
                    {
                        "Path": "/rfid/status",
                        "Data": {"listening": attendance.listen_enabled, "last_uid": attendance.last_uid},
                    },
                )

            elif path == "/rfid/punch":
                ok, err = attendance.save_punch(data)
                if err:
                    await _safe_send(websocket, {"Path": "/dp/reply/error", "Data": {"Reason": err}})
                else:
                    await _safe_send(websocket, {"Path": "/rfid/punch/saved", "Data": {"ok": ok}})

            elif path == "/agent/health":
                await _safe_send(
                    websocket,
                    {
                        "Path": "/agent/health",
                        "Data": {
                            "status": "ok",
                            "ws_clients": len(connected_clients),
                            "extension_connected": len(extension_clients) > 0,
                            "rfid_listening": attendance.listen_enabled,
                            "last_uid": attendance.last_uid,
                            "has_pynput": HAS_PYNPUT,
                            "has_postgres": HAS_PG,
                            "has_fprint": HAS_FPRINT,
                            "db_configured": bool(attendance.db_url),
                        },
                    },
                )

    except Exception as exc:
        logging.error("Erro no socket: %s", exc)
    finally:
        connected_clients.discard(websocket)
        extension_clients.discard(websocket)


async def main():
    port = 15896
    print(f"=== Agente Mavi Bio V3 em ws://localhost:{port} ===")
    async with websockets.serve(handle_client, "localhost", port):
        await asyncio.Future()


if __name__ == "__main__":
    asyncio.run(main())
