const { contextBridge } = require('electron')

contextBridge.exposeInMainWorld('__INKFLOW_DESKTOP__', Object.freeze({
  shell: 'electron',
  apiBase: 'http://127.0.0.1:3001',
}))
