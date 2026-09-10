const { app, BrowserWindow, shell, dialog } = require('electron');
const fs = require('fs');
const net = require('net');
const path = require('path');
const { pathToFileURL } = require('url');

let mainWindow;
const hasInstanceLock = app.requestSingleInstanceLock();
if (!hasInstanceLock) app.quit();
app.on('second-instance', () => {
  if (mainWindow) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.show(); mainWindow.focus(); }
});

function writeLog(msg) {
  try {
    const logFile = path.join(app.getPath('userData'), 'electron_startup.log');
    fs.appendFileSync(logFile, `[${new Date().toISOString()}] ${msg}\n`);
  } catch {}
}

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
    title: 'VietDub AI Studio',
    autoHideMenuBar: true,
    backgroundColor: '#edf3f6',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.once('ready-to-show', () => {
    writeLog('Window ready-to-show fired, showing window.');
    mainWindow.show();
  });

  // Fallback: Ensure window becomes visible even if ready-to-show event delays
  setTimeout(() => {
    if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) {
      writeLog('Fallback timeout: forcing mainWindow.show().');
      mainWindow.show();
    }
  }, 2500);

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
    writeLog(`mainWindow did-fail-load: code ${errorCode}, desc: ${errorDescription}`);
  });

  mainWindow.loadURL(`http://127.0.0.1:${port}`);
}

if (hasInstanceLock) app.whenReady().then(async () => {
  writeLog('app.whenReady fired.');
  try {
    writeLog('Starting local server...');
    const port = await startLocalServer();
    writeLog(`Local server ready on port ${port}, creating window...`);
    createWindow(port);
  } catch (error) {
    writeLog(`FATAL STARTUP ERROR: ${error.stack || error.message}`);
    try {
      dialog.showErrorBox('Lỗi khởi động VietDub AI', `Không thể khởi động ứng dụng:\n\n${error.stack || error.message}\n\nXem chi tiết tại: ${path.join(app.getPath('userData'), 'electron_startup.log')}`);
    } catch {}
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
