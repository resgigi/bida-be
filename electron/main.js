const { app, BrowserWindow } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

let mainWindow = null;
let serverProcess = null;

const isDev = process.env.NODE_ENV === 'development';

function getFrontendPath() {
  if (isDev) {
    return path.join(__dirname, '..', '..', 'bida-fe', 'dist');
  }
  return path.join(__dirname, '..', 'frontend');
}

function startBackend() {
  const env = {
    ...process.env,
    DESKTOP_MODE: 'true',
    FRONTEND_PATH: getFrontendPath(),
    NODE_ENV: isDev ? 'development' : 'production',
  };

  const serverPath = path.join(__dirname, '..', 'src', 'app.js');

  serverProcess = spawn('node', [serverPath], {
    env,
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
  });

  serverProcess.stdout.on('data', (data) => {
    process.stdout.write(`[Server] ${data}`);
  });

  serverProcess.stderr.on('data', (data) => {
    process.stderr.write(`[Server Error] ${data}`);
  });

  serverProcess.on('error', (err) => {
    console.error('Failed to start server:', err);
  });

  return serverProcess;
}

function createWindow() {
  const frontendPath = getFrontendPath();
  const indexPath = path.join(frontendPath, 'index.html');

  const windowOptions = {
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 700,
    title: 'OpenBida - Quan Ly Bia',
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
    show: false,
    autoHideMenuBar: false,
  };

  if (isDev) {
    windowOptions.webPreferences.devtools = true;
  }

  mainWindow = new BrowserWindow(windowOptions);

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(indexPath);
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
    console.error(`Failed to load: ${errorDescription} (${errorCode})`);
  });

  if (process.platform === 'darwin') {
    app.on('window-all-closed', () => app.quit());
  }
}

app.whenReady().then(() => {
  console.log('Starting OpenBida Desktop...');

  if (!isDev) {
    startBackend();
  }

  createWindow();
});

app.on('window-all-closed', () => {
  if (serverProcess) {
    serverProcess.kill();
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

process.on('exit', (code) => {
  if (serverProcess) {
    serverProcess.kill();
  }
  process.exit(code);
});
