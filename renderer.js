const { ipcRenderer } = require('electron');

let useMicrosoft = false;

document.getElementById('login').addEventListener('click', async () => {
  const log = document.getElementById('log');
  log.textContent = "Connexion Microsoft en cours...\n";

  // On envoie une requête au main process pour lancer la connexion
  const result = await ipcRenderer.invoke('login-microsoft');
  if (result.success) {
    log.textContent += `Connecté en tant que ${result.name}\n`;
    useMicrosoft = true;
    const HeadUrl = `https://minotar.net/helm/${result.pp}/64.png`;
    document.getElementById('HeadUrl').src = HeadUrl; // <img id="playerSkin">
  } else {
    log.textContent += `Échec de la connexion : ${result.error}\n`;
  }
});
document.getElementById('launch').addEventListener('click', async () => {
  const version = document.getElementById('version').value || "1.21.1";

  const log = document.getElementById('log');
  log.textContent = "Lancement en cours...\n";

  const result = await ipcRenderer.invoke('launch-game', { version, useMicrosoft });
  log.textContent += result + "\n";
});