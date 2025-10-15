const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { launchMinecraft } = require('./launcher');

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

ipcMain.handle('launch-game', async (event, options) => {
  return await launchMinecraft(options);
});