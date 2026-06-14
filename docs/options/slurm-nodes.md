---
title: Slurm Nodes
parent: Configuration Options
has_children: false
nav_order: 40
---

## {{page.title}}

The following options are specific to cluster node mode. 
They tell the Slurm scheduler about the job that will run the server 
on a cluster node and how you will pay for it.

### Cluster Account **

The name of a valid server account that will 
allow you to submit a job to the cluster via the Slurm `srun` command.
For the UM Great Lakes cluster, this account is
based on the uniqname of the principal investigator. 

**Example**
- johndoe0

`Cluster Account` is distinct from your username on the server.
Please consult your group leader for the proper value to use.

### Job Time Minutes **

The integer time in minutes you would like your web server to run.

`Job Time Minutes` is the _maximum_ time that the server will run - 
the server will always terminate when you are done using the desktop app
to avoid accumulating charges. This option is required by Slurm
and prevents you from unwittingly launching a server that runs perpetually.

### CPUs per Task **

The integer number of CPUs you would like assigned
to your web server job. 

Only 1 CPU is required to run the RuDI web server, but you may wish 
to request 2 CPUs if you will be performing asynchronous tasks. 
Only rare users need to request more than 2 CPUs.

### Memory per CPU **

The amount of memory you would like assigned
to _each_ CPU that will run your server. 

The value should be provided with a single-letter lower-case
suffix to indicate the memory unit, e.g., 'm' or 'g' for 
MB or GB, respectively.

**Example (defaults)**
- CPUs per Task = 2
- Memory per CPU = 4g
- 2 * 4 = 8 GB of total requested memory, a good place to start
