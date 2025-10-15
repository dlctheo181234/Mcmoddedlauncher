const { ipcRenderer } = require('electron');

document.getElementById('launch').addEventListener('click', async () => {
  const username = document.getElementById('username').value || "Player";
  const version = document.getElementById('version').value || "1.21.1";

  const log = document.getElementById('log');
  log.textContent = "Lancement en cours...\n";

  const result = await ipcRenderer.invoke('launch-game', { username, version });
  log.textContent += result + "\n";
});