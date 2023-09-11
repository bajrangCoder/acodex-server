#!/usr/bin/env node
const { Command } = require("commander");
const startServer = require("./terminalServer.js");
const startLspServer = require("./lspServer.js");
const program = new Command();

program
    .name("acodeX-server")
    .description("CLI of AcodeX Acode plugin")
    .version("1.0.5")
    .action(() => {
        startServer();
    });

program
    .command("lsp")
    .description("Starts lsp server for Acode")
    .action(() => {
        startLspServer();
    });

program.parse();
