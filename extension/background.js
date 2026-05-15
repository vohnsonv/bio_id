// background.js — Central de Comunicação
const WS_URL = 'ws://127.0.0.1:15896';
let ws = null;

function connectWS() {
    ws = new WebSocket(WS_URL);
    ws.onopen = () => console.log("[BioID] Agente biométrico detectado.");
    ws.onclose = () => { ws = null; setTimeout(connectWS, 5000); };
    ws.onerror = () => ws = null;
    
    ws.onmessage = (evt) => {
        try {
            const msg = JSON.parse(evt.data);
            if (msg.Path === "/dp/fp/scanned") {
                // Envia para o popup se estiver aberto
                chrome.runtime.sendMessage({ type: "BIO_SCAN", data: msg.Data });
            }
        } catch(e) {}
    };
}

// Ponte de comunicação para mensagens entre scripts de conteúdo (Odoo -> WorkLab)
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === "PONTO_BATIDO") {
        console.log("[BioID] Ponto detectado. Retransmitindo para o WorkLab...");
        chrome.tabs.query({ url: "*://app.worklabweb.com.br/*" }, (tabs) => {
            tabs.forEach(tab => {
                chrome.tabs.sendMessage(tab.id, { type: "PONTO_BATIDO" });
            });
        });
    }
});

connectWS();
