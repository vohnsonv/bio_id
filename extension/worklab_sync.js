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
      console.log("[Mavi Biometria] Paciente já possui digital.");
      elCheckIcon.parentElement.title = "Biometria Ativa";
      elCheckIcon.style.color = "#4fffb0"; 
      return;
    }

    console.log("[Mavi Biometria] Paciente sem digital detectado.");
  });
}
