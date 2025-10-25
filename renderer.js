const { ipcRenderer } = require('electron');
const MODPACK_URL = "https://download1531.mediafire.com/wzdbcfjel2qgCzlCfCV9qluAgT4Mk8lUMayWPH18L9ZnqExt69rEimmmOQ-j5V7OgA0ZqDkhgYAFwtkhiOcbyBHRCfUb5pZkfc1ex3W80jY2g4y-5znWdt-MiWokS8NbMk3EnI6FiD2eT-s29yY0M7B438DEVMvC1p0PGIPyA_o/3sxeftgtpvvamph/modpack.zip";

let useMicrosoft = false;

document.getElementById('login').addEventListener('click', async () => {
  const log = document.getElementById('log');
  log.textContent = "🔐 Connexion Microsoft en cours...\n";

  const result = await ipcRenderer.invoke('login-microsoft');
  if (result.success) {
    log.textContent += `✅ Connecté en tant que ${result.name}\n`;
    useMicrosoft = true;
    const HeadUrl = `https://minotar.net/helm/${result.pp}/64.png`;
    document.getElementById('HeadUrl').src = HeadUrl;
  } else {
    log.textContent += `❌ Échec de la connexion : ${result.error}\n`;
  }
});

document.getElementById('launch').addEventListener('click', async () => {
  const log = document.getElementById('log');
  log.textContent = "🎮 Lancement en cours...\n";
  log.textContent += "⏳ Téléchargement/vérification du modpack...\n";

  try {
    const result = await ipcRenderer.invoke('launch-game', { 
      useMicrosoft, 
      modpackUrl: MODPACK_URL 
    });
    log.textContent += result + "\n";
    log.textContent += "\n💡 Vérifiez la console Electron (Ctrl+Shift+I) pour plus de détails\n";
  } catch (error) {
    log.textContent += `❌ Erreur: ${error.message}\n`;
  }
});

// Ouvrir la console automatiquement pour voir les logs
setTimeout(() => {
  require('electron').ipcRenderer.send('open-devtools');
}, 1000);