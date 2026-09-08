const { app, BrowserWindow, Menu } = require('electron');
const path = require('node:path');

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    autoHideMenuBar: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });

  // Dev: Vite-Server; Prod (packaged): gebaute dist/index.html.
  // Secrets kommen NICHT aus Build-Configs – die App liest Keys zur
  // Laufzeit aus Settings/localStorage.
  if (!app.isPackaged) {
    win.loadURL('http://localhost:5173');
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: 'Datei',
        submenu: [{ role: 'quit', label: 'Beenden' }],
      },
      {
        label: 'Ansicht',
        submenu: [
          { role: 'reload', label: 'Neu laden' },
          { role: 'toggleDevTools', label: 'Entwicklerwerkzeuge' },
        ],
      },
    ]),
  );

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
