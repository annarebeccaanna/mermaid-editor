// Bridge between the page and the main process (see src/desktop.ts for types).
const { contextBridge, ipcRenderer, webUtils } = require('electron');

const on = (channel) => (cb) => {
  const listener = (_e, ...args) => cb(...args);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
};

contextBridge.exposeInMainWorld('desktop', {
  platform: process.platform,
  readFile: (p) => ipcRenderer.invoke('file:read', p),
  writeFile: (p, content) => ipcRenderer.invoke('file:write', p, content),
  renameFile: (p, newName) => ipcRenderer.invoke('file:rename', p, newName),
  showOpen: () => ipcRenderer.invoke('dialog:open'),
  showSave: (defaultName) => ipcRenderer.invoke('dialog:save', defaultName),
  saveExport: (defaultName, data, ext) => ipcRenderer.invoke('export:save', defaultName, data, ext),
  pickImage: () => ipcRenderer.invoke('image:pick'),
  openWindow: (p) => ipcRenderer.invoke('window:open', p),
  closeConfirmed: () => ipcRenderer.invoke('window:close-confirmed'),
  setDocState: (state) => ipcRenderer.send('doc:state', state),
  isOpenElsewhere: (p) => ipcRenderer.invoke('doc:is-open-elsewhere', p),
  getWorkspace: () => ipcRenderer.invoke('workspace:get'),
  chooseWorkspace: () => ipcRenderer.invoke('workspace:choose'),
  listWorkspace: () => ipcRenderer.invoke('workspace:list'),
  createFile: (dir, name) => ipcRenderer.invoke('workspace:create-file', dir, name),
  createFolder: (dir, name) => ipcRenderer.invoke('workspace:create-folder', dir, name),
  pathForFile: (file) => webUtils.getPathForFile(file),
  reveal: (p) => ipcRenderer.invoke('shell:reveal', p),
  onMenu: on('menu'),
  onWorkspaceChanged: on('workspace-changed'),
});
