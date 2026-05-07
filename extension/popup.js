// ─────────────────────────────────────────────────────────────────────────────
// BioID Chrome Extension — popup.js
// Comunicacao com agente local (IB Watson Mini + RFID) via WebSocket
// ─────────────────────────────────────────────────────────────────────────────

// ── CONSTANTES ───────────────────────────────────────────────────────────────
const WS_URLS     = ['ws://127.0.0.1:15896', 'ws://localhost:15896'];
const STORAGE_KEY = 'bioid_cadastros';
const FINGER_NAMES = [
  'Polegar Esq','Indicador Esq','Médio Esq','Anelar Esq','Mínimo Esq',
  'Polegar Dir','Indicador Dir','Médio Dir','Anelar Dir','Mínimo Dir'
];

// ── ESTADO ───────────────────────────────────────────────────────────────────
let db              = [];          // cadastros em memória (espelho do storage)
let capturedFMD     = null;        // template capturado (base64 string)
let selectedFinger  = 6;          // Indicador Direito (padrão)
let deleteTarget    = null;
let ws              = null;        // WebSocket ativo
let wsReady         = false;
let scanSimInterval = null;
let captureMode     = 'cad';       // modo de operação: 'cad' | 'search'
let pontoListening  = false;
let ultimoCartaoUid = '';

const fpSimHTML = `
<div class="fp-sim">
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a9 9 0 0 1 9 9c0 3.6-2 6-4 8l-5 3-5-3c-2-2-4-4.4-4-8a9 9 0 0 1 9-9z"/><path d="M9 12c0-1.7 1.3-3 3-3s3 1.3 3 3"/></svg>
  <div class="fp-colored">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a9 9 0 0 1 9 9c0 3.6-2 6-4 8l-5 3-5-3c-2-2-4-4.4-4-8a9 9 0 0 1 9-9z"/><path d="M9 12c0-1.7 1.3-3 3-3s3 1.3 3 3"/></svg>
  </div>
  <div class="laser"></div>
</div>
`;

// ── INICIALIZAÇÃO ─────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  try {
  loadDB();
  renderTable();
  setupTabs();
  setupFingerGrid();
  setupCpfMask();
  connectWS();

  document.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    
    if (btn.id === 'btnCapture') startCapture('cad');
    else if (btn.id === 'btnStartSearch') startCapture('search');
    else if (btn.id === 'btnSave') savePerson();
    else if (btn.id === 'btnReset') resetForm();
    else if (btn.id === 'btnResetSearch') resetSearch();
    else if (btn.id === 'btnStartListen') iniciarEscutaPonto();
    else if (btn.id === 'btnStopListen') pararEscutaPonto();
    else if (btn.id === 'btnRegistrarPonto') registrarPontoManual();
    else if (btn.id === 'btnCancelDel') closeModal();
    else if (btn.id === 'btnConfirmDel') confirmDel();
    else if (btn.classList.contains('edit-btn')) editPerson(Number(btn.dataset.id));
    else if (btn.classList.contains('del-btn')) openDel(Number(btn.dataset.id));
  });

  const searchInput = document.getElementById('search');
  if (searchInput) searchInput.addEventListener('input', renderTable);
  const fotoInput = document.getElementById('pColabFoto');
  if (fotoInput) fotoInput.addEventListener('input', updatePhotoSlot);
  
  // Auto-iniciar busca
  setTimeout(() => startCapture('search'), 600);
  setTimeout(atualizarStatusPonto, 900);
  } catch (err) {
    console.error('[BioID popup] init falhou:', err);
  }
});

// ── TABS ─────────────────────────────────────────────────────────────────────
function setupTabs() {
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(tab.dataset.tab).classList.add('active');
      if (tab.dataset.tab === 'pLista') renderTable();
    });
  });
}

// ── DEDO SELETOR ─────────────────────────────────────────────────────────────
function setupFingerGrid() {
  document.querySelectorAll('.fgr').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.fgr').forEach(b => b.classList.remove('sel'));
      btn.classList.add('sel');
      selectedFinger = parseInt(btn.dataset.f);
    });
  });
}

// ── MÁSCARA CPF ──────────────────────────────────────────────────────────────
function setupCpfMask() {
  const el = document.getElementById('iCpf');
  if (!el) return;
  el.addEventListener('input', function () {
    let v = this.value.replace(/\D/g, '').slice(0, 11);
    if      (v.length > 9) v = v.slice(0,3)+'.'+v.slice(3,6)+'.'+v.slice(6,9)+'-'+v.slice(9);
    else if (v.length > 6) v = v.slice(0,3)+'.'+v.slice(3,6)+'.'+v.slice(6);
    else if (v.length > 3) v = v.slice(0,3)+'.'+v.slice(3);
    this.value = v;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// WEBSOCKET — Protocolo do agente local
// ─────────────────────────────────────────────────────────────────────────────
async function connectWS() {
  setStatus('connecting');
  const logConsole = document.getElementById('logConsole');
  let url = WS_URLS[0];

  const openSocket = (candidate) => new Promise((resolve) => {
    let opened = false;
    let socket;
    try {
      socket = new WebSocket(candidate);
      socket.binaryType = 'blob';
    } catch (e) {
      resolve(null);
      return;
    }

    const timer = setTimeout(() => {
      if (!opened) {
        try { socket.close(); } catch (e) {}
        resolve(null);
      }
    }, 900);

    socket.onopen = () => {
      opened = true;
      clearTimeout(timer);
      resolve(socket);
    };
    socket.onerror = () => {
      if (!opened) {
        clearTimeout(timer);
        resolve(null);
      }
    };
  });

  ws = null;
  for (const candidate of WS_URLS) {
    const ts = new Date().toLocaleTimeString();
    if (logConsole) logConsole.textContent += `\n[${ts}] Tentando conexão em: ${candidate}`;
    const sock = await openSocket(candidate);
    if (sock) {
      ws = sock;
      url = candidate;
      break;
    }
  }

  if (!ws) {
    setStatus('disconnected', false);
    return;
  }

  wsSend({ Path: '/dp/client/registrar', Data: { ClientVersion: '1.0', ProtocolVersion: '1.0' } });
  wsSend({ Path: '/dp/fp/status', Data: {} }); // Ping de status
  setStatus('connected');
  wsReady = true;
  toast('Leitor conectado!', 's');
  appendPontoLog(`[${new Date().toLocaleString('pt-BR')}] Agente conectado em ${url}`);
  wsSend({ Path: '/agent/health', Data: {} });

  ws.onmessage = (evt) => {
    const raw = evt.data;
    const ts = new Date().toLocaleTimeString();
    const logConsole = document.getElementById('logConsole');

    if (logConsole) {
      if (raw instanceof Blob) {
        logConsole.textContent += `\n\n[${ts}] [WS-BINARY] Blob(${raw.size} bytes)`;
        logConsole.scrollTop = logConsole.scrollHeight;
        return; // Retorna pois o processamento JSON falharia
      }
      logConsole.textContent += `\n\n[${ts}] [WS-RAW]\n${raw}`;
      logConsole.scrollTop = logConsole.scrollHeight;
      // Limita tamanho do log para não pesar a CPU
      if (logConsole.textContent.length > 50000) {
        logConsole.textContent = logConsole.textContent.slice(-20000);
      }
    }

    let msg;
    try { 
      msg = JSON.parse(raw); 
    } catch (err) { 
      console.warn("Mensagem não-JSON recebida:", raw);
      return; 
    }
    handleWSMessage(msg);
  };

  ws.onclose = () => {
    wsReady = false;
    setStatus('disconnected', false);
    setPontoStatus('Parada');
    // Tenta reconectar em 5 segundos
    setTimeout(connectWS, 5000);
  };

  ws.onerror = () => {
    wsReady = false;
    setStatus('disconnected', true);
  };
}

function wsSend(obj) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(obj));
  }
}

function handleWSMessage(msg) {
  // Padronização: Tratamos tanto o protocolo 'Path/Data' quanto o 'Event' nativo
  const path = msg.Path || msg.Event || '';
  const data = msg.Data || msg; // Alguns eventos podem vir com dados na raiz
  
  if (path === '/dp/fp/device/connected' || path === 'DeviceConnected') {
    setStatus('connected');
    setReaderMsg('Leitor detectado — coloque o dedo', '', 'cad');
    setReaderMsg('Leitor detectado — coloque o dedo', '', 'search');
    toast('Leitor detectado', 's');
  }

  if (path === '/dp/fp/device/disconnected' || path === 'DeviceDisconnected') {
    setReaderMsg('Leitor desconectado', 'err', 'cad');
    setReaderMsg('Leitor desconectado', 'err', 'search');
    toast('Leitor desconectado', 'e');
  }

  if (path === '/dp/fp/sample' || path === 'SamplesAcquired') {
    stopSim(captureMode);
    
    // Captura o sample independente se está em Data.Samples ou Samples na raiz
    const samples = data.Samples || msg.samples || msg.Samples;
    if (!samples || samples.length === 0) return;
    
    const sample = samples[0];

    if (captureMode === 'cad') {
      capturedFMD = sample;
      document.getElementById('btnSave').disabled = false;
      setRing('ok', '✅', 'cad');
      setReaderMsg('Digital capturada com sucesso!', 'ok', 'cad');
      
      // Feedback visual do dedo
      document.querySelector(`.fgr[data-f="${selectedFinger}"]`)?.classList.add('scanned');
      
      // Mostra preview fake
      const imgSrcSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="1.2" style="width:65%;opacity:1"><path d="M12 2a9 9 0 0 1 9 9c0 3.6-2 6-4 8l-5 3-5-3c-2-2-4-4.4-4-8a9 9 0 0 1 9-9z"/><path d="M9 12c0-1.7 1.3-3 3-3s3 1.3 3 3"/></svg>`;
      document.getElementById('fpPreviewCad').innerHTML = imgSrcSvg;
      document.getElementById('fpPreviewCad').style.display = 'flex';
      document.getElementById('ringWrapCad').style.display = 'none';

      toast('Leitura concluída!', 's');
    } else {
      // No modo SEARCH, o Python nos devolve o template que deu MATCH na galeria
      const matchedPerson = db.find(p => p.fmd === sample);
      
      if (matchedPerson) {
        showSearchResult(matchedPerson);
        setRing('ok', '✅', 'search');
        setReaderMsg('Usuário identificado!', 'ok', 'search');
        toast('Bem-vindo, ' + matchedPerson.nome, 's');
      } else {
        setRing('err', '✕', 'search');
        setReaderMsg('Não reconhecida! Tente novamente...', 'err', 'search');
        toast('Digital não encontrada na base', 'e');
        
        // Retorna para nova tentativa automaticamente após 2 seg
        setTimeout(() => {
          if (captureMode === 'search') resetSearch();
        }, 2000);
      }
    }
  }

  if (path === '/dp/reply/error') {
    const reason = (msg.Data && msg.Data.Reason) || 'Erro desconhecido';
    stopScan(captureMode);
    setRing('err', '✕', captureMode);
    setReaderMsg(reason, 'err', captureMode);
    toast(reason, 'e');

    // Se der erro no modo busca (ex: dedo mal posicionado), retenta também
    if (captureMode === 'search') {
      setTimeout(() => resetSearch(), 2000);
    }
  }

  if (path === '/dp/fp/status') {
    const quality = msg.Data && msg.Data.Quality;
    if (quality !== undefined) {
      setReaderMsg('Qualidade do toque: ' + quality + '%', '', captureMode);
    }
  }

  if (path === '/rfid/status') {
    pontoListening = Boolean(data.listening);
    setPontoStatus(pontoListening ? 'Escutando' : 'Parada');
    if (data.rfid_available === false) {
      appendPontoLog(`[${new Date().toLocaleString('pt-BR')}] Leitor RFID indisponivel no agente.`);
    }
    if (data.last_uid) {
      ultimoCartaoUid = data.last_uid;
      updatePontoField('pUltimoCartao', ultimoCartaoUid);
    }
  }

  if (path === '/rfid/card-read') {
    const uid = (data.uid || '').trim();
    if (!uid) return;
    ultimoCartaoUid = uid;
    pontoListening = true;
    const ts = new Date().toLocaleString('pt-BR');
    setPontoStatus('Escutando');
    updatePontoField('pUltimoCartao', uid);
    updatePontoField('pUltimaLeitura', ts);
    appendPontoLog(`[${ts}] Cartao lido: ${uid}`);
    toast(`Cartao lido: ${uid}`, 'i');
  }

  if (path === '/rfid/punch/saved') {
    const ts = new Date().toLocaleString('pt-BR');
    updatePontoField('pUltimoEnvio', ts);
    appendPontoLog(`[${ts}] Ponto salvo no PostgreSQL.`);
    toast('Ponto registrado com sucesso', 's');
  }

  if (path === '/agent/health') {
    const st = (data.status || '').toString().toLowerCase();
    const healthy = st === 'ok' || st === 'up';
    updatePontoField('pStatusAgente', healthy ? 'Online' : 'Offline');
    updatePontoField('pStatusLeitor', data.has_pynput ? 'Reconhecido' : 'Nao reconhecido');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// CAPTURA & CONSULTA
// ─────────────────────────────────────────────────────────────────────────────
function startCapture(mode) {
  if (!wsReady) { toast('Leitor offline!', 'e'); return; }
  captureMode = mode;
  resetUI(mode);
  
  if (mode === 'search') {
    // Modo IDENTIFICAÇÃO (1:N)
    // Coletamos todos os templates (FMDs) salvos para mandar pro Python comparar
    const gallery = db.filter(p => p.fmd).map(p => p.fmd);
    
    if (gallery.length === 0) {
      toast('Nenhuma digital cadastrada para comparar!', 'i');
      return;
    }

    wsSend({ 
      Path: '/dp/fp/identify', 
      Data: { Gallery: gallery } 
    });
    setReaderMsg('Coloque o dedo para identificar...', 'active', 'search');
  } else {
    // Modo CADASTRO (1:1)
    wsSend({ Path: '/dp/fp/acquire', Data: {} });
    wsSend({ Method: 'StartAcquisition', Device: 'default' }); 
    setReaderMsg('Aguardando digital...', 'active', 'cad');
  }

  setRing('active', '☉', mode);
  startSim(mode);
}

function showSearchResult(p) {
    document.getElementById('colSearchReader').style.display = 'none';
    const resEl = document.getElementById('searchResult');
    resEl.style.display = 'block';

    resEl.className = 'search-result found';
    resEl.innerHTML = `
      <div class="result-avatar" style="background:${avatarColor(p.nome)}">${initials(p.nome)}</div>
      <div class="result-name">${p.nome}</div>
      <div class="result-cpf">${p.cpf}</div>
      <div class="result-data">Nascimento: ${p.dataNasc}</div>
      <div style="margin-top:15px; font-size:0.75rem; color:var(--accent);">✓ Identidade Confirmada por Biometria</div>
      <button class="btn btn-ghost" id="btnResetSearch" style="margin-top:20px;width:100%">Nova Busca</button>
    `;
}

function resetUI(mode) {
    if (mode === 'cad') {
        document.getElementById('btnSave').disabled = true;
        document.getElementById('fpPreviewCad').style.display = 'none';
        document.getElementById('ringWrapCad').style.display = 'block';
    } else {
        document.getElementById('searchResult').style.display = 'none';
        document.getElementById('colSearchReader').style.display = 'flex';
        document.getElementById('fpPreviewSearch').style.display = 'none';
        document.getElementById('ringWrapSearch').style.display = 'block';
    }
}

function resetSearch() {
  document.getElementById('searchResult').style.display = 'none';
  document.getElementById('colSearchReader').style.display = 'flex';
  document.getElementById('fpPreviewSearch').style.display = 'none';
  document.getElementById('ringWrapSearch').style.display = 'block';
  setRing('', '🔍', 'search');
  setReaderMsg('Preparando leitor, coloque o dedo de forma plana...', '', 'search');
  stopScan('search');
  capturedFMD = null;
  setTimeout(() => startCapture('search'), 200);
}

function startSim(mode) {
  const track = document.getElementById(mode === 'search' ? 'trackSearch' : 'track');
  const fill = document.getElementById(mode === 'search' ? 'fillSearch' : 'fill');
  track.classList.add('show');
  fill.style.width = '0%';
}

function stopSim(mode) {
  const track = document.getElementById(mode === 'search' ? 'trackSearch' : 'track');
  track.classList.remove('show');
}

function stopScan(mode = 'cad') {
  const track = document.getElementById(mode === 'search' ? 'trackSearch' : 'track');
  track.classList.remove('show');
  if (scanSimInterval) { clearInterval(scanSimInterval); scanSimInterval = null; }
}

// ─────────────────────────────────────────────────────────────────────────────
// SALVAR CADASTRO
// ─────────────────────────────────────────────────────────────────────────────
function savePerson() {
  const worklab_id  = document.getElementById('iId').value.trim();
  const nome     = document.getElementById('iNome').value.trim();
  const cpf      = document.getElementById('iCpf').value.trim();
  const dataNasc = document.getElementById('iDataNasc').value;

  if (!worklab_id)        { toast('ID obrigatório!', 'e'); return; }
  if (!nome)              { toast('Preencha o nome!', 'e'); return; }
  if (cpf && cpf.length > 0 && cpf.length < 14) { toast('Se informado, CPF deve ter 14 chars!', 'e'); return; }
  if (!capturedFMD)       { toast('Capture a digital primeiro!', 'e'); return; }
  if (db.find(p => p.worklab_id === worklab_id)) { toast('Este ID já está cadastrado!', 'e'); return; }
  if (cpf && db.find(p => p.cpf === cpf)) { toast('CPF já cadastrado!', 'e'); return; }

  const person = {
    id:        Date.now(),
    worklab_id,
    nome,
    cpf,
    dataNasc,
    finger:    selectedFinger,
    fmd:       capturedFMD,       
    createdAt: new Date().toLocaleDateString('pt-BR')
  };

  db.push(person);
  saveDB();
  renderTable();
  resetForm();
  toast('Cadastro salvo!', 's');

  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  document.querySelector('[data-tab="pLista"]').classList.add('active');
  document.getElementById('pLista').classList.add('active');
}

function resetForm() {
  document.getElementById('iId').value       = '';
  document.getElementById('iNome').value     = '';
  document.getElementById('iCpf').value      = '';
  document.getElementById('iDataNasc').value = '';
  capturedFMD = null;
  document.getElementById('btnSave').disabled = true;
  document.querySelectorAll('.fgr').forEach(b => b.classList.remove('scanned'));
  document.getElementById('fpPreviewCad').style.display = 'none';
  document.getElementById('ringWrapCad').style.display = 'block';
  setRing('', '👆', 'cad');
  stopScan('cad');
  setReaderMsg(wsReady ? 'Pronto — clique e coloque o dedo' : 'Aguardando leitor...', '', 'cad');
}

// ─────────────────────────────────────────────────────────────────────────────
// TABELA / LISTA
// ─────────────────────────────────────────────────────────────────────────────
function renderTable() {
  const q      = (document.getElementById('search')?.value || '').toLowerCase();
  const list   = db.filter(p =>
    (String(p.nome || '').toLowerCase().includes(q)) ||
    (String(p.cpf || '').includes(q))
  );
  const tbody  = document.getElementById('tbody');
  const empty  = document.getElementById('empty');

  document.getElementById('sTotal').textContent = db.length;
  document.getElementById('sBio').textContent   = db.filter(p => p.fmd).length;

  if (list.length === 0) {
    tbody.innerHTML = '';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';

  tbody.innerHTML = list.map(p => `
    <tr>
      <td style="font-family:var(--mono);font-size:.75rem;color:var(--accent2)">${p.worklab_id || '-'}</td>
      <td>
        <div class="name-cell">
          <div class="avatar" style="background:${avatarColor(p.nome)}">${initials(p.nome)}</div>
          <strong>${p.nome}</strong>
        </div>
      </td>
      <td style="font-family:var(--mono);font-size:.75rem;color:var(--mid);white-space:nowrap;">${p.cpf || ''}</td>
      <td style="font-size:.82rem;white-space:nowrap;">${p.dataNasc ? Utils_formatDate(p.dataNasc) : ''}</td>
      <td style="white-space:nowrap;">
        ${p.fmd
          ? `<span class="badge bio">☉ ${FINGER_NAMES[p.finger] ?? 'Dedo'}</span>`
          : `<span class="badge none">— Sem digital</span>`}
      </td>
      <td style="font-family:var(--mono);font-size:.7rem;color:var(--dim);white-space:nowrap;">${p.createdAt}</td>
      <td>
        <div class="act">
          <button class="ibtn edit-btn" data-id="${p.id}" title="Carregar para editar">✎</button>
          <button class="ibtn del del-btn" data-id="${p.id}" title="Remover">✕</button>
        </div>
      </td>
    </tr>
  `).join('');
}

// ─────────────────────────────────────────────────────────────────────────────
// EDITAR & EXCLUIR
// ─────────────────────────────────────────────────────────────────────────────
function editPerson(id) {
  const p = db.find(x => x.id === id);
  if (!p) return;

  document.getElementById('iId').value       = p.worklab_id || '';
  document.getElementById('iNome').value     = p.nome;
  document.getElementById('iCpf').value      = p.cpf;
  document.getElementById('iDataNasc').value = p.dataNasc || '';

  document.querySelectorAll('.fgr').forEach(b => {
    b.classList.remove('sel');
    b.classList.remove('scanned');
  });
  document.querySelector(`.fgr[data-f="${p.finger}"]`)?.classList.add('sel');
  selectedFinger = p.finger;

  capturedFMD = p.fmd;
  if (capturedFMD) document.querySelector(`.fgr[data-f="${p.finger}"]`)?.classList.add('scanned');
  db = db.filter(x => x.id !== id);
  saveDB();

  document.getElementById('btnSave').disabled = false;
  
  // Show loaded fingerprint
  const imgSrcSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="1.2" style="width:65%;opacity:1"><path d="M12 2a9 9 0 0 1 9 9c0 3.6-2 6-4 8l-5 3-5-3c-2-2-4-4.4-4-8a9 9 0 0 1 9-9z"/><path d="M9 12c0-1.7 1.3-3 3-3s3 1.3 3 3"/></svg>`;
  document.getElementById('fpPreviewCad').innerHTML = imgSrcSvg;
  document.getElementById('fpPreviewCad').style.display = 'flex';
  document.getElementById('ringWrapCad').style.display = 'none';

  setRing('ok', '✅', 'cad');
  setReaderMsg('✓ Digital anterior carregada', 'ok', 'cad');

  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  document.querySelector('[data-tab="pCadastrar"]').classList.add('active');
  document.getElementById('pCadastrar').classList.add('active');

  toast('Editando: ' + p.nome, 'i');
}

function openDel(id)  { deleteTarget = id; document.getElementById('delOverlay').classList.add('open'); }
function closeModal() { deleteTarget = null; document.getElementById('delOverlay').classList.remove('open'); }
function confirmDel() {
  db = db.filter(p => p.id !== deleteTarget);
  saveDB();
  renderTable();
  closeModal();
  toast('Cadastro removido', 'i');
}

// ─────────────────────────────────────────────────────────────────────────────
// STORAGE E UI HELPERS
// ─────────────────────────────────────────────────────────────────────────────
function loadDB() {
  chrome.storage.local.get(['cadastros_db'], (res) => {
    if (res.cadastros_db) {
      db = res.cadastros_db;
    } else {
      const stored = localStorage.getItem('cadastros');
      if (stored) {
        db = JSON.parse(stored);
        localStorage.removeItem('cadastros');
        saveDB();
      }
    }
    renderTable();
    checkPendingImport();
  });
}

function saveDB() {
  chrome.storage.local.set({ cadastros_db: db });
  renderTable();
}

function checkPendingImport() {
  chrome.storage.local.get(['mavi_pending_import'], (res) => {
    if (res.mavi_pending_import) {
      const p = res.mavi_pending_import;
      document.getElementById('iId').value = p.id || '';
      document.getElementById('iNome').value = p.nome || '';
      document.getElementById('iCpf').value = p.cpf || '';
      
      if (p.dataNasc) {
        const parts = p.dataNasc.split('/');
        if (parts.length === 3) document.getElementById('iDataNasc').value = `${parts[2]}-${parts[1]}-${parts[0]}`;
      }
      
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelector('.tab[data-tab="pCadastrar"]').classList.add('active');
      document.querySelectorAll('.panel').forEach(pan => pan.classList.remove('active'));
      document.getElementById('pCadastrar').classList.add('active');

      chrome.storage.local.remove('mavi_pending_import');
    }
  });
}

function setStatus(state, showDiag = false) {
  const dot   = document.getElementById('dot');
  const label = document.getElementById('statusLabel');
  const diag  = document.getElementById('diagLink');

  if (state === 'connected' || state === 'connecting') {
    dot.classList.add('on');
    label.textContent = state === 'connected' ? 'Serviço Ativo' : 'Conectando...';
    if (diag) diag.style.display = 'none';
  } else {
    dot.classList.remove('on');
    label.textContent = 'Serviço Biométrico Off-line';
    if (diag) diag.style.display = showDiag ? 'inline' : 'none';
  }
}

function setRing(cls, icon, mode = 'cad') {
  const ring = document.getElementById(mode === 'search' ? 'ringSearch' : 'ring');
  ring.className = 'reader-ring' + (cls ? ' ' + cls : '');
  ring.innerHTML = icon;
}

function setReaderMsg(msg, cls, mode = 'cad') {
  const el = document.getElementById(mode === 'search' ? 'rMsgSearch' : 'rMsg');
  el.textContent = msg;
  el.className = 'reader-msg' + (cls ? ' ' + cls : '');
}

function toast(msg, type = 'i') {
  const icons = { s: '✓', e: '✕', i: 'ℹ' };
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<span>${icons[type]}</span> ${msg}`;
  document.getElementById('toasts').appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

function initials(name) { return name.trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase(); }
function avatarColor(name) {
  const colors = ['#7b8cde','#4fffb0','#f7a072','#c084fc','#60a5fa','#34d399','#fbbf24'];
  let h = 0; for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % colors.length;
  return colors[h];
}

function Utils_formatDate(d) {
  if (!d) return '';
  const pts = d.split('-');
  return pts.length === 3 ? `${pts[2]}/${pts[1]}/${pts[0]}` : d;
}

function iniciarEscutaPonto() {
  if (!wsReady) { toast('Agente offline para escuta de ponto', 'e'); return; }
  wsSend({ Path: '/rfid/start-listen', Data: {} });
  pontoListening = true;
  setPontoStatus('Escutando');
  appendPontoLog(`[${new Date().toLocaleString('pt-BR')}] Escuta iniciada.`);
}

function pararEscutaPonto() {
  if (!wsReady) { toast('Agente offline para escuta de ponto', 'e'); return; }
  wsSend({ Path: '/rfid/stop-listen', Data: {} });
  pontoListening = false;
  setPontoStatus('Parada');
  appendPontoLog(`[${new Date().toLocaleString('pt-BR')}] Escuta parada.`);
}

function atualizarStatusPonto() {
  if (!wsReady) return;
  wsSend({ Path: '/rfid/status', Data: {} });
}

function registrarPontoManual() {
  if (!wsReady) { toast('Agente offline para registrar ponto', 'e'); return; }
  if (!ultimoCartaoUid) { toast('Nenhum cartao lido ainda', 'e'); return; }

  const collaborator_id = document.getElementById('pColabId').value.trim();
  const name = document.getElementById('pColabNome').value.trim();
  const photo_url = document.getElementById('pColabFoto').value.trim();

  if (!collaborator_id || !name) {
    toast('Informe ID e nome do colaborador', 'e');
    return;
  }

  wsSend({
    Path: '/rfid/punch',
    Data: {
      card_uid: ultimoCartaoUid,
      collaborator_id,
      collaborator_name: name,
      photo_url
    }
  });
  appendPontoLog(`[${new Date().toLocaleString('pt-BR')}] Enviando ponto para VPS...`);
}

function updatePhotoSlot() {
  const slot = document.getElementById('photoSlot');
  const url = document.getElementById('pColabFoto').value.trim();
  if (!url) {
    slot.textContent = 'Sem foto';
    return;
  }
  slot.innerHTML = `<img src="${url}" alt="Foto colaborador">`;
}

function appendPontoLog(msg) {
  const el = document.getElementById('pontoLog');
  if (!el) return;
  el.textContent += `\n${msg}`;
  el.scrollTop = el.scrollHeight;
}

function setPontoStatus(text) {
  updatePontoField('pStatusEscuta', text);
}

function updatePontoField(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value || '-';
}
