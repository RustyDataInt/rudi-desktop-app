/* -----------------------------------------------------------
renderer.js has no access to Node or local system except through preload-main.js contextBridge
----------------------------------------------------------- */
rudi.autoUpdateStatus((event, message) => console.log);

/* -----------------------------------------------------------
initialize the xterm terminal window and associated events and data flow
----------------------------------------------------------- */
const terminalDiv  = document.getElementById("terminal");
const terminalCopy = document.getElementById("copy-terminal-selected");
const xtermCols = 80; // fixed
let xtermRows = 24;   // dynamically resized
const xtermCharHeight = 280 / 20; // determined empirically
const xterm = new Terminal({
    cols: xtermCols,
    rows: xtermRows,
    fontFamily: "monospace",
    fontSize: 12,
    cursorStyle: "bar",
    cursorBlink: true,
    cursorWidth: 2
});
xterm.open(terminalDiv);
xterm.onResize((size) => rudi.ptyResize(size));
xterm.onData((data) => rudi.xtermToPty(data));
rudi.ptyToXterm((event, data) => { xterm.write(data) });
let xtermSelected = ""; // enable a dynamic prompt for user to copy selected text from the terminal
xterm.onSelectionChange(() => {
    xtermSelected = xterm.getSelection();
    setButtonsVisibility();
});
terminalCopy.addEventListener("click", () => {
    navigator.clipboard.writeText(xtermSelected);
})

/* -----------------------------------------------------------
activate dynamic element resizing
----------------------------------------------------------- */
const serverConfigPanel = document.getElementById("server-config");
const toggleButton = document.getElementById('server-panel-toggle');
const tabControls = document.getElementById('contents-tab-controls');
const terminalWidth = 581 + 1 * 3; // determined empirically, plus css border
const serverPanelPadding = 10;
const serverPanelWidth = terminalWidth + 2 * serverPanelPadding;
const toggleButtonWidth = 20 + 2 * 1; // set in css
let serverPanelWorkingWidth = serverPanelWidth;
const resizePanelWidths = function(skipIpc){ // control the horizontal display, for hiding serverPanel under contentView 
    const x = serverPanelWorkingWidth + toggleButtonWidth - 2;
    if(!skipIpc) rudi.resizePanelWidths(window.innerHeight, window.innerWidth, serverPanelWorkingWidth);
    toggleButton.style.left = serverPanelWorkingWidth + "px";
    tabControls.style.left = x + "px";
    tabControls.style.width = (window.innerWidth - x + 1) + "px";
}
const resizePanelHeights = function(){ // control xterm terminal height based on viewport and options displays
    const xtermHeight = window.innerHeight - serverConfigPanel.clientHeight - 2 * serverPanelPadding;
    const xtermRows = Math.max(1, Math.floor(xtermHeight / xtermCharHeight));
    xterm.resize(xtermCols, xtermRows);    
}
const resizePanels = function(skipIpc){
    resizePanelWidths(skipIpc);
    resizePanelHeights();
}
resizePanels();
window.addEventListener('resize', (event) => resizePanels(true));

/* -----------------------------------------------------------
activate the button to toggle server-panel visibility, with a bit of animation
----------------------------------------------------------- */
const toggleServerPanel = function(){
    const collapsing = serverPanelWorkingWidth > 0;
    let id = null;
    let target = null;
    let inc = null;
    if(collapsing){
        target = 0;
        inc = -1;
    } else {
        target = serverPanelWidth;
        inc = 1;
    }
    clearInterval(id);
    const animate = function() {
        if (serverPanelWorkingWidth == target) {
            clearInterval(id);
            toggleButton.innerHTML = collapsing ? "&#9658;" : "&#9668;";
        } else {
            serverPanelWorkingWidth += Math.floor(inc * serverPanelWidth / 50); // animation speed set here
            serverPanelWorkingWidth = Math.min(Math.max(serverPanelWorkingWidth, 0), serverPanelWidth);
            resizePanelWidths();
        }
    }    
    id = setInterval(animate, 0);
}
toggleButton.addEventListener('click', function(event) {
    toggleServerPanel();
});

/* -----------------------------------------------------------
activate the apps server action buttons
----------------------------------------------------------- */
const sshConnectButton    = document.getElementById('ssh-connect');
const sshDisconnectButton = document.getElementById('ssh-disconnect');
const installServerButton = document.getElementById('install-server');
const startServerButton   = document.getElementById('start-server');
const stopServerButton    = document.getElementById('stop-server');
const spawnTerminalButton = document.getElementById('spawn-terminal');
const buttonsHr = document.getElementById('buttons-hr');
let serverState = {
    connected: false, // whether an ssh connection has been established
    listening: false, // whether the apps framework is running
    nButtons: 0
};
const setButtonVisibility = function(button, isVisible){
    button.style.display = isVisible ? "inline-block" : "none";
    if(isVisible) serverState.nButtons++;
}
let allowExternalTab = true;
const launchExternalTab = document.getElementById('launch-external-tab');
const setButtonsVisibility = function(){
    const config = presets[presetSelect.value];
    const isLocal = config.mode == "Local";
    const isConnected = isLocal || serverState.connected;
    const sshIsReady = checkActionReadiness("ssh", true).success;
    const installIsReady = checkActionReadiness("rudi", "install").success;
    const runIsReady = checkActionReadiness("ssh", "run").success;
    const terminalIsReady = checkActionReadiness("ssh", false).success;
    serverState.nButtons = 0;
    setButtonVisibility(sshConnectButton,    !isLocal && sshIsReady && !serverState.connected);
    setButtonVisibility(sshDisconnectButton, !isLocal && sshIsReady &&  serverState.connected && !serverState.listening);
    setButtonVisibility(installServerButton, isConnected && installIsReady && !serverState.listening);
    setButtonVisibility(startServerButton,   isConnected && runIsReady && !serverState.listening);
    setButtonVisibility(stopServerButton,    isConnected && serverState.listening);
    setButtonVisibility(spawnTerminalButton, terminalIsReady);
    setButtonVisibility(terminalCopy,        terminalIsReady && xtermSelected);
    buttonsHr.style.display = serverState.nButtons > 0 ? "block" : "none";
    allowExternalTab = !serverState.listening || config.mode !== "Node";
    launchExternalTab.style.opacity = allowExternalTab ? 1 : 0.2;
    resizePanelHeights();
}
const sshRequiredOptions = function(config, createTunnel){
    const isLocal = config.mode === "Local";
    const isNode = config.mode === "Node";
    return {
        regular:{
            user: !isLocal,
            serverDomain: !isLocal
        },
        advanced:{ }
    }    
};
const rudiRequiredOptions = function(config, action){
    const isInstall = action === "install";    
    const isLocal = config.mode === "Local";
    const isNode  = config.mode === "Node";
    const isNodeRun = !isInstall && isNode
    return {
        regular: {
            serverDomain: !isInstall && !isLocal,
            clusterAccount: isNodeRun,
            jobTimeMinutes: isNodeRun,
            rudiDirectoryRemote: !isLocal,
            rudiDirectoryLocal: isLocal
        },
        advanced: {                 
            cpusPerTask: isNodeRun,
            memPerCpu: isNodeRun
        }
    }   
}
checkActionReadiness = function(commandType, extra){
    const config = presets[presetSelect.value];
    const requiredOptions = commandType == "ssh" ? sshRequiredOptions(config, extra) : rudiRequiredOptions(config, extra);
    for(optionType of ["regular", "advanced"]){
        for(option of Object.keys(requiredOptions[optionType])){
            if(!requiredOptions[optionType][option]) continue;
            if(!config.options[optionType][option]) return {success: false, option: option};
        }
    }
    return {success: true, config: config};
}
const getConfig = function(commandType, extra){
    const check = checkActionReadiness(commandType, extra);
    if(check.success) {
        const tail ='/rudi';
        remoteDir = check.config.options.regular.rudiDirectoryRemote;
        if(remoteDir && !remoteDir.endsWith(tail)) check.config.options.regular.rudiDirectoryRemote = remoteDir + tail; 
        return check.config;
    }
    rudi.showMessageBoxSync({
        message: "Option '" + check.option + "' is required for " + commandType + " actions.",
        type: "warning",
        title: "  Missing Option Value"
    });
};
/* ---  remote connect/disconnect (approved by logging in) --- */
sshConnectButton.addEventListener('click', function(event) {
    const config = getConfig('ssh', true);
    if(!config) return;
    rudi.sshConnect(config);
    xterm.focus();
});
sshDisconnectButton.addEventListener('click', function(event) {
    const config = getConfig('ssh', false);
    if(!config) return;
    rudi.sshDisconnect();
    xterm.focus();
});
/* ---  approve installation, per installation target --- */
const approvedInstallationsKey = "approved-installations";
const installServer = function(config){
    rudi.installServer(config);
    xterm.focus();      
}
rudi.confirmInstall((event, result) => {
    if(!result) return;
    const config = getConfig('rudi', 'install');
    const installationKey = getInstallationKey(config);
    let approvedInstallations = JSON.parse(localStorage.getItem(approvedInstallationsKey));
    approvedInstallations[installationKey] = true;
    localStorage.setItem(approvedInstallationsKey, JSON.stringify(approvedInstallations));
    installServer(config);
});
const getInstallationKey = function(config){
    let installationKey = config.mode == "Local" ?
        [
            config.mode,
            config.options.regular.rudiDirectoryLocal
        ] : [
            config.mode,
            config.options.regular.serverDomain, 
            config.options.regular.rudiDirectoryRemote
        ];
    return installationKey.join("\n");
}
installServerButton.addEventListener('click', function(event) {
    const config = getConfig('rudi', 'install');
    if(!config) return;    
    let approvedInstallations = localStorage.getItem(approvedInstallationsKey);
    if(approvedInstallations) {
        approvedInstallations = JSON.parse(approvedInstallations);
    } else {
        approvedInstallations = {};
        localStorage.setItem(approvedInstallationsKey, JSON.stringify(approvedInstallations));
    }
    const installationKey = getInstallationKey(config);
    if(approvedInstallations[installationKey]) return installServer(config);
    rudi.showMessageBoxSync({
        message: "This action will use R to install the server at:\n\n" + 
                  installationKey + "\n\n" + 
                 "Click 'Confirm' to continue.",
        type: "question",
        title: "  Confirm Server Installation",
        buttons: ["Cancel", "Confirm"],
        noLink: true,
        rudiEvent: "confirmInstall"
    });
});
/* ---  server start/stop (approved by prior installation) --- */
startServerButton.addEventListener('click', function(event) {
    const config = getConfig('rudi', 'run');
    if(!config) return;
    rudi.startServer(config);
});
stopServerButton.addEventListener('click', function(event) {
    const config = getConfig('rudi', 'run');
    if(!config) return;
    rudi.stopServer(config);
    xterm.focus();
});
/* ---  approve terminal open --- */
const terminalApprovalKey = "terminal-is-approved";
const spawnTerminal = function(){
    const config = getConfig('ssh', false);
    if(!config) return;
    rudi.spawnTerminal(config);        
}
rudi.confirmTerminal((event, result) => {
    if(!result) return;
    localStorage.setItem(terminalApprovalKey, true);
    spawnTerminal();
});
spawnTerminalButton.addEventListener('click', function(event) {
    if(localStorage.getItem(terminalApprovalKey)) return spawnTerminal();
    rudi.showMessageBoxSync({
        message: "This action will open an external Terminal window on your computer.\n\n" + 
                 "The window will not be part of the Desktop and must be closed separately.\n\n" + 
                 "Click 'Confirm' to continue.",
        type: "question",
        title: "  Confirm Terminal Open",
        buttons: ["Cancel", "Confirm"],
        noLink: true,
        rudiEvent: "confirmTerminal"
    });
});

/* -----------------------------------------------------------
activate dynamic server configuration inputs (initialized in upside-down fashion)
----------------------------------------------------------- */

// use IPC to access the local file system
const fileOptionInputs = document.getElementsByClassName('fileOptionInput');
for (const fileOptionInput of fileOptionInputs) {
    const elements = fileOptionInput.children;
    elements[1].addEventListener('click', async () => {
        const filePath = await rudi.getLocalFile({
            defaultPath: elements[0].value || elements[1].dataset.default,
            type: elements[1].dataset.type
        });
        if(filePath) elements[0].value = filePath;
        elements[0].dispatchEvent(new Event('change', {bubbles: true}));
    });
}

// act on option value changes
// edits are always accumulated in the "Working" configuration
const optionForms   = document.getElementsByClassName('optionsForm');
const configOptions = document.getElementsByClassName('config-option');
const commitWorkingChanges = function(){
    savePresets();
    presetSelect.value = "working";
    setButtonsVisibility();    
}
const handleInputChange = function(form, input){
    const type = form.dataset.type; 
    const option = input.name;
    const value = input.type === "checkbox" ? input.checked : input.value.trim();
    const currentPreset = presets[presetSelect.value];
    if(presetSelect.value !== "working" || !presets.working.options) {
        presets.working = structuredClone(currentPreset);
    }
    if(presets.working.options       === undefined) presets.working.options       = structuredClone(defaultPreset.options);
    if(presets.working.options[type] === undefined) presets.working.options[type] = structuredClone(defaultPreset.options[type]);
    presets.working.options[type][option] = value;
    commitWorkingChanges();
}
for (const optionForm of optionForms){ // listen to the form to catch input change events by propagation
    optionForm.addEventListener('change', function(event){
        handleInputChange(this, event.target);
    });
}

// control the available options based on server mode
const setServerMode = function(mode, suppressWorking){
    rudi.setTitle(mode)
    for (const configOption of configOptions) {
        configOption.style.display = configOption.classList.contains(mode) ? "block" : "none";
    }
    for (const modeRadio of modeRadios) {
        modeRadio.checked = modeRadio.value === mode;
    }
    const config = presets[presetSelect.value].options;
    for (const optionForm of optionForms){ // update input values from the preset + mode
        const optionType = optionForm.dataset.type;
        for(const input of optionForm.elements){
            const option = input.name;
            const value = config[optionType][option];
            if(input.type === "checkbox"){
                input.checked = value;
            } else {
                input.value = value || "";
            }
        }
    }
    resizePanelHeights();
    presets.working.mode = mode;
    suppressWorking ? setButtonsVisibility() : commitWorkingChanges();
}

// control available options based on show/hide advanced link
const toggleAdvanced  = document.getElementById('toggleAdvanced');
const advancedOptions = document.getElementById('advancedOptions');
let advancedAreVisible = false;
toggleAdvanced.addEventListener('click', function(){
    advancedAreVisible = !advancedAreVisible;
    advancedOptions.style.display = advancedAreVisible ? "block" : "none";
    resizePanelHeights();
});

// server mode, i.e., where the apps framework will run
const modeRadios = document.serverMode.mode;
for (const modeRadio of modeRadios) {
    modeRadio.addEventListener('change', function(){
        // presets.working = presets[presetSelect.value]; // since setServerMode changes to Working
        setServerMode(this.value);
    });
}

// save/load user-defined configurations, i.e., Presets, from localStorage
const presetSelect = document.getElementById('preset');
const presetsKey = "rudi-desktop-presets";
const restrictedPresets = ["defaults", "mostRecent", "working"];
const defaultPreset = { // for quickest creation of a config for UM Great Lakes remote mode
    mode: "Local",
    options: {
        regular:{
            user: "",
            serverDomain: "greatlakes.arc-ts.umich.edu",
            clusterAccount: "",
            jobTimeMinutes: 120,
            rudiDirectoryRemote: "~/rudi",
            rudiDirectoryLocal: "~/rudi",
            developer: false
        },
        advanced:{
            identityFile: "",            
            dataDirectoryRemote: "",
            dataDirectoryLocal: "",
            cpusPerTask: 2,
            memPerCpu: "4g",
            quickStart: false
        }
    }
};
let presets = localStorage.getItem(presetsKey);
const savePresets = function(setMostRecent) {
    if(setMostRecent){ // save the current preset as last known good config state for next app load
        const config = presets[presetSelect.value];
        presets.mostRecent = structuredClone(config);
    }
    localStorage.setItem(presetsKey, JSON.stringify(presets));
}
if(!presets) {
    presets = {
        defaults:   structuredClone(defaultPreset),
        mostRecent: structuredClone(defaultPreset),
        working:    structuredClone(defaultPreset)
    };
    savePresets();
} else {
    presets = JSON.parse(presets);
}
const updatePresets = function(){
    let current = [];
    for(option of presetSelect.options) current.push(option.value);
    let new_ = Object.keys(presets);
    for(let i = current.length - 1; i >= 0; i--){ // delete action
        const x = current[i];
        if(!new_.includes(x) && !restrictedPresets.includes(x)) presetSelect.remove(i);
    }
    for(const x of new_.sort()){ // initialize and add actions; order user configs alphabetically
        if(!current.includes(x)) {
            const option = document.createElement("option");
            option.value = x;
            option.text = x;
            presetSelect.add(option);            
        }
    }  
}
const changeToPreset = function(presetName){
    let preset = presets[presetName];
    if(!preset) preset = structuredClone(defaultPreset);
    presets.working = structuredClone(preset);
    presetSelect.value = presetName; // Ensure select is in sync
    setServerMode(preset.mode, true);
};
presetSelect.addEventListener('change', function(){ 
    changeToPreset(this.value);
});

// on page load, show the last state of the desktop, whether saved as a named preset or not
updatePresets();
changeToPreset("mostRecent");

/* -----------------------------------------------------------
enable user to save/delete named preset configurations
----------------------------------------------------------- */
const savePresetAs = document.getElementById("savePresetAs");
const deletePreset = document.getElementById("deletePreset");
savePresetAs.addEventListener("click", function(){
    const current = presetSelect.value;
    rudi.showPrompt({
        title: 'Enter Configuration Name',
        label: 'Please enter the desired configuration name:',
        value: restrictedPresets.includes(current) ? "" : current,
        buttonLabels: {
            ok: "Save",
            cancel: "Cancel"
        },
        inputAttrs: {
            type: 'text'
        },
        height: 200,
        width: 400,
        alwaysOnTop: true,
        rudiEvent: "configurationName"
    });
});
rudi.configurationName((event, result) => {
    presets[result] = presets[presetSelect.value];
    savePresets();
    updatePresets();
    changeToPreset(result);
});
deletePreset.addEventListener("click", function(){
    const current = presetSelect.value;
    if(restrictedPresets.includes(current)) return;    
    rudi.showMessageBoxSync({
        message: "Please confirm deletion of configuration '" + current + "'. This cannot be undone.",
        type: "warning",
        title: "  Confirm Deletion",
        buttons: ["Cancel", "Delete"],
        noLink: true,
        rudiEvent: "confirmDelete"
    });
});
rudi.confirmDelete((event, result) => {
    if(!result) return; // user clicked cancel  
    delete presets[presetSelect.value];
    savePresets();
    updatePresets();
    changeToPreset("mostRecent");
});

/* -----------------------------------------------------------
respond to data stream watches and other pty state events
----------------------------------------------------------- */
const iframe = document.getElementById("embedded-apps-framework");
const setConnectedTitle = function(){
    const config = presets[presetSelect.value];
    const opt = config.options;
    const active = serverState.connected || serverState.listening;
    const connection = !active ? null : {
        server: config.mode == "Local" ? 
          opt.regular.rudiDirectoryLocal :
          opt.regular.serverDomain + ":" + opt.regular.rudiDirectoryRemote
    };
    rudi.setTitle(config.mode, connection);
}
const disableWhenConnected = [
    "preset", // inputs required to make remote connections, i.e., before server is started
    "mode",
    "user",
    "serverDomain",
    "identityFile"
];
const disableConnectedInputs = function(){
    const isLocal = presets[presetSelect.value].mode == "Local";
    for(const form of document.forms){ // all inputs on the server config forms
        for(option of form.elements){
            option.disabled = serverState.listening || // all options disabled when server is running
              (!isLocal && disableWhenConnected.includes(option.name) && serverState.connected); // otherwise those required for ssh
        }
    }    
}
rudi.connectedState((event, data) => { 
    serverState.connected = data.connected;
    setButtonsVisibility();
    if(serverState.connected) savePresets(true);
    setConnectedTitle();
    disableConnectedInputs();
});
rudi.listeningState((event, match, data) => { 
    serverState.listening = data.listening;
    setButtonsVisibility();
    if(serverState.listening){
        savePresets(true);
        const isNode = data.mode == "Node";
        const url = isNode ? 
            "http://" + match.match(/\S+:\d+/)[0]:
            match.match(/http:\/\/.+:\d+/)[0];
        const proxyRules = isNode ? 
            "socks5://127.0.0.1:" + data.serverPort : 
            null;
        clearAddedTabs();
        addTabDiv();
        activeTabIndex = 1;
        setTimeout(() => {
            xterm.write("\n\rplease wait a moment for the page to load\n\r");
            rudi.showFrameworkContents(url, proxyRules);
            if(serverPanelWorkingWidth > 0 && // auto-hide server panel unless developing
               !data.developer) toggleServerPanel();
        }, isNode ? 5000 : 0); // since node mode hits its signal before the server initializes
    } else {
        rudi.clearFrameworkContents(); 
        if(serverPanelWorkingWidth == 0) toggleServerPanel();
        clearAddedTabs();
        activeTabIndex = 0;
    }
    setConnectedTitle(); 
    disableConnectedInputs();
});

/* -----------------------------------------------------------
contents BrowserView tab controls
----------------------------------------------------------- */
const refreshContents = document.getElementById('contents-refresh');
const contentsBack = document.getElementById('contents-back');
const addTab = document.getElementById('add-tab');
const contentsTabs = document.getElementById('contents-tabs')
refreshContents.addEventListener("click", () => rudi.refreshContents());
contentsBack.addEventListener("click", () => rudi.contentsBack(serverState.listening));
let nTabs = 1; // the actual number of current tabs
let tabCounter = 1; // accumulates over all tabs ever opened
let activeTabIndex = 0; // the docs tab
const setActiveTab = function(tabIndex){ 
    activeTabIndex = tabIndex;
    rudi.selectTab(activeTabIndex);  
    for(const tab of contentsTabs.children) {
        if(parseInt(tab.dataset.index) === activeTabIndex) tab.classList.add('active-tab') 
        else tab.classList.remove('active-tab') 
    }         
}
const clearAddedTabs = function(){ // revert to a single docs tab on app listening state change
    if(nTabs > 1) for(let i = nTabs - 1; i > 0; i--) contentsTabs.children[i].remove();
    nTabs = 1;
    tabCounter = 1;
    activeTabIndex = 0;
    setActiveTab(activeTabIndex);   
}
const addTabListener = function(tab){ // listen for both tab select and close on the tab div
    tab.addEventListener("click", function(event){
        const tabIndex = parseInt(tab.dataset.index);
        if(event.target.classList.contains("contents-tab")){ // a tab select event
            setActiveTab(tabIndex);
        } else { // a tab close event
            rudi.closeTab(tabIndex);
            contentsTabs.children[tabIndex].remove();
            nTabs--; 
            let i = 0;
            for(const x of contentsTabs.children) {
                x.dataset.index = i; // re-index the remaining tabs
                i++;
            }
            setActiveTab(activeTabIndex >= tabIndex ? activeTabIndex - 1 : activeTabIndex)
        }
        event.target.blur();
    });
};
addTabListener(document.getElementById('rudi-docs-tab')); // initialize the first, permanenent tab
const addTabDiv = function(tabName){
    nTabs++; 
    tabCounter++;
    const tabIndex = nTabs - 1;
    const closeTab = document.createElement("span"); // an "X" to close the tab
    closeTab.className = "close-tab";
    closeTab.dataset.index = tabIndex;
    closeTab.innerHTML = '<i class="fas fa-times"></i>';
    const tab = document.createElement("div"); // a div as the tab's control target
    tab.className = "contents-tab";
    tab.dataset.index = tabIndex;
    tab.innerHTML = 
        tabName || (serverState.listening ? "Apps " : "Docs ") + 
        (tabCounter - (serverState.listening ? 1 : 0));
    tab.appendChild(closeTab);
    contentsTabs.appendChild(tab);
    addTabListener(tab); // listen for both tab select and close on the tab div
    setActiveTab(tabIndex); // switch to the new tab
    addTab.blur();
};
addTab.addEventListener("click", () => { // add a new tab
    rudi.addTab(window.innerHeight, window.innerWidth);    
    addTabDiv();
});
launchExternalTab.addEventListener("click", () => { // open the current pane in an external browser
    if(allowExternalTab) rudi.launchExternalTab(serverState.listening);
});
rudi.showDocumentation((event, url) => { setActiveTab(0) });
rudi.showExternalLink((event, tabName, tabIndex, addTab) => { 
  if(addTab) addTabDiv(tabName);
  setActiveTab(tabIndex);
});
