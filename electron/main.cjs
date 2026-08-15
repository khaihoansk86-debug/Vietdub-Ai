const { app, BrowserWindow, shell } = require('electron');
const fs = require('fs');
const net = require('net');
const path = require('path');
const { pathToFileURL } = require('url');

let mainWindow;

async function findFreePort(startPort) {
  for (let port = startPort; port < startPort + 30; port += 1) {
    // eslint-disable-next-line no-await-in-loop
    const available = await new Promise((resolve) => {
      const server = net.createServer();
      server.once('error', () => resolve(false));
      server.once('listening', () => server.close(() => resolve(true)));
      server.listen(port, '127.0.0.1');
    });
    if (available) return port;
  }
  throw new Error('Không tìm được cổng trống để chạy VietDub AI.');
}

async function waitForServer(port) {
  const url = `http://127.0.0.1:${port}/health`;
  const started = Date.now();
  while (Date.now() - started < 20000) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Server is still starting.
    }
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => setTimeout(resolve, 350));
  }
  throw new Error('VietDub AI khởi động quá lâu. Hãy thử mở lại ứng dụng.');
}

async function startLocalServer() {
  const appRoot = app.getAppPath();
  const dataDir = path.join(app.getPath('userData'), 'data');
  fs.mkdirSync(dataDir, { recursive: true });

  const port = await findFreePort(Number(process.env.PORT || 3210));
  process.env.PORT = String(port);
  process.env.HOST = '127.0.0.1';
  process.env.VIETDUB_ROOT = appRoot;
  process.env.VIETDUB_PUBLIC_DIR = path.join(appRoot, 'public');
  process.env.VIETDUB_DATA_DIR = dataDir;

  await import(pathToFileURL(path.join(appRoot, 'server.js')).href);
  await waitForServer(port);
  return port;
}

function createWindow(port) {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 880,
    minWidth: 1080,
    minHeight: 720,
    show: false,
    title: '🤖 VietDub AI',
    autoHideMenuBar: true,
    backgroundColor: '#edf3f6',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.loadURL(`http://127.0.0.1:${port}`);
}

app.whenReady().then(async () => {
  try {
    const port = await startLocalServer();
    createWindow(port);
  } catch (error) {
    console.error(error);
    app.quit();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0 && process.env.PORT) {
    createWindow(Number(process.env.PORT));
  }
});
