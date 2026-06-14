---
title: RuDI Directories
parent: Configuration Options
has_children: false
nav_order: 10
---

## {{page.title}}

You must provide file path(s) that tell the Desktop
where to place and find your RuDI installation. In 
local mode, these directories should be on your desktop or laptop computer. 
In a remote mode, they should be on the HPC server.

### RuDI Directory **

You must always provide the full path where you would 
like to (or already have) installed RuDI.

If `RuDI Directory` ends with folder `rudi` it will be used as is, otherwise 
code will be installed into a new subfolder named `rudi`.
The installer will create the `rudi` subfolder as needed, but 
the parent folder must already exist. Thus, the following examples are equivalent.

**Windows**
- C:\path\to\rudi  
- C:\path\to

**Mac or Linux**
- /path/to/rudi  
- /path/to

### Data Directory (advanced)

Most often, all code and data used by RuDI
resides under the `RuDI Directory`, e.g., /path/to/rudi.
Specifically, apps will write data to folder /path/to/rudi/data.

Alternatively, you may wish
to share the data files produced by apps between multiple users
by providing a value for `Data Directory`, 
i.e., the full path to any valid shared directory that will 
replace the apps data folder.

**Example**
- /path/to/shared/rudi/data
