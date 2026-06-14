---
title: Security Notes
has_children: false
nav_order: 60
---

## {{ page.title }}

RudI takes security seriously. There are real 
concerns with running software on your computer,
and you should consider the factors below 
when installing and using the RudI Desktop and associated apps.

Only you can decide whether to trust the software you install
and bear responsibility for doing so.

### RuDI Desktop

The RuDI Desktop is an 
{% include external-link.html href="https://github.com/RustyDataInt/rudi-desktop-app/" text="open-source project" %}
maintained by the RuDI team to allow you to review its code,
and we always abide by our 
[Code of Conduct](https://rustydataint.github.io/docs/code-of-conduct/).

The Desktop app is 
{% include external-link.html href="https://www.google.com/search?q=code+signing" text="properly signed" %},
and, on macOS, 
{% include external-link.html href="https://www.google.com/search?q=notarization+macos" text="notarized" %},
for safe installation and use, so you can trust
that the code is the same as available on GitHub. The expected 
app author or publisher is "University of Michigan" on Windows and
"Thomas E. Wilson" on Mac.

You may still be prompted to confirm certain installation actions,
e.g., that the app is not "frequently downloaded" or "not recognized".
These messages occur when an app has fewer users as compared
to more common programs; they do _not_ indicate that malware was detected. 

The Desktop performs the following essential tasks:
- sets configuration parameters and saves them using Local Storage
- uses SSH to securely connect to remote servers

### RuDI Apps Framework

Like the Desktop, the RuDI Apps Framework is an 
{% include external-link.html href="https://github.com/RustyDataInt/rudi-apps-framework/" text="open-source project" %}.
It has features that access your local file system
and execute actions on your computer to allow you to:
- download third party app binaries and run them on your computer or server
- load and save data files and bookmarks of app states

### Third-party data analysis apps

The purpose of the RuDI Desktop and Apps Framework
is to run data analysis apps. Unlike the
Desktop and Framework, our team does not develop
those apps and is not responsible for their contents.

RuDI apps have access to the computer running the web server, including 
opening files and running commands on the operating system. 
It is therefore essential that you trust the authors of apps you use.

Apps you trust should follow the RuDI 
[Code of Conduct](https://rustydataint.github.io/docs/code-of-conduct/).
Ask the app's developer if you are in doubt. 
If you cannot identify the developer of an app, don't use it!

You will be prompted the first time you use an app
to indicate that you have considered the potential risks and 
agree to continue.
