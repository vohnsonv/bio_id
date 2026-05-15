// worklab_global.js
console.log("[BioID] Monitor de Inatividade Ativado (5min + 1min countdown).");

let inactivityTimer;
let countdownTimer;
let secondsLeft = 60;
const INACTIVITY_LIMIT = 5 * 60 * 1000; // 5 minutos

function resetInactivity() {
    clearTimeout(inactivityTimer);
    clearInterval(countdownTimer);
    secondsLeft = 60;
    
    const timerDisplay = document.getElementById('bioid-timer-display');
    if (timerDisplay) {
        timerDisplay.style.display = 'none';
        timerDisplay.innerText = "";
    }
    
    inactivityTimer = setTimeout(startCountdown, INACTIVITY_LIMIT);
}

function startCountdown() {
    const timerDisplay = document.getElementById('bioid-timer-display');
    if (timerDisplay) {
        timerDisplay.style.display = 'block';
        updateTimerUI();
        
        countdownTimer = setInterval(() => {
            secondsLeft--;
            updateTimerUI();
            
            if (secondsLeft <= 0) {
                clearInterval(countdownTimer);
                performLogout();
            }
        }, 1000);
    }
}

function updateTimerUI() {
    const timerDisplay = document.getElementById('bioid-timer-display');
    if (timerDisplay) {
        timerDisplay.innerText = `SAINDO EM ${secondsLeft}s`;
    }
}

function performLogout() {
    chrome.storage.local.remove(['logged_in_user'], () => {
        window.location.href = "https://app.worklabweb.com.br/logout.php";
    });
}

function injectUserBadge() {
    const isLoginPage = window.location.pathname === "/" || 
                         window.location.pathname.endsWith("index.php") ||
                         document.querySelector('form.login-form');
    
    if (isLoginPage) return;
    if (document.getElementById('bioid-global-badge')) return;

    chrome.storage.local.get(['logged_in_user'], (res) => {
        const user = res.logged_in_user;
        if (!user) return;

        const badge = document.createElement('div');
        badge.id = 'bioid-global-badge';
        badge.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            width: 130px;
            height: 170px;
            border-radius: 10px;
            background: white;
            box-shadow: 0 10px 30px rgba(0,0,0,0.5);
            z-index: 999999;
            border: 3px solid #000000;
            overflow: hidden;
            transition: all 0.2s ease;
            cursor: pointer;
        `;

        const imgUrl = chrome.runtime.getURL(`crachas/${user.id}.png`);
        badge.innerHTML = `
            <img src="${imgUrl}" style="width: 100%; height: 100%; object-fit: cover;" title="Clique para sair: ${user.nome}">
            <div id="logout-hint" style="position: absolute; inset: 0; background: rgba(0,0,0,0.6); color: white; display: flex; align-items: center; justify-content: center; font-size: 0.8rem; font-weight: bold; opacity: 0; transition: opacity 0.2s;">SAIR</div>
            <div id="bioid-timer-display" style="position: absolute; bottom: 0; left: 0; width: 100%; background: #ff6b6b; color: white; font-size: 0.65rem; padding: 6px; text-align: center; font-family: monospace; font-weight: bold; display: none; z-index: 10;"></div>
        `;

        badge.onmouseover = () => { badge.style.transform = 'scale(1.05)'; document.getElementById('logout-hint').style.opacity = '1'; };
        badge.onmouseout = () => { badge.style.transform = 'scale(1)'; document.getElementById('logout-hint').style.opacity = '0'; };
        badge.onclick = performLogout;

        document.body.appendChild(badge);
        resetInactivity();
    });
}

// Listeners de atividade e Scanner
let scannerBuffer = "";
let lastKeyTime = 0;

window.addEventListener('keydown', (e) => {
    // 1. Resetar inatividade
    resetInactivity();

    // 2. Lógica do Scanner (Pistola)
    const currentTime = Date.now();
    
    // Se passar mais de 50ms entre teclas, assume que é humano e reseta o buffer
    if (currentTime - lastKeyTime > 50) {
        scannerBuffer = "";
    }
    lastKeyTime = currentTime;

    if (e.key === 'Enter') {
        if (scannerBuffer.length >= 2) { 
            console.log("[BioID] Scanner detectado! Redirecionando para paciente:", scannerBuffer);
            window.location.href = `https://app.worklabweb.com.br/pacientestransition.php?idPaciente=${scannerBuffer}`;
        }
        scannerBuffer = "";
    } else if (e.key.length === 1) {
        scannerBuffer += e.key;
    }
}, true);

['mousedown', 'mousemove', 'scroll', 'touchstart'].forEach(evt => {
    window.addEventListener(evt, resetInactivity, true);
});

injectUserBadge();
setInterval(injectUserBadge, 5000);
