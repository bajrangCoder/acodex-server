#!/usr/bin/env node
import { Command } from "commander";
import { startServer } from "./terminal-server";
import { getIPAddress } from "./helpers";

const program = new Command();

program
    .name("axs")
    .description("CLI of AcodeX Acode plugin")
    .version("1.1.1")
    .option("-p, --port <port>", "port to start the server")
    .option("-i, --ip", "start the server on local network (ip)")
    .option("-c, --ssh-client", "start the SSH client server")
    .option("-a, --both", "start both terminal and SSH server")
    .action(options => {
        if (options.both && options.sshClient) {
            console.error(
                "Error: Both -a and -c options cannot be used together."
            );
        } else if (options.both) {
            console.log("Starting both terminal and SSH server");
            // Add logic for starting both servers
        } else if (options.sshClient) {
            console.log("Starting the SSH client server");
            // Add logic for starting only the SSH server
        } else if (options.port) {
            startServer(options.port);
        } else if (options.ip) {
            const ipdr = getIPAddress();
            if (ipdr === false) {
                startServer();
            } else {
                if (options.port) {
                    startServer(options.port, `${ipdr}`);
                } else {
                    startServer(undefined, `${ipdr}`);
                }
            }
        } else {
            startServer();
        }
    });

program.parse();
