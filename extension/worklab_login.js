console.log("[BioID] Interface WorkLab: Modal Odoo Ativado.");

let rfidBuffer = "";
let lastKeyTime = Date.now();
const ladesLogo = chrome.runtime.getURL("images/lades2.jpg");
const rfidIcon = chrome.runtime.getURL("images/rfid.jpg");

function applyBrandingAndPanel() {
    if (document.getElementById('bioid-minimal-panel')) return;

    const loginForm = document.querySelector('form.login-form');
    if (loginForm) {
        // Oculta a logo azul original e containers de logo do WorkLab
        const legacyLogos = document.querySelectorAll('img[src*="logonovo.png"], .login-logo, .logo-container');
        legacyLogos.forEach(el => {
            el.style.display = "none";
            if (el.parentElement) el.parentElement.style.display = "none";
        });

        const parent = loginForm.parentElement;
        if (parent && !document.getElementById('bioid-minimal-panel')) {
            // Remove a barra de rolagem forçadamente
            document.documentElement.style.overflow = "hidden";
            document.body.style.overflow = "hidden";

            // Esconde o original sem deletar (importante para o login funcionar)
            loginForm.style.display = "none";
            
            parent.style.display = "flex";
            parent.style.flexDirection = "column";
            parent.style.alignItems = "center";
            parent.style.justifyContent = "center";
            parent.style.minHeight = "auto"; // Remove altura fixa
            parent.style.padding = "0 20px 100px 20px"; // Subindo o conteúdo

            const panel = document.createElement('div');
            panel.id = 'bioid-minimal-panel';
            panel.style.cssText = `
                background: #ffffff;
                border: 2px solid #f1f5f9;
                border-radius: 20px;
                padding: 5% 30px;
                display: flex;
                flex-direction: column;
                align-items: center;
                text-align: center;
                font-family: 'Open Sans', sans-serif;
                box-shadow: 0 20px 40px rgba(0, 0, 0, 0.08);
                width: 100%;
                max-width: 380px;
                max-height: 85vh;
                margin-top: -40px; 
                overflow: hidden;
                transition: all 0.4s ease;
            `;

            panel.innerHTML = `
                <img src="${ladesLogo}" style="max-height: 80px; width: auto; margin-bottom: 5%;">
                <div id="panel-content" style="width: 100%; flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center;">
                    <img src="${rfidIcon}" style="max-height: 180px; width: 80%; object-fit: contain; margin-bottom: 20px;">
                    <h2 id="panel-title" style="font-size: 1.4rem; font-weight: 800; color: #1e293b; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 1px;">Acesso por Crachá</h2>
                    <p id="minimal-status" style="font-size: 1rem; color: #64748b; font-weight: 500;">
                        Aproxime o cartão de identificação
                    </p>
                </div>
            `;
            parent.appendChild(panel);
        }
    }
}

function openOdooModal(e) {
    e.preventDefault();
    if (document.getElementById('bioid-odoo-modal')) return;

    const overlay = document.createElement('div');
    overlay.id = 'bioid-odoo-modal';
    overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        background: rgba(0,0,0,0.8);
        backdrop-filter: blur(5px);
        z-index: 1000000;
        display: flex;
        align-items: center;
        justify-content: center;
        animation: fadeIn 0.3s ease;
    `;

    const modal = document.createElement('div');
    modal.style.cssText = `
        width: 90%;
        height: 90%;
        background: white;
        border-radius: 20px;
        position: relative;
        overflow: hidden;
        box-shadow: 0 25px 50px rgba(0,0,0,0.5);
    `;

    modal.innerHTML = `
        <div style="height: 60px; background: #1955ad; display: flex; align-items: center; justify-content: space-between; padding: 0 20px; color: white;">
            <div style="font-weight: bold; font-size: 1.2rem;">PONTO ELETRÔNICO</div>
            <button id="close-odoo-modal" style="background: rgba(255,255,255,0.2); border: none; color: white; width: 40px; height: 40px; border-radius: 50%; cursor: pointer; font-size: 1.5rem; display: flex; align-items: center; justify-content: center; transition: background 0.2s;">&times;</button>
        </div>
        <iframe src="https://odoo.mavi.tec.br/hr_attendance/75f3d5a70c3f4d4e971d3e9376f490f3" style="width: 100%; height: calc(100% - 60px); border: none;"></iframe>
    `;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    const iframe = modal.querySelector('iframe');
    iframe.onload = () => {
        iframe.focus();
        setTimeout(() => iframe.focus(), 500);
    };

    document.getElementById('close-odoo-modal').onclick = () => overlay.remove();

    chrome.runtime.onMessage.addListener((request) => {
        if (request.type === "PONTO_BATIDO") {
            setTimeout(() => {
                const modal = document.getElementById('bioid-odoo-modal');
                if (modal) {
                    modal.remove();
                    window.focus();
                    document.body.focus();
                    console.log("[BioID] Foco restaurado para o WorkLab.");
                }
            }, 2000); 
        }
    });
    document.getElementById('close-odoo-modal').onmouseover = function() { this.style.background = 'rgba(255,255,255,0.4)'; };
    document.getElementById('close-odoo-modal').onmouseout = function() { this.style.background = 'rgba(255,255,255,0.2)'; };
}

function injectOdooButton() {
    if (document.getElementById('bioid-odoo-btn')) return;
    
    const odooBtn = document.createElement('a');
    odooBtn.id = 'bioid-odoo-btn';
    odooBtn.href = "#";
    odooBtn.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 14px 28px;
        background: #1955ad;
        border: none;
        border-radius: 50px;
        color: #ffffff;
        text-decoration: none;
        font-weight: 800;
        font-size: 1rem;
        z-index: 999999;
        box-shadow: 0 10px 25px rgba(25, 85, 173, 0.4);
        transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
    `;
    
    odooBtn.innerHTML = `
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
        PONTO ELETRÔNICO
    `;
    
    odooBtn.onclick = openOdooModal;
    odooBtn.onmouseover = () => { odooBtn.style.transform = 'scale(1.1) translateY(-2px)'; odooBtn.style.boxShadow = '0 15px 30px rgba(25, 85, 173, 0.6)'; };
    odooBtn.onmouseout = () => { odooBtn.style.transform = 'scale(1) translateY(0)'; odooBtn.style.boxShadow = '0 10px 25px rgba(25, 85, 173, 0.4)'; };
    
    document.body.appendChild(odooBtn);
}

window.addEventListener('keydown', (e) => {
    const currentTime = Date.now();
    if (currentTime - lastKeyTime > 150) rfidBuffer = "";
    if (e.key === 'Enter') {
        if (rfidBuffer.length > 3) processRFID(rfidBuffer);
        rfidBuffer = "";
    } else if (e.key.length === 1) { rfidBuffer += e.key; }
    lastKeyTime = currentTime;
});

function processRFID(uid) {
    const normalize = (val) => (val || "").toString().trim().replace(/^0+/, '');
    const normalizedUid = normalize(uid);
    chrome.storage.local.get(['worklab_users'], (res) => {
        const localUsers = res.worklab_users || [];
        const allUsers = [...INITIAL_USERS, ...localUsers];
        const user = allUsers.find(u => normalize(u.badge) === normalizedUid);
        if (user) { showBadgeInPanel(user); doLogin(user); } else { showAccessDenied(); }
    });
}

function showAccessDenied() {
    const panel = document.getElementById('bioid-minimal-panel');
    const title = document.getElementById('panel-title');
    const status = document.getElementById('minimal-status');
    if (panel) {
        panel.style.backgroundColor = "#ef4444";
        if (title) { title.innerText = "Acesso Negado!"; title.style.color = "white"; }
        if (status) { status.innerText = "Cartão não autorizado"; status.style.color = "white"; }
        setTimeout(() => {
            panel.style.backgroundColor = "#ffffff";
            if (title) { title.innerText = "Acesso por Crachá"; title.style.color = "#334155"; }
            if (status) { status.innerText = "Aproxime o cartão de identificação"; status.style.color = "#64748b"; }
        }, 3000);
    }
}

function showBadgeInPanel(user) {
    const panelContent = document.getElementById('panel-content');
    if (panelContent) {
        const crachaImgUrl = chrome.runtime.getURL(`crachas/${user.id}.png`);
        panelContent.style.opacity = '0';
        setTimeout(() => {
            panelContent.innerHTML = `
                <div style="text-align: center; animation: fadeIn 0.5s ease-in-out; display: flex; flex-direction: column; align-items: center; justify-content: center;">
                    <img src="${crachaImgUrl}" style="width: auto; max-height: 300px; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
                    <div style="font-size: 1.1rem; font-weight: 800; color: #1e293b; margin-top: 10px;">${user.nome}</div>
                    <div style="font-size: 0.85rem; color: #1955ad; font-weight: bold; margin-top: 2px; text-transform: uppercase; letter-spacing: 1px;">Acesso Concedido</div>
                </div>
            `;
            panelContent.style.opacity = '1';
        }, 300);
    }
}

function doLogin(user) {
    const loginForm = document.querySelector('form.login-form');
    if (!loginForm) return;
    const userInput = loginForm.querySelector('input[name="username"]') || loginForm.querySelector('input[name="new_login_username"]');
    const passInput = loginForm.querySelector('input[name="password"]') || loginForm.querySelector('input[name="new_login_password"]');
    if (userInput && passInput) {
        userInput.value = user.user;
        passInput.value = user.pass;
        chrome.storage.local.set({ logged_in_user: user });
        setTimeout(() => {
            const btn = document.getElementById('logar');
            if (btn) btn.click(); else loginForm.submit();
        }, 2000);
    }
}

applyBrandingAndPanel();
injectOdooButton();
const observer = new MutationObserver(applyBrandingAndPanel);
observer.observe(document.body, { childList: true, subtree: true });
