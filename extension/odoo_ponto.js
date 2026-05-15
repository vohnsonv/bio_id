// odoo_ponto.js
console.log("[BioID] Detector de Ponto Odoo Ativo dentro do Iframe.");

function notifyPonto() {
    console.log("[BioID] Sucesso detectado! Fechando modal em breve...");
    chrome.runtime.sendMessage({ type: "PONTO_BATIDO" });
}

const observer = new MutationObserver((mutations) => {
    // 1. Tentar pela classe fornecida anteriormente
    let okButton = document.querySelector('.o_hr_attendance_button_dismiss');
    
    // 2. Tentar por texto "OK" (Como visto no print do usuário)
    if (!okButton) {
        const buttons = document.querySelectorAll('button');
        okButton = Array.from(buttons).find(btn => 
            btn.innerText.trim().toUpperCase() === "OK" || 
            btn.innerHTML.includes("OK")
        );
    }
    
    if (okButton) {
        // Verifica se o botão está visível (offsetParent não nulo)
        if (okButton.offsetParent !== null) {
            console.log("[BioID] Botão OK visualizado!");
            notifyPonto();
            observer.disconnect();
        }
    }
});

observer.observe(document.body, { childList: true, subtree: true });

// Fallback do Enter (RFID)
window.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        console.log("[BioID] Enter detectado no Iframe.");
        setTimeout(notifyPonto, 1000); 
    }
});
