#!/usr/bin/env python3
import asyncio
import json
import threading
import tkinter as tk
from pathlib import Path
from tkinter import messagebox

import websockets

import bio_agent

APP_TITLE = "LabSync | BioID Agent"
WS_URL = "ws://localhost:15896"
CONFIG_PATH = Path.home() / ".bioid-agent-config.json"


def load_config() -> dict:
    if not CONFIG_PATH.exists():
        return {"attendance_db_url": "", "device_name": "Leitor 125kHz (Keyboard Wedge)"}
    try:
        return json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    except Exception:
        return {"attendance_db_url": "", "device_name": "Leitor 125kHz (Keyboard Wedge)"}


def save_config(data: dict) -> None:
    CONFIG_PATH.write_text(json.dumps(data, indent=2, ensure_ascii=True), encoding="utf-8")


class AgentRuntime:
    def __init__(self, host: str = "localhost", port: int = 15896):
        self.host = host
        self.port = port
        self._thread = None
        self._loop = None
        self._stop_event = None
        self._started_event = threading.Event()
        self._start_error = None
        self._running = False

    @property
    def running(self) -> bool:
        return self._running

    def start(self, db_url: str):
        if self._running:
            return True, None

        bio_agent.attendance.db_url = db_url.strip()
        self._start_error = None
        self._started_event.clear()
        self._thread = threading.Thread(target=self._run_server_thread, daemon=True)
        self._thread.start()
        started = self._started_event.wait(timeout=5)
        if not started:
            return False, "Timeout ao iniciar servidor local na porta 15896."
        if self._start_error:
            return False, self._start_error
        self._running = True
        return True, None

    def stop(self):
        if not self._running:
            return True, None
        self._running = False
        if self._loop and self._stop_event:
            self._loop.call_soon_threadsafe(self._stop_event.set)
        if self._thread:
            self._thread.join(timeout=4)
        return True, None

    def _run_server_thread(self):
        self._loop = asyncio.new_event_loop()
        asyncio.set_event_loop(self._loop)
        self._stop_event = asyncio.Event()
        self._loop.run_until_complete(self._serve_until_stop())
        self._loop.close()

    async def _serve_until_stop(self):
        try:
            server = await websockets.serve(bio_agent.handle_client, self.host, self.port)
            self._started_event.set()
            await self._stop_event.wait()
            server.close()
            await server.wait_closed()
        except Exception as exc:
            self._start_error = str(exc)
            self._started_event.set()


class App:
    def __init__(self, root: tk.Tk):
        self.root = root
        self.root.title(APP_TITLE)
        self.root.geometry("980x700")
        self.root.minsize(900, 640)
        self.cfg = load_config()
        self.runtime = AgentRuntime()
        self._build_ui()
        self._schedule_health_check()

    def _build_ui(self):
        bg = "#0d0f12"
        surface = "#141720"
        border = "#252a3a"
        text = "#e8eaf0"
        dim = "#9ca3af"
        accent = "#4fffb0"
        warn = "#ff6b6b"
        self.colors = {"bg": bg, "surface": surface, "border": border, "text": text, "dim": dim, "accent": accent, "warn": warn}

        self.root.configure(bg=bg)
        frame = tk.Frame(self.root, bg=bg, padx=14, pady=14)
        frame.pack(fill="both", expand=True)

        header = tk.Frame(frame, bg=bg)
        header.pack(fill="x")
        tk.Label(header, text="Painel do Agente LabSync | BioID", font=("Segoe UI Semibold", 18), fg=text, bg=bg).pack(side="left")
        self.health_badge = tk.Label(header, text="OFFLINE", fg=warn, bg=bg, font=("Segoe UI Semibold", 10))
        self.health_badge.pack(side="right")

        config_wrap, config_box = self._make_card(frame, "Configuracao")
        config_wrap.pack(fill="x", pady=(12, 8))
        tk.Label(config_box, text="Dispositivo", fg=dim, bg=surface, font=("Segoe UI", 10)).grid(row=0, column=0, sticky="w", padx=8, pady=6)
        self.device_var = tk.StringVar(value=self.cfg.get("device_name", ""))
        self.device_entry = self._entry(config_box, self.device_var)
        self.device_entry.grid(row=0, column=1, sticky="ew", padx=8, pady=6)
        tk.Label(config_box, text="PostgreSQL URL", fg=dim, bg=surface, font=("Segoe UI", 10)).grid(row=1, column=0, sticky="w", padx=8, pady=6)
        self.db_url_var = tk.StringVar(value=self.cfg.get("attendance_db_url", ""))
        self.db_entry = self._entry(config_box, self.db_url_var, show="*")
        self.db_entry.grid(row=1, column=1, sticky="ew", padx=8, pady=6)
        config_box.columnconfigure(1, weight=1)
        btns = tk.Frame(config_box, bg=surface)
        btns.grid(row=2, column=0, columnspan=2, sticky="e", padx=8, pady=8)
        self._button(btns, "Salvar Config", self.save_config_clicked).pack(side="left", padx=4)
        self._button(btns, "Validar Banco", self.test_db, ghost=True).pack(side="left", padx=4)

        ops_wrap, ops_box = self._make_card(frame, "Operacao")
        ops_wrap.pack(fill="x", pady=(0, 8))
        self.btn_start = self._button(ops_box, "Iniciar Agente", self.start_agent)
        self.btn_stop = self._button(ops_box, "Parar Agente", self.stop_agent, ghost=True)
        self.btn_listen_on = self._button(ops_box, "Iniciar Escuta RFID", lambda: self.send_simple("/rfid/start-listen"))
        self.btn_listen_off = self._button(ops_box, "Parar Escuta RFID", lambda: self.send_simple("/rfid/stop-listen"), ghost=True)
        self.btn_test = self._button(ops_box, "Teste de Conexao", lambda: self.send_simple("/agent/health"), ghost=True)
        for btn in [self.btn_start, self.btn_stop, self.btn_listen_on, self.btn_listen_off, self.btn_test]:
            btn.pack(side="left", padx=6, pady=8)

        chk_wrap, chk_box = self._make_card(frame, "Checklist de Saude")
        chk_wrap.pack(fill="x", pady=(0, 8))
        self.status_vars = {
            "agent": tk.StringVar(value="OFF"),
            "ws": tk.StringVar(value="OFF"),
            "rfid": tk.StringVar(value="OFF"),
            "reader": tk.StringVar(value="OFF"),
            "db": tk.StringVar(value="OFF"),
            "ext": tk.StringVar(value="OFF"),
            "uid": tk.StringVar(value="-"),
        }
        self._kv_row(chk_box, 0, "Agente", self.status_vars["agent"])
        self._kv_row(chk_box, 1, "WebSocket local", self.status_vars["ws"])
        self._kv_row(chk_box, 2, "Escuta RFID", self.status_vars["rfid"])
        self._kv_row(chk_box, 3, "Leitor reconhecido", self.status_vars["reader"])
        self._kv_row(chk_box, 4, "Banco configurado", self.status_vars["db"])
        self._kv_row(chk_box, 5, "Extensao conectada", self.status_vars["ext"])
        self._kv_row(chk_box, 6, "Ultimo cartao", self.status_vars["uid"])

        log_wrap, log_box = self._make_card(frame, "Eventos")
        log_wrap.pack(fill="both", expand=True)
        self.log = tk.Text(
            log_box,
            height=12,
            state="disabled",
            font=("Consolas", 10),
            bg="#050608",
            fg=accent,
            insertbackground=accent,
            bd=1,
            relief="solid",
            highlightthickness=1,
            highlightbackground=border,
            highlightcolor=border,
        )
        self.log.pack(fill="both", expand=True, padx=8, pady=8)
        self._refresh_button_states()

    def _make_card(self, parent: tk.Widget, title: str):
        wrap = tk.Frame(parent, bg=self.colors["surface"], bd=1, relief="solid", highlightthickness=1, highlightbackground=self.colors["border"])
        tk.Label(wrap, text=title, fg=self.colors["text"], bg=self.colors["surface"], font=("Segoe UI Semibold", 10)).pack(anchor="w", padx=10, pady=(8, 4))
        content = tk.Frame(wrap, bg=self.colors["surface"])
        content.pack(fill="both", expand=True, padx=6, pady=(0, 8))
        return wrap, content

    def _entry(self, parent: tk.Widget, text_var: tk.StringVar, show: str | None = None) -> tk.Entry:
        return tk.Entry(
            parent,
            textvariable=text_var,
            show=show if show else "",
            bg="#1c2030",
            fg=self.colors["text"],
            insertbackground=self.colors["text"],
            relief="solid",
            bd=1,
            highlightthickness=1,
            highlightbackground=self.colors["border"],
            highlightcolor=self.colors["accent"],
        )

    def _button(self, parent: tk.Widget, text: str, command, ghost: bool = False) -> tk.Button:
        if ghost:
            return tk.Button(
                parent,
                text=text,
                command=command,
                bg="#141720",
                fg=self.colors["dim"],
                activebackground="#1c2030",
                activeforeground=self.colors["text"],
                relief="solid",
                bd=1,
                highlightthickness=0,
                padx=12,
                pady=6,
            )
        return tk.Button(
            parent,
            text=text,
            command=command,
            bg=self.colors["accent"],
            fg="#0d0f12",
            activebackground="#3de89e",
            activeforeground="#0d0f12",
            relief="flat",
            bd=0,
            padx=12,
            pady=6,
        )

    def _kv_row(self, parent, row, label, var):
        tk.Label(parent, text=label, fg=self.colors["dim"], bg=self.colors["surface"], font=("Segoe UI", 10)).grid(row=row, column=0, sticky="w", padx=8, pady=4)
        tk.Label(parent, textvariable=var, fg=self.colors["text"], bg=self.colors["surface"], font=("Segoe UI Semibold", 10)).grid(row=row, column=1, sticky="w", padx=8, pady=4)

    def append_log(self, text: str):
        self.log.configure(state="normal")
        self.log.insert("end", f"{text}\n")
        self.log.see("end")
        self.log.configure(state="disabled")

    def save_config_clicked(self):
        cfg = {
            "device_name": self.device_var.get().strip(),
            "attendance_db_url": self.db_url_var.get().strip(),
        }
        save_config(cfg)
        self.cfg = cfg
        self.append_log("[OK] Configuracao salva.")

    def start_agent(self):
        self.save_config_clicked()
        ok, err = self.runtime.start(self.db_url_var.get())
        if not ok:
            self.append_log(f"[ERRO] {err}")
            messagebox.showerror(APP_TITLE, err)
            return
        self.append_log("[OK] Servidor local iniciado em ws://localhost:15896")
        self.status_vars["agent"].set("ON")
        self._refresh_button_states()

    def stop_agent(self):
        self.runtime.stop()
        self.append_log("[OK] Servidor local finalizado.")
        self.status_vars["agent"].set("OFF")
        self.status_vars["ws"].set("OFF")
        self.health_badge.config(text="OFFLINE", foreground="#b91c1c")
        self._refresh_button_states()

    def _refresh_button_states(self):
        if self.runtime.running:
            self.btn_start.config(state="disabled")
            self.btn_stop.config(state="normal")
            self.btn_listen_on.config(state="normal")
            self.btn_listen_off.config(state="normal")
        else:
            self.btn_start.config(state="normal")
            self.btn_stop.config(state="disabled")
            self.btn_listen_on.config(state="disabled")
            self.btn_listen_off.config(state="disabled")

    def send_simple(self, path: str):
        def _worker():
            try:
                asyncio.run(self._send_once({"Path": path, "Data": {}}))
            except Exception as exc:
                self.append_log(f"[ERRO] {exc}")
        threading.Thread(target=_worker, daemon=True).start()

    def test_db(self):
        url = self.db_url_var.get().strip()
        if not url.startswith("postgresql://"):
            messagebox.showerror(APP_TITLE, "ATTENDANCE_DB_URL invalida.")
            return
        self.append_log("[OK] Formato da URL PostgreSQL valido.")

    async def _send_once(self, payload: dict):
        want = payload.get("Path")
        async with websockets.connect(WS_URL) as ws:
            await ws.send(json.dumps(payload))
            try:
                for _ in range(24):
                    msg = await asyncio.wait_for(ws.recv(), timeout=4)
                    if want and want == "/agent/health":
                        try:
                            parsed = json.loads(msg)
                            if parsed.get("Path") != "/agent/health":
                                continue
                        except json.JSONDecodeError:
                            continue
                    self.append_log(f"[WS] {msg}")
                    break
                else:
                    self.append_log("[WS] Resposta esperada nao recebida.")
            except asyncio.TimeoutError:
                self.append_log("[WS] Timeout aguardando resposta.")

    def _schedule_health_check(self):
        def _worker():
            try:
                data = asyncio.run(self._fetch_health())
                self.root.after(0, lambda: self._apply_health(data))
            except Exception:
                self.root.after(0, lambda: self._apply_health(None))
            finally:
                self.root.after(1200, self._schedule_health_check)

        threading.Thread(target=_worker, daemon=True).start()

    async def _fetch_health(self):
        """Servidor envia mensagens automaticas ao conectar; ignorar ate o JSON /agent/health."""
        async with websockets.connect(WS_URL) as ws:
            await ws.send(json.dumps({"Path": "/agent/health", "Data": {}}))
            for _ in range(24):
                raw = await asyncio.wait_for(ws.recv(), timeout=4)
                msg = json.loads(raw)
                if msg.get("Path") == "/agent/health":
                    data = msg.get("Data")
                    return data if isinstance(data, dict) else {}
            return None

    def _apply_health(self, data):
        self.status_vars["agent"].set("ON" if self.runtime.running else "OFF")
        if data is None:
            self.status_vars["ws"].set("OFF")
            self.status_vars["rfid"].set("OFF")
            self.status_vars["reader"].set("OFF")
            self.status_vars["db"].set("OFF")
            self.status_vars["ext"].set("OFF")
            if self.runtime.running:
                self.health_badge.config(text="AGUARDANDO WS", foreground="#b45309")
            else:
                self.health_badge.config(text="OFFLINE", foreground="#b91c1c")
            return

        st = str(data.get("status") or "").lower()
        ok_status = st in ("ok", "up")

        self.status_vars["ws"].set("ON")
        self.status_vars["rfid"].set("ON" if data.get("rfid_listening") else "OFF")
        self.status_vars["reader"].set("ON" if data.get("has_pynput") else "OFF")
        self.status_vars["db"].set("ON" if data.get("db_configured") else "OFF")
        ext_on = bool(data.get("extension_connected"))
        self.status_vars["ext"].set("ON" if ext_on else "OFF")
        self.status_vars["uid"].set(data.get("last_uid") or "-")

        if ok_status:
            self.health_badge.config(text="ONLINE", foreground="#15803d")
        else:
            self.health_badge.config(text="DEGRADADO", foreground="#b45309")
        self._refresh_button_states()


def main():
    root = tk.Tk()
    app = App(root)

    def _on_close():
        app.runtime.stop()
        root.destroy()

    root.protocol("WM_DELETE_WINDOW", _on_close)
    root.mainloop()


if __name__ == "__main__":
    main()
