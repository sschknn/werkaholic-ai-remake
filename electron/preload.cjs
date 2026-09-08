// Preload (CommonJS): isolierte Bridge. Aktuell keine API nötig,
// contextIsolation bleibt aktiv. Keys werden NICHT hier eingebettet.
const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('werkscan', {
  platform: process.platform,
});
