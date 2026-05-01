const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  isDesktop: true,
  getAppVersion: () => require('electron').app.getVersion(),
  getAppPath: () => require('electron').app.getAppPath(),
  getUserDataPath: () => require('electron').app.getPath('userData'),
  minimize: () => require('electron').getCurrentWindow().minimize(),
  maximize: () => {
    const win = require('electron').getCurrentWindow();
    if (win.isMaximized()) {
      win.unmaximize();
    } else {
      win.maximize();
    }
  },
  close: () => require('electron').getCurrentWindow().close(),
  isMaximized: () => require('electron').getCurrentWindow().isMaximized(),
  onMaximizeChange: (callback) => {
    const win = require('electron').getCurrentWindow();
    win.on('maximize', () => callback(true));
    win.on('unmaximize', () => callback(false));
  },
  openExternal: (url) => require('electron').shell.openExternal(url),
  showItemInFolder: (path) => require('electron').shell.showItemInFolder(path),
  getLogPath: () => require('electron').app.getPath('logs'),
});
