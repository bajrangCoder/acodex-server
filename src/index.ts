#!/usr/bin/env node
#!/data/data/com.termux/files/usr/bin/env node
require("../dist/index.js");
import { Command } from "commander";
import { startServer } from "./terminal-server";
import { getIPAddress } from "./helpers";

const program = new Command();

program
	.name("axs")
	.description("CLI of AcodeX Acode plugin")
	.version("1.1.4")
	.option("-p, --port <port>", "port to start the server")
	.option("-i, --ip", "start the server on local network (ip)")
	.action(options => {
		if (options.port && options.ip) {
			const ipdr = getIPAddress();
			if (ipdr === false) {
				console.error("Failed to retrieve IP address.");
				return;
			}
			startServer(options.port, ipdr.toString());
		} else if (options.port) {
			startServer(options.port);
		} else if (options.ip) {
			const ipdr = getIPAddress();
			if (ipdr === false) {
				console.error("Failed to retrieve IP address.");
				return;
			}
			startServer(undefined, ipdr.toString());
		} else {
			startServer();
		}
	});

program.parse();
