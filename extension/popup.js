// BioID Chrome Extension — popup.js
// Fusão: Controle de Hardware (Remote) + Gestão WorkLab/RFID (Local)

// -- CONSTANTES --
const WS_URLS     = ['ws://127.0.0.1:15896', 'ws://localhost:15896'];
const STORAGE_KEY = 'bioid_cadastros';
const FINGER_NAMES = ['Polegar Esq','Indicador Esq','Médio Esq','Anelar Esq','Mínimo Esq','Polegar Dir','Indicador Dir','Médio Dir','Anelar Dir','Mínimo Dir'];

// -- ESTADO GLOBAL --
let db              = [];          // cadastros biométricos em memória
let capturedFMD     = null;        // template capturado
let ws              = null;        // WebSocket ativo
let wsReady         = false;
let captureMode     = 'search';    // 'cad' | 'search'
let pontoListening  = false;
let ultimoCartaoUid = '';
let editingWlIndex  = -1;

// -- INICIALIZAÇÃO --
document.addEventListener('DOMContentLoaded', () => {
    try {
        loadDB();
        setupTabs();
        connectWS();
        
        // Listeners Específicos
        document.getElementById('wlBtnAuth')?.addEventListener('click', authWorkLab);
        document.getElementById('btnWlNew')?.addEventListener('click', openWlFormNew);
        document.getElementById('btnWlBack')?.addEventListener('click', () => showViewState('pWorkLab', 'wlList'));
        document.getElementById('btnWlCancel')?.addEventListener('click', () => showViewState('pWorkLab', 'wlList'));
        document.getElementById('wlBtnSave')?.addEventListener('click', saveWorkLabUser);
        document.getElementById('btnSaveBio')?.addEventListener('click', savePerson);
        document.getElementById('btnBackSearch')?.addEventListener('click', () => showViewState('pBiometria', 'bioSearch'));
        document.getElementById('btnStartListen')?.addEventListener('click', iniciarEscutaPonto);
        document.getElementById('btnStopListen')?.addEventListener('click', pararEscutaPonto);
        
        // Iniciar busca automática de digital
        setTimeout(() => startCapture('search'), 600);
    } catch (err) {
        console.error('[BioID] Init falhou:', err);
    }
});

// -- NAVEGAÇÃO --
function setupTabs() {
    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', () => {
            const target = tab.getAttribute('data-tab');
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
            tab.classList.add('active');
            const panel = document.getElementById(target);
            if (panel) panel.classList.add('active');
            
            if (target === 'pWorkLab') checkWorkLabAuth();
            if (target === 'pPonto') atualizarStatusPonto();
        });
    });
}

function showViewState(parentPanelId, stateId) {
    const panel = document.getElementById(parentPanelId);
    if (!panel) return;
    panel.querySelectorAll('.view-state').forEach(v => v.classList.remove('active'));
    const target = document.getElementById(stateId);
    if (target) target.classList.add('active');
}

// -- WEBSOCKET --
async function connectWS() {
    setStatus('connecting');
    const logConsole = document.getElementById('logConsole');

    const openSocket = (url) => new Promise((resolve) => {
        let sock;
        try { sock = new WebSocket(url); sock.binaryType = 'blob'; } catch (e) { resolve(null); return; }
        const timer = setTimeout(() => { sock.close(); resolve(null); }, 1000);
        sock.onopen = () => { clearTimeout(timer); resolve(sock); };
        sock.onerror = () => { clearTimeout(timer); resolve(sock); };
    });

    for (const url of WS_URLS) {
        ws = await openSocket(url);
        if (ws) break;
    }

    if (!ws) { setStatus('disconnected'); return; }

    setStatus('connected');
    wsReady = true;
    wsSend({ Path: '/dp/client/registrar', Data: { ClientVersion: '2.0' } });

    ws.onmessage = (evt) => {
        const raw = evt.data;
        const ts = new Date().toLocaleTimeString();
        const log = document.getElementById('logConsole');
        if (log) {
            log.textContent += `\n[${ts}] ${raw instanceof Blob ? 'Binary Data' : raw}`;
            log.scrollTop = log.scrollHeight;
        }
        try { handleWSMessage(JSON.parse(raw)); } catch (e) {}
    };

    ws.onclose = () => { wsReady = false; setStatus('disconnected'); setTimeout(connectWS, 5000); };
}

function wsSend(obj) { if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj)); }

function handleWSMessage(msg) {
    const path = msg.Path || msg.Event || '';
    const data = msg.Data || msg;

    if (path.includes('DeviceConnected')) toast('Leitor detectado', 's');
    
    if (path === '/dp/fp/sample' || path === 'SamplesAcquired') {
        const sample = (data.Samples || msg.samples || [])[0];
        if (!sample) return;

        if (captureMode === 'cad') {
            capturedFMD = sample;
            toast('Digital capturada!', 's');
        } else {
            const matched = db.find(p => p.fmd === sample);
            if (matched) {
                const foundUI = document.getElementById('foundUser');
                foundUI.innerHTML = `<b style="color:var(--accent)">IDENTIFICADO:</b><br>${matched.nome}`;
                foundUI.style.display = 'block';
                toast(`Bem-vindo, ${matched.nome}`, 's');
            } else {
                showViewState('pBiometria', 'bioRegister');
                toast('Digital não encontrada', 'i');
            }
        }
    }

    if (path === '/rfid/card-read') {
        ultimoCartaoUid = data.uid || '';
        document.getElementById('pUltimoCartao').value = ultimoCartaoUid;
        document.getElementById('pUltimaLeitura').value = new Date().toLocaleTimeString();
        toast(`Cartão lido: ${ultimoCartaoUid}`, 'i');
    }
}

// -- BIOMETRIA --
function startCapture(mode) {
    if (!wsReady) return;
    captureMode = mode;
    if (mode === 'search') {
        const gallery = db.filter(p => p.fmd).map(p => p.fmd);
        if (gallery.length) wsSend({ Path: '/dp/fp/identify', Data: { Gallery: gallery } });
    } else {
        wsSend({ Path: '/dp/fp/acquire', Data: {} });
    }
}

function savePerson() {
    const nome = document.getElementById('iNome').value;
    const worklab_id = document.getElementById('iId').value;
    if (!nome || !capturedFMD) { toast('Nome e Digital são necessários', 'e'); return; }
    
    const person = { id: Date.now(), worklab_id, nome, fmd: capturedFMD, createdAt: new Date().toLocaleDateString() };
    db.push(person);
    saveDB();
    toast('Salvo com sucesso!', 's');
    showViewState('pBiometria', 'bioSearch');
}

// -- WORKLAB LOGIC --
function checkWorkLabAuth() {
    chrome.storage.local.get(['wl_unlocked'], (res) => {
        showViewState('pWorkLab', res.wl_unlocked ? 'wlList' : 'wlAuth');
        if (res.wl_unlocked) loadWorkLabUsers();
    });
}

function authWorkLab() {
    const pass = document.getElementById('wlPassInput').value;
    if (pass === '12f46g63h') {
        chrome.storage.local.set({ wl_unlocked: true }, checkWorkLabAuth);
    } else {
        toast('Senha incorreta', 'e');
    }
}

function loadWorkLabUsers() {
    chrome.storage.local.get(['worklab_users'], (res) => {
        const users = res.worklab_users || [];
        const tbody = document.getElementById('wlTbody');
        if (!tbody) return;
        tbody.innerHTML = users.map((u, i) => `
            <tr>
                <td>${u.id}</td><td>${u.nome}</td><td>${u.user}</td><td>${u.badge}</td>
                <td style="text-align:right;">
                    <button class="btn btn-ghost btn-small edit-wl" data-index="${i}">✎</button>
                    <button class="btn btn-ghost btn-small del-wl" data-index="${i}" style="color:var(--warn)">✕</button>
                </td>
            </tr>
        `).join('');
        tbody.querySelectorAll('.edit-wl').forEach(b => b.onclick = (e) => editWlUser(e.target.dataset.index));
        tbody.querySelectorAll('.del-wl').forEach(b => b.onclick = (e) => deleteWlUser(e.target.dataset.index));
    });
}

function saveWorkLabUser() {
    const user = {
        id: document.getElementById('wlId').value,
        nome: document.getElementById('wlNome').value,
        user: document.getElementById('wlUser').value,
        pass: document.getElementById('wlPass').value,
        badge: document.getElementById('wlBadge').value
    };
    chrome.storage.local.get(['worklab_users'], (res) => {
        let users = res.worklab_users || [];
        if (editingWlIndex >= 0) users[editingWlIndex] = user; else users.push(user);
        chrome.storage.local.set({ worklab_users: users }, () => {
            toast('Usuário salvo!');
            showViewState('pWorkLab', 'wlList');
            loadWorkLabUsers();
        });
    });
}

function editWlUser(index) {
    chrome.storage.local.get(['worklab_users'], (res) => {
        const u = res.worklab_users[index];
        editingWlIndex = index;
        document.getElementById('wlId').value = u.id;
        document.getElementById('wlNome').value = u.nome;
        document.getElementById('wlUser').value = u.user;
        document.getElementById('wlPass').value = u.pass;
        document.getElementById('wlBadge').value = u.badge;
        showViewState('pWorkLab', 'wlForm');
    });
}

function deleteWlUser(index) {
    if (confirm("Excluir este usuário?")) {
        chrome.storage.local.get(['worklab_users'], (res) => {
            let users = res.worklab_users || [];
            users.splice(index, 1);
            chrome.storage.local.set({ worklab_users: users }, loadWorkLabUsers);
        });
    }
}

function openWlFormNew() {
    editingWlIndex = -1;
    ['wlId','wlNome','wlUser','wlPass','wlBadge'].forEach(id => document.getElementById(id).value = "");
    showViewState('pWorkLab', 'wlForm');
}

// -- PONTO --
function iniciarEscutaPonto() { wsSend({ Path: '/rfid/start-listen', Data: {} }); document.getElementById('pStatusEscuta').value = "Escutando..."; }
function pararEscutaPonto() { wsSend({ Path: '/rfid/stop-listen', Data: {} }); document.getElementById('pStatusEscuta').value = "Inativo"; }
function atualizarStatusPonto() { wsSend({ Path: '/rfid/status', Data: {} }); }

// -- HELPERS --
function setStatus(s) {
    const dot = document.getElementById('dot');
    const lbl = document.getElementById('statusLabel');
    if (s === 'connected') { dot.classList.add('on'); lbl.innerText = "AGENTE ONLINE"; }
    else { dot.classList.remove('on'); lbl.innerText = s === 'connecting' ? "CONECTANDO..." : "AGENTE OFFLINE"; }
}

function toast(m, t = 'i') {
    const c = document.getElementById('toasts');
    const el = document.createElement('div');
    el.className = `toast ${t}`;
    el.innerText = m;
    c.appendChild(el);
    setTimeout(() => el.remove(), 3000);
}

function loadDB() { chrome.storage.local.get(['cadastros_db'], (res) => { db = res.cadastros_db || []; }); }
function saveDB() { chrome.storage.local.set({ cadastros_db: db }); }
