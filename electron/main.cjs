const { app, BrowserWindow, Menu, BrowserView, ipcMain, session } = require('electron');
const path = require('node:path');

let browserWin = null;
let publisherView = null;
let publisherStatus = { loaded: false, url: '', loggedIn: false };

function getPublisherView() {
  if (!browserWin) return null;

  if (!publisherView) {
    publisherView = new BrowserView({
      webPreferences: {
        contextIsolation: false,
        nodeIntegration: false,
        sandbox: false,
      },
    });
    browserWin.setBrowserView(publisherView);
  }

  const bounds = browserWin.getBounds();
  publisherView.setBounds({ x: 0, y: 0, width: bounds.width, height: bounds.height });

  publisherView.webContents.on('did-finish-load', () => {
    const url = publisherView.webContents.getURL();
    publisherStatus.loaded = true;
    publisherStatus.url = url;

    publisherView.webContents.executeJavaScript(
      `document.querySelector('a[href*="logout"], button[data-testid="logout"], a:contains("Abmelden")')`
        .replace(/:contains/g, '')
        .trim() ||
        `(() => {
          const isLoggedInEl = document.querySelector('a[href*="/mitteilerweile"], a[href*="logout"], button[data-testid], a[href*="/suche"], .header-user-link');
          return isLoggedInEl ? true : false;
        })()`,
    ).then((loggedIn) => {
      publisherStatus.loggedIn = !!loggedIn || false;
    }).catch(() => {
      publisherStatus.loggedIn = false;
    });

    if (browserWin) {
      browserWin.webContents.send('browser:status', publisherStatus);
    }
  });

  publisherView.webContents.on('will-navigate', (e, targetUrl) => {
    publisherStatus.url = targetUrl;
    if (browserWin) {
      browserWin.webContents.send('browser:status', publisherStatus);
    }
  });

  return publisherView;
}

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

  if (!app.isPackaged) {
    win.loadURL('http://localhost:5173');
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  return win;
}

function createPublisherWindow(url) {
  if (browserWin) {
    browserWin.focus();
    return browserWin;
  }

  browserWin = new BrowserWindow({
    width: 1200,
    height: 800,
    title: 'Browser Publisher',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });

  browserWin.on('closed', () => {
    browserWin = null;
    publisherView = null;
    publisherStatus = { loaded: false, url: '', loggedIn: false };
  });

  const view = getPublisherView();
  if (view) {
    view.webContents.loadURL(url || 'https://www.kleinanzeigen.de');
  }

  return browserWin;
}

ipcMain.handle('browser:openPublisher', async (event, url) => {
  const win = createPublisherWindow(url);
  return { ok: true, url: win ? 'opened' : 'failed' };
});

ipcMain.handle('browser:closePublisher', async () => {
  if (browserWin) {
    browserWin.close();
    browserWin = null;
    publisherView = null;
    publisherStatus = { loaded: false, url: '', loggedIn: false };
  }
  return { ok: true };
});

ipcMain.handle('browser:postListing', async (event, data) => {
  const view = getPublisherView();
  if (!view) {
    return { ok: false, error: 'Publisher-Fenster nicht geöffnet' };
  }

  try {
    const script = `
      (() => {
        const ad = ${JSON.stringify(data)};
        const fillInput = (selector, value) => {
          const el = document.querySelector(selector);
          if (el) {
            el.value = value;
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
          }
        };
        const setSelect = (selector, value) => {
          const el = document.querySelector(selector);
          if (el) {
            el.value = value;
            el.dispatchEvent(new Event('change', { bubbles: true }));
          }
        };
        const clickButton = (selector) => {
          const el = document.querySelector(selector);
          if (el) { el.click(); return true; }
          return false;
        };

        fillInput('input[name="title"]', ad.title);
        fillInput('textarea[name="description"]', ad.description);
        fillInput('input[name="price"]', ad.price);
        setSelect('select[name="category"]', ad.category);
        setSelect('select[name="condition"]', ad.condition);

        return { filled: true, title: ad.title, price: ad.price };
      })()
    `;
    const result = await view.webContents.executeJavaScript(script, true);
    return { ok: true, result };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('browser:fillForm', async (event, data) => {
  return await ipcMain.handlers['browser:postListing'](event, data);
});

ipcMain.handle('browser:getStatus', async () => {
  return publisherStatus;
});

function setupAppMenu() {
  Menu.buildFromTemplate([
    {
      label: 'Datei',
      submenu: [
        { role: 'quit', label: 'Beenden' },
      ],
    },
    {
      label: 'Ansicht',
      submenu: [
        { role: 'reload', label: 'Neu laden' },
        { role: 'toggleDevTools', label: 'Entwicklerwerkzeuge' },
      ],
    },
    {
      label: 'Publisher',
      submenu: [
        {
          label: 'Kleinanzeigen öffnen',
          click: () => { ipcMain.notify('browser:openPublisher', 'https://www.kleinanzeigen.de'); },
        },
        {
          label: 'Publisher schließen',
          click: () => { ipcMain.notify('browser:closePublisher'); },
        },
      ],
    },
  ]);
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
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
    {
      label: 'Publisher',
      submenu: [
        {
          label: 'Kleinanzeigen öffnen',
          click: () => { ipcMain.notify('browser:openPublisher', 'https://www.kleinanzeigen.de'); },
        },
        {
          label: 'Publisher schließen',
          click: () => { ipcMain.notify('browser:closePublisher'); },
        },
      ],
    },
  ]));

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
