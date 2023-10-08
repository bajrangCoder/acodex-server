const express = require("express");
const expressWs = require("express-ws");
const os = require("os");
const pty = require("node-pty");
const http = require("http");
const fs = require("fs");
const cors = require("cors");
const { Terminal } = require("xterm-headless");
const { SerializeAddon } = require("xterm-addon-serialize");

/** Whether to use binary transport. */
const USE_BINARY = os.platform() !== "win32";

const sessions = {};

function startServer() {
    const app = express();
    app.use(cors());
    const server = http.createServer(app);
    const appWs = expressWs(app, server);

    app.post("/terminals", (req, res) => {
        const env = { ...process.env };
        env["COLORTERM"] = "truecolor";

        const { cols, rows } = req.query;
        if (typeof cols !== "string" || typeof rows !== "string") {
            console.error({ req });
            throw new Error("Unexpected query args");
        }

        const colsInt = parseInt(cols);
        const rowsInt = parseInt(rows);

        const term = pty.spawn(
            process.platform === "win32"
                ? "pwsh.exe"
                : process.env.SHELL || "bash",
            [],
            {
                name: "xterm-256color",
                cols: colsInt || 80,
                rows: rowsInt || 24,
                cwd: process.platform === "win32" ? undefined : env.HOME,
                env,
                encoding: USE_BINARY ? null : "utf8",
            }
        );

        const xterm = new Terminal({
            rows: rowsInt || 24,
            cols: colsInt || 80,
            allowProposedApi: true,
        });
        const serializeAddon = new SerializeAddon();
        xterm.loadAddon(serializeAddon);

        console.log("Created terminal with PID: " + term.pid);

        sessions[term.pid] = {
            term,
            xterm,
            serializeAddon,
            terminalData: "",
        };

        sessions[term.pid].temporaryDisposable = term.onData((data) => {
            sessions[term.pid].terminalData += data;
        });

        res.send(term.pid.toString());
        res.end();
    });

    app.post("/terminals/:pid/size", (req, res) => {
        const pid = parseInt(req.params.pid);
        const { cols, rows } = req.query;
        const colsInt = parseInt(cols);
        const rowsInt = parseInt(rows);

        const { term, xterm } = sessions[pid];

        term.resize(colsInt, rowsInt);
        xterm.resize(colsInt, rowsInt);
        /*console.log(
            "Resized terminal " +
                pid +
                " to " +
                colsInt +
                " cols and " +
                rowsInt +
                " rows."
        );*/
        res.end();
    });

    app.ws("/terminals/:pid", function (ws, req) {
        const pid = parseInt(req.params.pid);
        const { term, xterm, serializeAddon, terminalData } = sessions[pid];

        console.log("Connected to terminal " + term.pid);
        // Clear unsentOutput as it will be sent when connecting to an existing terminal
        if (sessions[pid].temporaryDisposable && terminalData) {
            sessions[pid].temporaryDisposable.dispose();
            delete sessions[pid].temporaryDisposable;
            xterm.write(sessions[pid].terminalData);
        }
        // Send the terminal data to the client
        ws.send(sessions[pid].terminalData);
        //term.resume();

        sessions[pid].dataHandler = term.onData(function (data) {
            try {
                xterm.write(
                    typeof data === "string" ? data : new Uint8Array(data)
                );
                ws.send(data);
            } catch (ex) {
                // The WebSocket is not open, ignore
            }
        });

        ws.on("message", function (msg) {
            term.write(msg);
        });

        ws.on("close", function () {
            // pause the running process
            if (sessions[pid] && sessions[pid].dataHandler) {
                console.log("Terminal " + pid + " is running in background.");
                //term.pause();
                sessions[pid].dataHandler.dispose();
                delete sessions[pid].dataHandler;
                sessions[pid].terminalData = serializeAddon.serialize();
            }
        });
    });

    app.post("/terminals/:pid/terminate", (req, res) => {
        const pid = parseInt(req.params.pid);
        const { term, xterm, serializeAddon, dataHandler } = sessions[pid];

        if (term) {
            serializeAddon.dispose();
            xterm.dispose();
            // Terminate the terminal process
            term.kill();
            // Clean up resources
            delete sessions[pid];
            console.log("Closed terminal " + pid);
        }

        res.end();
    });

    const port = parseInt(process.env.PORT || "8767");
    const host = "0.0.0.0";

    server.listen(port, host, () => {
        console.log("AcodeX Server started on port: " + port);
    });
}

module.exports = startServer;
