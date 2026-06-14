---
title: Usage
has_children: false
nav_order: 40
---

## {{ page.title }}

A logical series of actions is required to get 
RuDI installed and running on the intended computer(s).

### Connect to a server (remote, node modes)

If you will run the RuDI backend web server remotely, first
click the **Connect** button, which 
executes an appropriate SSH command in the black
terminal window.  Log in as dictated by your server.

### (Re)Install RuDI

The first time you work on a new target computer you must click 
**(Re)Install** to install the needed repositories and executables.

Usually, you can skip re-installation in future visits
unless you know you need to update the server code.

Watch the installation progress in the black terminal window - 
you will be ready to proceed when you see a command prompt
awaiting input.

### Start and use the server

Once RuDI is installed, click **Start** to launch the 
Apps Framework, which will load into a web browser on the right
side of the app.

Notice the **tall vertical open/close button** in the middle or to the
left of the screen. This button toggles the visibility of the server
configuration and terminal panels (the server is always
there reporting its log stream, even when you hide it).

The RuDI Desktop is a minimal web browser. You will
start with one Docs and one Apps tab. If desired, you can open 
additional Apps tabs running on the same server. Documentation links
within the apps will load into the Docs tab.

Please see the documentation of the 
[RuDI Apps Framework](/rudi-apps-framework)
for information on how to proceed once the interface is running.

### Stop the server and disconnect

When you are done working, click the tall vertical open/close button
to expose the server controls and click **Stop** to end your 
server session. In remote modes, click **Disconnect**
to end your SSH session. 

You can also just close/quit the desktop app.
Any servers and jobs running on remote computers will terminate
automatically once the SSH connection is dropped. 

### Quit the Desktop

Electron apps use significant system resources. You are encouraged to 
always close all windows, and to fully quit the app on Mac computers,
when you are done using the RuDI Desktop.
