const express = require("express");
const expressWs = require("express-ws");
const os = require("os");
const pty = require("node-pty");
const http = require('http');
const fs = require("fs");
const cors = require("cors")

/** Whether to use binary transport. */
const USE_BINARY = os.platform() !== "win32";

function startServer() {
    const app = express();
    app.use(cors());
    const server = http.createServer(app);
    const appWs = expressWs(app, server);

    const terminals = {};
    const unsentOutput = {};
    const temporaryDisposable = {};
    //const terminalState = {};

    app.post("/terminals", (req, res) => {
        /** @type {{ [key: string]: string }} */
        const env = {};
        for (const k of Object.keys(process.env)) {
            const v = process.env[k];
            if (v) {
                env[k] = v;
            }
        }
        // const env = Object.assign({}, process.env);
        env["COLORTERM"] = "truecolor";
        if (
            typeof req.query.cols !== "string" ||
            typeof req.query.rows !== "string"
        ) {
            console.error({ req });
            throw new Error("Unexpected query args");
        }
        const cols = parseInt(req.query.cols);
        const rows = parseInt(req.query.rows);
        const term = pty.spawn(
            process.platform === "win32"
                ? "pwsh.exe"
                : process.env.SHELL || "bash",
            [],
            {
                name: "xterm-256color",
                cols: cols ?? 80,
                rows: rows ?? 24,
                cwd: process.platform === "win32" ? undefined : env.HOME,
                env,
                encoding: USE_BINARY ? null : "utf8",
            }
        );

        console.log("Created terminal with PID: " + term.pid);
        terminals[term.pid] = term;
        unsentOutput[term.pid] = "";
        temporaryDisposable[term.pid] = term.onData(function (data) {
            unsentOutput[term.pid] += data;
            //terminalState[term.pid] += data;
        });
        res.send(term.pid.toString());
        res.end();
    });

    app.post("/terminals/:pid/size", (req, res) => {
        if (
            typeof req.query.cols !== "string" ||
            typeof req.query.rows !== "string"
        ) {
            console.error({ req });
            throw new Error("Unexpected query args");
        }
        const pid = parseInt(req.params.pid);
        const cols = parseInt(req.query.cols);
        const rows = parseInt(req.query.rows);
        const term = terminals[pid];

        term.resize(cols, rows);
        console.log(
            "Resized terminal " +
                pid +
                " to " +
                cols +
                " cols and " +
                rows +
                " rows."
        );
        res.end();
    });

    app.ws("/terminals/:pid", function (ws, req) {
        const term = terminals[parseInt(req.params.pid)];
        console.log("Connected to terminal " + term.pid);
        temporaryDisposable[term.pid].dispose();
        delete temporaryDisposable[term.pid];
        ws.send(unsentOutput[term.pid]);
        delete unsentOutput[term.pid];
        // unbuffered delivery after user input
        let userInput = false;

        // string message buffering
        function buffer(socket, timeout, maxSize) {
            let s = "";
            let sender = null;
            return (data) => {
                s += data;
                if (s.length > maxSize || userInput) {
                    userInput = false;
                    socket.send(s);
                    s = "";
                    if (sender) {
                        clearTimeout(sender);
                        sender = null;
                    }
                } else if (!sender) {
                    sender = setTimeout(() => {
                        socket.send(s);
                        s = "";
                        sender = null;
                    }, timeout);
                }
            };
        }
        // binary message buffering
        function bufferUtf8(socket, timeout, maxSize) {
            const chunks = [];
            let length = 0;
            let sender = null;
            return (data) => {
                chunks.push(data);
                length += data.length;
                if (length > maxSize || userInput) {
                    userInput = false;
                    socket.send(Buffer.concat(chunks));
                    chunks.length = 0;
                    length = 0;
                    if (sender) {
                        clearTimeout(sender);
                        sender = null;
                    }
                } else if (!sender) {
                    sender = setTimeout(() => {
                        socket.send(Buffer.concat(chunks));
                        chunks.length = 0;
                        length = 0;
                        sender = null;
                    }, timeout);
                }
            };
        }
        const send = (USE_BINARY ? bufferUtf8 : buffer)(ws, 3, 262144);

        // WARNING: This is a naive implementation that will not throttle the flow of data. This means
        // it could flood the communication channel and make the terminal unresponsive. Learn more about
        // the problem and how to implement flow control at https://xtermjs.org/docs/guides/flowcontrol/
        term.onData(function (data) {
            try {
                //terminalState[term.pid] += data
                send(data);
            } catch (ex) {
                // The WebSocket is not open, ignore
            }
        });
        ws.on("message", function (msg) {
            term.write(msg);
            userInput = true;
            
        });
        ws.on("close", function () {
            // term.kill();
            // console.log("Closed terminal " + term.pid);
            // Clean things up
            // delete terminals[term.pid];
        });
    });
    /*app.post("/terminals/:pid/terminate", (req, res) => {
        const pid = parseInt(req.params.pid);
        const term = terminals[pid];
    
        if (term) {
            // Terminate the terminal process
            term.kill();
    
            // Clean up resources
            delete terminals[pid];
            delete unsentOutput[pid];
            delete terminalState[pid];
    
            console.log("Closed terminal " + pid);
        }
    
        res.end();
    });*/


    const port = parseInt(process.env.PORT || "8767");
    const host = "0.0.0.0";
    
    
    server.listen(port, host, () => {
        console.log("AcodeX Server started on port : " + port);
    });
}

module.exports = startServer;