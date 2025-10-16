const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { launchMinecraft } = require('./launcher');
const { Auth } = require('msmc');
let cachedAuth = null;

function createWindow() {
  const win = new BrowserWindow({
    width: 900,
    height: 600,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  win.loadFile('index.html');
}

app.whenReady().then(() => {
  createWindow();
});

ipcMain.handle('login-microsoft', async () => {
  try {
    const authManager = new Auth("electron");
    // "electron" permet d’ouvrir la fenêtre de login dans Electron
    const xboxManager = await authManager.launch("electron");
    const mcAuth = await xboxManager.getMinecraft();

    cachedAuth = mcAuth; // stocke le token pour le lancement
    return { success: true, name: mcAuth.profile.name, pp: mcAuth.profile.id };
  } catch (err) {
    console.error(`[ERREUR] Auth Microsoft : ${err}`);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('launch-game', async (event, options) => {
  if (cachedAuth) options.auth = cachedAuth; // injecte le token si connecté
  return await launchMinecraft(options);
});