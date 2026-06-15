/* -----------------------------------------------------------
like preload-main.js, preload-content.js has limited access to Node 
it provides a conduit from rudi-apps-framework/framework.js and
RuDI documentation pages to Electron main.js
----------------------------------------------------------- */
const { contextBridge, ipcRenderer } = require('electron');
const allowedEventTypes = [
    "externalLink",
    "showDocumentation"
];
contextBridge.exposeInMainWorld('rudiElectron', {
    appToElectron: (eventType, data) => {
        if(allowedEventTypes.includes(eventType)) 
            ipcRenderer.send(eventType, data)
    }
});
