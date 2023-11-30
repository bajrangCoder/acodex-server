import express, { Request, Response } from "express";
import WebSocket from "ws";
import cors from "cors";
import * as os from "node:os";
import * as pty from "node-pty";
import http from "http";
import * as fs from 'fs';
import { Terminal } from "xterm-headless";
import { SerializeAddon } from "xterm-addon-serialize";
import { Session } from "../types";
import { coloredText } from "./helpers";

/** Whether to use binary transport. */
const USE_BINARY = os.platform() !== "win32";
// Assuming sessions is defined somewhere in your code
const sessions: Record<number, Session> = {};

export function startServer(port: number = 8767, host: string = "0.0.0.0") {
    const app = express();
    app.use(cors());
    
    const server = http.createServer(app);
    const wss = new WebSocket.Server({ noServer: true });

    
    app.get("/", (req: Request, res: Response) => {
        res.send("Hello acodeX-server is working😊...");
        res.end()
    });

    app.post("/terminals", (req: Request, res: Response) => {
        const env = { ...process.env };
        env["COLORTERM"] = "truecolor";

        const { cols, rows } = req.query as { cols: string; rows: string };
        if (typeof cols !== "string" || typeof rows !== "string") {
            console.error({ req });
            throw new Error("Unexpected query args");
        }

        const colsInt = parseInt(cols, 10);
        const rowsInt = parseInt(rows, 10);

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
                encoding: USE_BINARY ? null : "utf8"
            }
        );

        const xterm = new Terminal({
            rows: rowsInt || 24,
            cols: colsInt || 80,
            allowProposedApi: true
        });
        const serializeAddon = new SerializeAddon();
        xterm.loadAddon(serializeAddon);

        console.log("Created terminal with PID: " + term.pid);

        sessions[term.pid] = {
            term,
            xterm,
            serializeAddon,
            terminalData: ""
        };

        sessions[term.pid].temporaryDisposable = term.onData((data: string) => {
            sessions[term.pid].terminalData += data;
        });

        res.send(term.pid.toString());
        res.end();
    });

    app.post("/terminals/:pid/size", (req: Request, res: Response) => {
        const pid = parseInt(req.params.pid, 10);
        const { cols, rows } = req.query as { cols: string; rows: string };
        const colsInt = parseInt(cols, 10);
        const rowsInt = parseInt(rows, 10);

        const { term, xterm } = sessions[pid];

        term.resize(colsInt, rowsInt);
        xterm.resize(colsInt, rowsInt);

        res.end();
    });

    server.on("upgrade", (request, socket, head) => {
        const pathname = new URL(
            request.url || "",
            `http://${request.headers.host}`
        ).pathname;

        if (pathname.startsWith("/terminals/")) {
            const pid = parseInt(pathname.split("/").pop() || "", 10);

            wss.handleUpgrade(request, socket, head, ws => {
                wss.emit("connection", ws, request, pid);
            });
        } else {
            socket.destroy();
        }
    });
    wss.on(
        "connection",
        (ws: WebSocket, request: http.IncomingMessage, pid: number) => {
            const { term, xterm, serializeAddon, terminalData } = sessions[pid];

            console.log("Connected to terminal " + term.pid);

            if (sessions[pid].temporaryDisposable && terminalData) {
                sessions[pid].temporaryDisposable?.dispose();
                delete sessions[pid].temporaryDisposable;
                xterm.write(sessions[pid].terminalData);
            }

            ws.send(sessions[pid].terminalData);

            sessions[pid].dataHandler = term.onData(function (
                data: string | Uint8Array
            ) {
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
                term.write(msg.toString());
            });

            ws.on("close", function () {
                if (sessions[pid] && sessions[pid].dataHandler) {
                    console.log(
                        "Terminal " + pid + " is running in the background."
                    );
                    sessions[pid].dataHandler?.dispose();
                    delete sessions[pid].dataHandler;
                    sessions[pid].terminalData = serializeAddon.serialize();
                }
            });
        }
    );

    app.post("/terminals/:pid/terminate", (req: Request, res: Response) => {
        const pid = parseInt(req.params.pid, 10);
        const { term, xterm, serializeAddon } = sessions[pid];

        if (term) {
            serializeAddon.dispose();
            xterm.dispose();
            term.kill();
            delete sessions[pid];
            console.log("Closed terminal " + pid);
        }

        res.end();
    });

    server.listen(port, host, () => {
        console.log(`${coloredText("AcodeX Server", "blue")} started 🔥\n\nHost: ${coloredText(host, "cyan")}\nPort: ${coloredText(port, "cyan")}`);
    });
}
