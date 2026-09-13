/**
 * Preload bridge — expose safe APIs to the renderer.
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('screamAPI', {
  getVolume: () => ipcRenderer.invoke('volume:get'),
  setVolume: (percent) => ipcRenderer.invoke('volume:set', percent),
  getMute: () => ipcRenderer.invoke('volume:getMute'),
  setMute: (muted) => ipcRenderer.invoke('volume:setMute', muted),
  getPlatform: () => ipcRenderer.invoke('app:getPlatform')
});
