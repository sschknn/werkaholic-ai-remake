// Preload (CommonJS): isolierte Bridge.
// Keys werden NICHT hier eingebettet.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('werkscan', {
  platform: process.platform,

  browser: {
    openPublisher: (url) => ipcRenderer.invoke('browser:openPublisher', url),
    closePublisher: () => ipcRenderer.invoke('browser:closePublisher'),
    postListing: (data) => ipcRenderer.invoke('browser:postListing', data),
    fillForm: (data) => ipcRenderer.invoke('browser:fillForm', data),
    getStatus: () => ipcRenderer.invoke('browser:getStatus'),
    onStatus: (callback) => ipcRenderer.on('browser:status', (_event, status) => callback(status)),
    onLoaded: (callback) => ipcRenderer.on('browser:loaded', (_event, info) => callback(info)),
  },
});
