console.log("[Mavi Biometria] Content Script injetado no Worklab Web.");

setTimeout(() => {
  initWorklabSync();
}, 1000); // Aguarda DOM estabilizar

function initWorklabSync() {
  const elId = document.getElementById("lbPacienteId");
  const elNome = document.getElementById("tbPaciente");
  const elCpf = document.getElementById("tbCPF");
  const elDataNasc = document.getElementById("tbDataNascimento");
  const elCheckIcon = document.querySelector('i.fa.fa-check');

  if (!elId || !elNome || !elCheckIcon) {
    console.log("[Mavi Biometria] Elementos do Paciente não localizados na tela.");
    return;
  }

  const pacienteId = elId.textContent.trim() || elId.innerText.trim();
  const pacienteNome = elNome.value.trim();
  const pacienteCpf = elCpf ? elCpf.value.trim() : "";
  const pacienteData = elDataNasc ? elDataNasc.value.trim() : "";

  console.log(`[Mavi Biometria] Paciente detectado: ID ${pacienteId} | Nome: ${pacienteNome}`);

  // Verificar na extensão se esse ID já possui biometria
  chrome.storage.local.get(["cadastros_db"], (result) => {
    const db = result.cadastros_db || [];
    // Checa pelo ID extraído do sistema e se possui .fmd (Amostra biométrica)
    const hasBiometria = db.find(p => p.worklab_id === pacienteId && p.fmd);

    if (hasBiometria) {
      console.log("[Mavi Biometria] Paciente já possui digital. Nenhuma alteração aplicada.");
      // Adicionando um pequeno aviso visual sutil caso deseje
      elCheckIcon.parentElement.title = "Biometria Ativa";
      elCheckIcon.style.color = "#4fffb0"; // Mavi Highlight
      return;
    }

    console.log("[Mavi Biometria] Paciente sem digital! Injetando atalho...");

    // Remove o Ícone de Check e coloca o Botão
    const btnScan = document.createElement("button");
    btnScan.innerHTML = "👆 Scanear Digital";
    btnScan.style.cssText = `
      background: #4fffb0;
      color: #0d0f12;
      border: none;
      padding: 6px 12px;
      margin-left: 10px;
      border-radius: 4px;
      font-weight: bold;
      cursor: pointer;
      font-family: monospace;
      animation: pulseBtn 2s infinite;
    `;
    
    // Animação CSS para chamar atenção
    if (!document.getElementById("maviStyles")) {
      const style = document.createElement("style");
      style.id = "maviStyles";
      style.innerHTML = `@keyframes pulseBtn { 0% { box-shadow: 0 0 0 0 rgba(79, 255, 176, 0.7); } 70% { box-shadow: 0 0 0 10px rgba(79, 255, 176, 0); } 100% { box-shadow: 0 0 0 0 rgba(79, 255, 176, 0); } }`;
      document.head.appendChild(style);
    }

    btnScan.onclick = (e) => {
      e.preventDefault();
      // Salva os dados no storage para auto-fill na extensão
      const pendingData = {
        id: pacienteId,
        nome: pacienteNome,
        cpf: pacienteCpf,
        dataNasc: pacienteData,
      };
      chrome.storage.local.set({ "mavi_pending_import": pendingData }, () => {
        // Abre o popup do chrome em uma janela avulsa
        window.open(chrome.runtime.getURL("popup.html"), "MaviBiometria", "width=850,height=600,top=100,left=100");
      });
    };

    // Insere o botão e oculta o botão/link Salvar inteiro
    const parentContainer = elCheckIcon.closest('button') || elCheckIcon.closest('a') || elCheckIcon.parentElement;
    parentContainer.style.display = "none";
    parentContainer.parentNode.insertBefore(btnScan, parentContainer.nextSibling);
  });
}
