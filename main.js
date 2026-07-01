/* -----------------------------------------------------------
Overall Electron app logic:
  main.js          launches app and handles interactions with user OS via ipcMain and dialog
  preload-main.js  handles events raised by renderer.js, preprocesses them, and sends to ipcMain
  renderer.js      runs the restricted client-side web page in the BrowserWindow chromium process
This recommended use of inter-process communication (IPC) isolates any third party
web content from node.js and other potential security exosures by maintaining
contextIsolation:true, sandbox:true, and nodeIntegration:false in the client browser.
----------------------------------------------------------- */
// dependencies required to load the main page
const { app, BrowserWindow, WebContentsView, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const net = require('net');
app.commandLine.appendSwitch('disable-http-cache');
// deferred dependencies loaded on demand for faster app loading
let mods = {};
const mod = function(module){
  if(!mods[module]) mods[module] = require(module);
  return mods[module];
}

/* -----------------------------------------------------------
app constants and working variables
----------------------------------------------------------- */
const isDev = process.argv.includes("RUDI_DEV_TOOLS");
let rudiRemoteKey_ = null; // for authorizing http requests in remote and server modes
const rudiRemoteKey = function(){ // key set once on every app instance, i.e., user encounter
  if(!rudiRemoteKey_) rudiRemoteKey_ = mod('crypto').randomBytes(16).toString('hex');
  return rudiRemoteKey_;
}
const desktopAppHelpUrl = 'https://rustydataint.github.io/rudi-desktop-app/';
/* -------------------------------------------------------- */
const startWidth = 1400;
const startHeight = 900;
const terminalWidth = 581 + 1 * 3; // determined empirically, plus css border
const serverPanelWidth = terminalWidth + 2 * 10;
const toggleButtonWidth = 20 + 2 * 1; // set in css
const tabControlsHeight = 31; // set in css, including height, padding, bottom border
const contentsStartX = serverPanelWidth + toggleButtonWidth - 2; 
const bodyBorderWidth = 1;
/* ----------------------------------------------------------- */
let mainWindow = null;
let tabContents = {
  Docs: {
    url: desktopAppHelpUrl,
    proxyRules: "direct://"
  },
  app: {  // the same for all active app tabs
    url: desktopAppHelpUrl,
    proxyRules: "direct://"
  }
};
let externalTabIndex = {}; // for external sites
let activeTabIndex = 0; // where 0 = docs, 1 = first app tab
const showDelay = 1000;
const maxRetries = 10;
let retryCount = 0;
/* ----------------------------------------------------------- */
const isWindows = process.platform.toLowerCase().startsWith("win");
const shellCommand = isWindows ? 'powershell.exe' : 'zsh';
let fsDelimiter = isWindows ? "\\" : "/";
let watchers = [];
/* ----------------------------------------------------------- */
let serverPort = 0; // used as both proxy and shiny ports depending on mode

/* -----------------------------------------------------------
Electron app windows and flow control, see:
  https://www.electronjs.org/docs/latest/tutorial/quick-start
  https://www.electronjs.org/docs/latest/api/app#apprequestsingleinstancelockadditionaldata
----------------------------------------------------------- */
if (app.requestSingleInstanceLock({})) { // allow at most a single instance of the app
  app.on('second-instance', (event, commandLine, workingDirectory, additionalData) => {
    if (mainWindow) { // focus an existing window
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
  app.whenReady().then(() => { // create a non-existent window
    createMainWindow();
    app.on('activate', () => { // for Mac
      if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
    });
  });
  app.on('window-all-closed', () => { // all except Mac
    if (process.platform !== 'darwin') app.quit();
  });
} else {
  app.quit();
}

/* -----------------------------------------------------------
launch the Electron app in the main renderer, i.e., BrowserWindow
----------------------------------------------------------- */
const createMainWindow = () => {
  mainWindow = new BrowserWindow({
    width: startWidth,
    height: startHeight,
    useContentSize: true, // thus, number above are the viewport dimensions
    webPreferences: {
      preload: path.join(__dirname, 'preload-main.js'),
      nodeIntegration: false, // security settings (defaults repeated here for clarity)
      contextIsolation: true,
      sandbox: true
    },
    autoHideMenuBar: true // we don't need a top menu (File, Edit, etc.)
  });

  // set the app title bar based on server mode
  ipcMain.on('setTitle', (event, mode, connection) => {
    const connectedTo = connection ? (" - " + connection.server) : ""; 
    BrowserWindow.fromWebContents(event.sender).setTitle("RuDI " + app.getVersion()  + " " + mode + connectedTo);
  });

  // load the app page that allows users to configure and launch their server
  mainWindow.loadFile('main.html').then(() => { // then load/activate additional contents into the app
    addTabView(tabContents.Docs, false, startHeight, startWidth, contentsStartX); // the documentation tab (index = 0)
    activateAppSshTerminal();
    if(isDev) mainWindow.webContents.openDevTools({ mode: "detach" });   
    activateAutoUpdater();
  });

  // resize views with page
  mainWindow.on('resize', () => {
    if (!mainWindow || !mainWindow.contentView || mainWindow.contentView.children.length === 0) return;
    const windowBounds = mainWindow.getBounds();
    let tabBounds = mainWindow.contentView.children[0].getBounds();
    tabBounds = {
        x:      tabBounds.x,
        width:  windowBounds.width - tabBounds.x - toggleButtonWidth,
        y:      tabBounds.y, 
        height: windowBounds.height - bodyBorderWidth - tabControlsHeight - 40
    };
    for (const tabView of mainWindow.contentView.children) {
      tabView.setBounds(tabBounds);
    }
  });
};

/* -----------------------------------------------------------
attach and fill views with app contents, one or more tabs
----------------------------------------------------------- */
let tabMap = []; // relate tab index to contentView.webContents.id
const addTabView = function(contents, external, viewportHeight, viewportWidth, x) {
  let bounds = viewportHeight ? {
    x:      x,
    width:  viewportWidth - x,
    y:      bodyBorderWidth + tabControlsHeight, 
    height: viewportHeight - bodyBorderWidth - tabControlsHeight    
  } : mainWindow.contentView.children[0].getBounds(); // app tabs all have the same bounds
  const tabView = new WebContentsView({
    webPreferences: {
      preload: path.join(__dirname, 'preload-content.js'),
      nodeIntegration: false, // security settings (defaults repeated here for clarity)
      contextIsolation: true,
      sandbox: true
    }
  });
  mainWindow.contentView.addChildView(tabView);
  tabMap.push(tabView.webContents.id); 
  // LEFT FOR REFERENCE: not preferred since demands target="_blank"; see externalLink action below
  // tabView.webContents.setWindowOpenHandler(({ url }) => { 
  //   shell.openExternal(url);   // redirect external web links to the user's default browser in the OS
  //   return { action: 'deny' }; // requires that link have target="_blank", all others do not hit here
  // });
  tabView.setBounds(bounds);
  const ses = tabView.webContents.session;
  ses.setProxy({
    proxyRules: contents.proxyRules,
    proxyBypassRules: "127.0.0.1,[::1],localhost"
  }).then(() => {
    retryCount = 0;
    retryShowContents(activeTabIndex, contents, external);
  }).catch(console.error);
};
const retryShowContents = (tabIndex, contents, external) => new Promise((resolve, reject) => { 
  retryCount++;
  if(isDev) console.log("attempt #" + retryCount + " to load " + contents.url + " via proxy " + contents.proxyRules);
  const webContents = mainWindow.contentView.children[tabIndex].webContents;
  if(external){
    webContents
      .loadFile("redirect.html", {query: {url: contents.url }})
      .then(resolve)
      .catch(console.error);
  } else {
    webContents
      .loadURL(contents.url + "?rudiRemoteKey=" + rudiRemoteKey()) // send our access key/nonce
      .then(resolve)
      .catch((e) => {
        setTimeout(() => {
          if(retryCount >= maxRetries) return reject(e);
          retryShowContents(tabIndex, contents, external).then(resolve);
        }, showDelay);
      });    
  }
});

/* -----------------------------------------------------------
manage potentially mutiple web content view tabs
----------------------------------------------------------- */
const getActiveTabView = function(){
  let tabMapId = tabMap[activeTabIndex];
  for(const tabView of mainWindow.contentView.children){
    if(tabView.webContents.id === tabMapId) return tabView;
  }
  return undefined;
}
const showActiveTab = function(){
  setTimeout(() => {
    let tabView = getActiveTabView();
    // Calling addChildView on an existing view reorders it to the top.
    // It does this by moving tab to the end of the children list.
    if(tabView === undefined){
      showActiveTab();
    } else {
      mainWindow.contentView.addChildView(tabView);
    }
  }, 100);
}
ipcMain.on("resizePanelWidths", (event, viewportHeight, viewportWidth, serverPanelWidth) => {
  const x = serverPanelWidth + toggleButtonWidth - 2; // as above, don't know why the -2 is needed
  for(const tab of mainWindow.contentView.children){
    tab.setBounds({ 
      x: x, 
      width: viewportWidth - x,         
      y: bodyBorderWidth + tabControlsHeight, 
      height: viewportHeight - bodyBorderWidth - tabControlsHeight
    });
  }
});
const clearAllButDocs1 = function(){
  if (tabMap.length > 1) {
    for (tabIndex = 1; tabIndex < tabMap.length; tabIndex++) { 
      let tabViewId = tabMap[tabIndex];
      for(const tabView of mainWindow.contentView.children){
        if(tabView.webContents.id === tabViewId) {
          tabView.webContents.session.closeAllConnections().then(() => {
            mainWindow.contentView.removeChildView(tabView);
          });
        }
      }
    }
    tabMap.splice(1); 
  }
}
ipcMain.on("showAppContents", (event, url, proxyRules) => { // initialize a new app contents state
  if(!proxyRules) proxyRules = "direct://";
  tabContents.app = { // set the content metadata for this and all sister tabs
    url: url,
    proxyRules: proxyRules
  };
  clearAllButDocs1();
  activeTabIndex = 1;
  addTabView(tabContents.app);
});
ipcMain.on("clearAppContents", (event) => {
  clearAllButDocs1();
  // mainWindow.contentView.children[0].webContents.loadUrl(desktopAppHelpUrl);
});
ipcMain.on("refreshContents", (event) => {
  getActiveTabView().webContents.reload();
});
ipcMain.on("contentsBack", (event, listening) => {
  if(!listening ||
     activeTabIndex === 0 || // don't support back button on app tabs
     Object.values(externalTabIndex).includes(activeTabIndex)
  ) getActiveTabView().webContents.goBack();
});
ipcMain.on("launchExternalTab", (event, listening) => {
  const url = activeTabIndex == 0 || !listening ? tabContents.Docs.url : tabContents.app.url;
  if(confirmExternalUrl(url)) shell.openExternal(url + (
    listening && activeTabIndex > 0 ? 
    "?rudiRemoteKey=" + rudiRemoteKey() :
    ""
  ));
});
ipcMain.on("addTab", (event, viewportHeight, viewportWidth) => {
  activeTabIndex = mainWindow.contentView.children.length;
  addTabView(tabContents.app);
});
ipcMain.on("selectTab", (event, tabIndex) => {
  activeTabIndex = tabIndex;
  showActiveTab();
});
ipcMain.on("closeTab", (event, tabIndex) => {
  let tabViewId = tabMap[tabIndex];
  for(const tabView of mainWindow.contentView.children){
    if(tabView.webContents.id === tabViewId) {
      tabView.webContents.session.closeAllConnections().then(() => {
        mainWindow.contentView.removeChildView(tabView);
      });
    }
  }
  tabMap.splice(tabIndex, 1); 
  if(activeTabIndex > tabIndex){
    activeTabIndex--;
  } else if(activeTabIndex === tabIndex){
    activeTabIndex = Math.min(tabIndex, mainWindow.contentView.children.length - 1);
  }
  showActiveTab();
  for(tab of Object.keys(externalTabIndex)){
    if(externalTabIndex[tab] == tabIndex){
      delete externalTabIndex[tab];
      break;
    } else if(externalTabIndex[tab] > tabIndex){
      externalTabIndex[tab]--;
    }
  }
});

/* -----------------------------------------------------------
enable local file system search for an identity file, directory, etc.
----------------------------------------------------------- */
ipcMain.handle('getLocalFile', (event, options) => {
  let defaultPath = options.defaultPath;
  if(defaultPath === "sshDir") defaultPath = app.getPath('home') + fsDelimiter + ".ssh";
  if(!defaultPath || !mod('fs').existsSync(defaultPath)) defaultPath = app.getPath('home');
  const files = dialog.showOpenDialogSync(mainWindow, {
    defaultPath: defaultPath,
    properties: [
      options.type === "file" ? "openFile" : "openDirectory",
      "showHiddenFiles"
    ]
  });  
  return files ? files[0] : undefined;
});

/* -----------------------------------------------------------
enable system error and message dialogs via Electron dialog API and electron-prompt
----------------------------------------------------------- */
ipcMain.on('showMessageBoxSync', (event, options) => {
  const result = dialog.showMessageBoxSync(BrowserWindow.fromWebContents(event.sender), options);
  if(options.rudiEvent) mainWindow.webContents.send(options.rudiEvent, result); 
});
ipcMain.on('showPrompt', (event, options) => {
  mod("electron-prompt")(options).then((result) => {
    if(result) mainWindow.webContents.send(options.rudiEvent, result); 
  }).catch(console.error);
});

/* -----------------------------------------------------------
activate the in-app node-pty pseudo-terminal that runs the remote server
----------------------------------------------------------- */
let terminalInitSize = null; // capture early xterm resize before pty is active
const setInitPtySize = (event, size) => terminalInitSize = size;
ipcMain.on('ptyResize', setInitPtySize);
const activateAppSshTerminal = function(){

  // open a pseudo-terminal to the local computer's command shell
  // this terminal will receive appropriate subsequent connect/install/run commands
  let ptyProcess = mod("node-pty").spawn(shellCommand, [], {
    name: 'rudi-remote-terminal',
    cols: 80,
    rows: 24,
    cwd: app.getPath('home'),
    env: process.env
  });
  ptyProcess.onExit(() => { // handle rare condition where pty exits while app is running
    activateAppSshTerminal();
  });

  // support dynamic terminal resizing
  ipcMain.on('ptyResize', (event, size) => ptyProcess.resize(size.cols, size.rows));
  ipcMain.removeListener('ptyResize', setInitPtySize);
  if(terminalInitSize) ptyProcess.resize(terminalInitSize.cols, terminalInitSize.rows);

  // establish data flow between the back-end node-pty pseudo-terminal and the front-end xterm terminal window
  ipcMain.on('xtermToPty',  (event, data) => ptyProcess.write(data));
  const lineClearRegex = /\x1b\[K\s+/; // https://notes.burke.libbey.me/ansi-escape-codes/
  ptyProcess.onData(data => {
    if(watchers.length > 0 && !data.match(lineClearRegex)) {
      for(let i = watchers.length - 1; i >= 0; i--) {
        const watcher = watchers[i];
        watcher.buffer += data;
        const match = watcher.buffer.match(watcher.for);
        if(match) {
          mainWindow.webContents.send(watcher.event, match[0], watcher.data);
          watchers.splice(i, 1); // remove this watcher after it triggers
        }
      }
    }
    mainWindow.webContents.send('ptyToXterm', data);
  });

  // establish/terminate an ssh connection to the remote server on user request
  // these actions are only used in remote, not local, server modes
  ipcMain.on('sshConnect', (event, sshCommand) => {
    sshCommand = sshCommand.join(" ") + "\r";
    getRandomFreeLocalPort().then((port) => {
      serverPort = port;
      ptyProcess.write(sshCommand.replaceAll("__serverPort__", port));
      mainWindow.webContents.send("connectedState", {connected: true}); // TODO: smarter way to know whether connection was successful?  
    })
  });
  ipcMain.on('sshDisconnect', (event) => {
    ptyProcess.write("\r" + "exit" + "\r\r"); // sometimes need to subsequently type Ctrl-C in terminal window (but not here)
    mainWindow.webContents.send("connectedState", {connected: false});
  });

  // install and run commands on the local or remote server on user request
  // these actions are always required to launch apps
  ipcMain.on('installServer', (event, rudi) => {
    if(rudi.mode == "Local"){ // parse local command here due to OS dependency
      console.log("pending");
      // parseRudiPath(rudi).then((rudi) => {
      //   const rScript = getRScript(rudi);
      //   const commands = [
      //     [
      //       rScript.target, "-e", // make sure remotes is installed
      //       "\"" + rScript.libPaths + "; if(require('remotes', character.only = TRUE) == FALSE) install.packages('remotes', repos = 'https://cloud.r-project.org', Ncpus = 4)\""
      //     ].join(" "),
      //     [
      //       rScript.target, "-e", // make sure mdi-manager is installed
      //       "\"" + rScript.libPaths + "; remotes::install_github('RustyDataInt/mdi-manager')\""
      //     ].join(" "),
      //     [
      //       rScript.target, "-e", // install rudi
      //       ["\"" + rScript.libPaths + "; mdi::install('", mdi.opt.mdiDir, "', hostDir = '", mdi.opt.hostDir, "', confirm = FALSE)\""].join("")
      //     ].join(" ")
      //   ];
      //   ptyProcess.write(commands.join("\r") + "\r");
      // }).catch(() => {});
    } else { // remote modes sent as a rudi command sequence set by preload-main.js
      ptyProcess.write(rudi.commands.join("; ") + "\r");
    }
  });  
  ipcMain.on('startServer', (event, rudi) => {
    watchers = [
      {
        buffer: "",
        for: /\nApp server running on host port .+:\d+/,
        event: "nodeHost",
        data: {}
      },
      {
        buffer: "",
        // for: /INFO Build completed successfully in .+ launching app!/,
        for: /Serving your app: .+!/,
        event: "listeningState",
        data: {
          listening: true,
          developer: rudi.opt.regular.developer, // logical
          mode: rudi.mode,
          serverPort: serverPort
        }
      }
    ]; 
    if(rudi.mode == "Local"){ // parse local command here due to OS dependency
      console.log("pending");
      // parseRudiPath(rudi).then((rudi) => {
      //   ptyProcess.write(isWindows ? "$env:RUDI_IS_ELECTRON='TRUE'\r" : "export RUDI_IS_ELECTRON=TRUE\r"); 
      //   const rScript = getRScript(rudi);
      //   const command = [
      //     rScript.target, "-e",
      //     [
      //       "\"" + rScript.libPaths + "; mdi::run('", mdi.opt.mdiDir,  
      //       "', dataDir = '", mdi.opt.dataDir, 
      //       "', port = ", "NULL", // R Shiny auto-selects local ports
      //       ", install = ", mdi.opt.install, 
      //       ", debug = ", "TRUE", // mdi.opt.developer,
      //       ", developer = ", mdi.opt.developer, // as string
      //       ", browser = ", "FALSE", // if TRUE, an external Chrome window is spawned
      //       ")\"" // install = TRUE
      //     ].join("")
      //   ];
      //   ptyProcess.write(command.join(" ") + "\r");        
      // }).catch(() => {});
    } else { // remote modes sent as a command sequence set by preload-main.js
      ptyProcess.write("export RUDI_IS_ELECTRON=TRUE\r"); // let apps known they are running in Electron
      ptyProcess.write("export RUDI_REMOTE_KEY=" + rudiRemoteKey() + "\r");
      let command = rudi.command.join(" ") + "\r";
      ptyProcess.write(command.replaceAll("__serverPort__", serverPort));
    }
  });  
  const stopServer = function(mode){
    ptyProcess.write(
      mode === "Local" ? 
      '\x03' :  // SIGNIT, Ctrl-C, ^C, ASCII 3
      // "\rquit\r" // key sequence to kill a server in remote-<server|node>.sh
      "\x03\rquit\r" // key sequence to kill a server in remote-<server|node>.sh
    );
    mainWindow.webContents.send("listeningState", null, {listening: false});    
  }
  ipcMain.on('stopServer', (event, mode) => {
    clearAllButDocs1();
    stopServer(mode);
    // const closePromises = [];
    // if (tabMap.length > 1) {
    //   for (let i = 1; i < tabMap.length; i++) {
    //     const tabViewId = tabMap[i];
    //     for (const tabView of mainWindow.contentView.children) {
    //       if (tabView.webContents.id === tabViewId) {
    //         closePromises.push(tabView.webContents.session.closeAllConnections());
    //         break;
    //       }
    //     }
    //   }
    //   Promise.all(closePromises).then(() => {
    //     stopServer(mode);
    //   });
    // } else {
    //   stopServer(mode);
    // }
  });  
}

/* -----------------------------------------------------------
support port discovery for making ssh connections in terminal
return a promise that resolves to a single, random, free local port 
  this port may or may not be free on the server (but probably is)
  very rarely, this can result in a local race condition
----------------------------------------------------------- */
const checkCandidatePort = (port) => new Promise((resolve, reject) => { 
  const server = net.createServer();
  server.unref();
  server.on('error', reject);
  server.listen(port, () => server.close(() => resolve(port)));
})
const getRandomFreeLocalPort = () => new Promise((resolve, reject) => { 
  const minPort = 1024; 
  const maxPort = 65535;
  const port = Math.floor(Math.random() * (maxPort - minPort) ) + minPort;    
  return checkCandidatePort(port)
    .then(resolve)
    .catch(() => { // step forward from a random starting port until a free port is found
      getRandomFreeLocalPort().then(resolve);
    })
})

/* -----------------------------------------------------------
local file path utility functions
----------------------------------------------------------- */
const parseRudiPath = (rudi) => new Promise((resolve, reject) => { 
  // resolve ~ to HOME
  rudi.opt.rudiDir = rudi.opt.rudiDir.replace("~/", process.env.HOME + "/");
  // if missing, add '/rudi' to directory
  const tail ='/rudi';
  if(!rudi.opt.rudiDir.endsWith(tail)) rudi.opt.rudiDir = rudi.opt.rudiDir + tail;  
  // resolve if either directory or its parent exists  
  if(mod('fs').existsSync(rudi.opt.rudiDir)) return resolve(rudi);
  if(mod('fs').existsSync(path.dirname(rudi.opt.rudiDir))) {
    mod('fs').mkdirSync(rudi.opt.rudiDir);
    return resolve(rudi);
  };
  dialog.showMessageBoxSync(mainWindow, {
    title: "Bad Rudi Directory",
    message: "Rudi Directory is not a valid local path for Rudi installation.",
    type: "warning"
  });
  reject();
});

/* -----------------------------------------------------------
handle IPC from apps to Electron
----------------------------------------------------------- */
const allowedExternalUrls = { // exert explicit control over the external sites we support
  Docs:     /^http[s]*:\/\/[a-zA-Z0-9-_.]*github\.io\//, // all other urls/targets are ignored  
  GitHub:   /^http[s]*:\/\/[a-zA-Z0-9-_.]*github\.com\//,
  // Globus:   /^http[s]*:\/\/[a-zA-Z0-9-_.]*globus\.org\//,
  // Electron: /^http[s]*:\/\/[a-zA-Z0-9-_.]*electronjs\.org\//,
  // Google:   /^http[s]*:\/\/[a-zA-Z0-9-_.]*google\.com\//,
  // UMich:    /^http[s]*:\/\/[a-zA-Z0-9-_.]*umich\.edu\//
};
const showDocumentation = function(url){
  if(url.match(allowedExternalUrls.Docs)) {
    tabContents.Docs = {
      url: url,
      proxyRules: "direct://"
    };
    activeTabIndex = 0; // i.e., the permanent docs tab
    retryCount = 0;
    retryShowContents(activeTabIndex, tabContents.Docs).then(() => {
      showActiveTab();
      mainWindow.webContents.send('showDocumentation', url);
    }).catch(console.error);
  } else {
    if(isDev) console.log("bad documentation url: " + url);
  }
};
ipcMain.on("showDocumentation", (event, url) => showDocumentation(url));
ipcMain.on("externalLink", (event, data) => {
  if(!data.url || !data.target) return;
  if(data.target == "Docs") return showDocumentation(data.url);
  for(tab of Object.keys(allowedExternalUrls)){
    if(data.url.match(allowedExternalUrls[tab])){
      tabContents[tab] = {
        url: data.url,
        proxyRules: "direct://"
      };
      if(externalTabIndex[tab]){ // allow exactly one tab per external site
        activeTabIndex = externalTabIndex[tab];
        retryCount = 0;
        retryShowContents(activeTabIndex, tabContents[tab], true).then(() => {
          showActiveTab();
          mainWindow.webContents.send('showExternalLink', tab, activeTabIndex, false);
        }).catch(console.error);
      } else { // first instance of a new external target
        activeTabIndex = mainWindow.contentView.children.length;
        addTabView(tabContents[tab], true);
        externalTabIndex[tab] = activeTabIndex;
        mainWindow.webContents.send('showExternalLink', tab, activeTabIndex, true);
      }
      return;
    }
  }
  if(confirmExternalUrl(data.url)) shell.openExternal(data.url);
});
const confirmExternalUrl = function(url){
  return dialog.showMessageBoxSync(
    mainWindow, 
    {
      message: "Do you wish to launch the following site " + 
               "in your default browser, e.g., Chrome or Safari.\n\n" + url,
      type: "question",
      title: "  Launch External Browser",
      buttons: ["Cancel", "Confirm"],
      noLink: true
    }
  );
}

/* -----------------------------------------------------------
support automatic update via electron-builder and electron-updater
----------------------------------------------------------- */
const sendAutoUpdate = (message) => mainWindow.webContents.send("autoUpdateStatus", message);
const activateAutoUpdater = function(){
  const { autoUpdater } = require("electron-updater"); 
  // autoUpdater.on('checking-for-update', () => {
  //   sendAutoUpdate('Checking for update...');
  // });
  // autoUpdater.on('update-available', (info) => {
  //   sendAutoUpdate('Update available.');
  // })
  // autoUpdater.on('update-not-available', (info) => {
  //   sendAutoUpdate('Update not available.');
  // });
  // autoUpdater.on('error', (err) => {
  //   sendAutoUpdate('Error in auto-updater. ' + err);
  // });
  // autoUpdater.on('download-progress', (progressObj) => {
  //   let log_message = "Download speed: " + progressObj.bytesPerSecond;
  //   log_message = log_message + ' - Downloaded ' + progressObj.percent + '%';
  //   log_message = log_message + ' (' + progressObj.transferred + "/" + progressObj.total + ')';
  //   sendAutoUpdate(log_message);
  // });
  // autoUpdater.on('update-downloaded', (info) => {
  //   sendAutoUpdate('Update downloaded');
  //   sendAutoUpdate(info);
  // });
  autoUpdater.checkForUpdatesAndNotify(); // immediately download an update, install when app quits
};
