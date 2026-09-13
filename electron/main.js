/**
 * Electron main process — THE SCREAMING VOLUME SLIDER™
 */

const { app, BrowserWindow, ipcMain, systemPreferences } = require('electron');
const path = require('path');
const volume = require('./volume');

const isDev = process.argv.includes('--dev');
let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 960,
    minHeight: 680,
    title: 'THE SCREAMING VOLUME SLIDER™',
    backgroundColor: '#070b14',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  if (isDev) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function registerIpc() {
  ipcMain.handle('volume:get', async () => {
    try {
      const value = await volume.getVolume();
      return { ok: true, volume: value };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('volume:set', async (_event, percent) => {
    try {
      const value = await volume.setVolume(percent);
      return { ok: true, volume: value };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('volume:getMute', async () => {
    try {
      const muted = await volume.getMute();
      return { ok: true, muted };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('volume:setMute', async (_event, muted) => {
    try {
      const result = await volume.setMute(!!muted);
      return { ok: true, muted: result };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('app:getPlatform', () => ({
    platform: process.platform,
    isWindows: process.platform === 'win32'
  }));
}

app.whenReady().then(() => {
  registerIpc();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
});
