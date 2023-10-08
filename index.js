#!/usr/bin/env node
const { Command } = require("commander");
const startServer = require("./terminalServer.js");
//const startLspServer = require("./lspServer.js");
const program = new Command();

program
    .name("acodeX-server")
    .description("CLI of AcodeX Acode plugin")
    .version("1.0.7")
    .action(() => {
        startServer();
    });

// note: Currently its not for normal user
/*program
    .command("lsp")
    .description("Starts lsp server for Acode")
    .action(() => {
        startLspServer();
        console.log("Started lsp server")
    });
*/
program.parse();
