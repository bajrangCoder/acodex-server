import { Hono } from "hono";
import { cors } from "hono/cors";
import { serve } from "@hono/node-server";
import WebSocket from "ws";
import * as os from "node:os";
import * as pty from "node-pty";
import http from "http";
import { Terminal } from "xterm-headless";
import { SerializeAddon } from "xterm-addon-serialize";
import { Session } from "../types";
import { coloredText } from "./helpers";

/** Whether to use binary transport. */
const USE_BINARY = os.platform() !== "win32";
const sessions: Record<number, Session> = {};

export async function startServer(
  port: number = 8767,
  host: string = "0.0.0.0"
) {
  const app = new Hono();
  app.use("/*", cors());

  const server = serve(
    {
      fetch: app.fetch,
      port,
      hostname: host,
    },
    (info) => {
      console.log(
        `${coloredText(
          "AcodeX Server",
          "blue"
        )} started 🔥\n\nHost: ${coloredText(
          info.address === "0.0.0.0" ? "localhost" : info.address,
          "cyan"
        )}\nPort: ${coloredText(info.port, "cyan")}`
      );
    }
  );
  const wss = new WebSocket.Server({ noServer: true });

  app.get("/", (c) => {
    return c.text("Hello acodeX-server is working😊...");
  });

  app.post("/terminals", async (c) => {
    try {
      const env = { ...process.env };
      env["COLORTERM"] = "truecolor";

      const { cols, rows } = await c.req.json();
      if (typeof cols !== "string" || typeof rows !== "string") {
        throw new Error("Unexpected query args");
      }

      const colsInt = parseInt(cols, 10);
      const rowsInt = parseInt(rows, 10);

      const term = pty.spawn(
        process.platform === "win32" ? "pwsh.exe" : process.env.SHELL || "bash",
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

      sessions[term.pid].temporaryDisposable = term.onData((data: string) => {
        sessions[term.pid].terminalData += data;
      });

      return c.text(term.pid.toString());
    } catch (error) {
      console.error(error);
      return c.json({ error: "Failed to create terminal" }, 500);
    }
  });

  app.post("/terminals/:pid/resize", async (c) => {
    try {
      const pid = parseInt(c.req.param("pid"), 10);
      const { cols, rows } = await c.req.json();
      const colsInt = parseInt(cols, 10);
      const rowsInt = parseInt(rows, 10);

      const { term, xterm } = sessions[pid];

      term.resize(colsInt, rowsInt);
      xterm.resize(colsInt, rowsInt);
      return c.json({ success: true });
    } catch (error) {
      console.error(error);
      return c.json({ error: "Failed to resize terminal" }, 500);
    }
  });

  server.on("upgrade", (request, socket, head) => {
    const pathname = new URL(
      request.url || "",
      `http://${request.headers.host}`
    ).pathname;

    if (pathname.startsWith("/terminals/")) {
      const pid = parseInt(pathname.split("/").pop() || "", 10);

      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit("connection", ws, request, pid);
      });
    } else {
      socket.destroy();
    }
  });
  wss.on(
    "connection",
    (ws: WebSocket, request: http.IncomingMessage, pid: number) => {
      try {
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
            xterm.write(typeof data === "string" ? data : new Uint8Array(data));
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
            console.log("Terminal " + pid + " is running in the background.");
            sessions[pid].dataHandler?.dispose();
            delete sessions[pid].dataHandler;
            sessions[pid].terminalData = serializeAddon.serialize();
          }
        });
      } catch (error) {
        console.error(error);
        ws.close();
      }
    }
  );

  app.post("/terminals/:pid/terminate", async (c) => {
    try {
      const pid = parseInt(c.req.param("pid"), 10);
      const session = sessions[pid];

      if (!session) {
        // Session not found
        console.error(`Session with PID ${pid} not found.`);
        return c.json({ error: `Session with PID ${pid} not found.` }, 404);
      }

      const { term, xterm, serializeAddon } = session;

      if (term) {
        if (session.dataHandler) {
          session.dataHandler?.dispose();
          delete session.dataHandler;
          if (session.terminalData) {
            serializeAddon.dispose();
            session.terminalData = serializeAddon.serialize();
          }
        }
        // Kill the terminal
        term.kill();
        let res = await new Promise((resolve) => {
          term.onExit(() => {
            // Dispose of xterm and remove the session after the terminal exits
            xterm.dispose();
            delete sessions[pid];
            console.log("Closed terminal " + pid);
            resolve(true);
          });
        });

        if (!res) {
          return c.json({ error: "Something went wrong." }, 500);
        }
        return c.json({ success: true });
      }
    } catch (error) {
      console.error(error);
      return c.json({ error: "Failed to terminate terminal" }, 500);
    }
  });

  app.post("/execute-command", async (c, next) => {
    try {
      const { command } = await c.req.json();
      if (!command) {
        return c.json({ error: "Command is required." }, 400);
      }

      // Execute the command using node-pty
      const term = pty.spawn(
        process.platform === "win32" ? "cmd.exe" : "bash",
        ["-c", command],
        {
          name: "xterm-256color",
          cols: 80,
          rows: 24,
          cwd: process.platform === "win32" ? undefined : process.env.HOME,
        }
      );

      const pattern = [
        "[\\u001B\\u009B][[\\]()#;?]*(?:(?:(?:(?:;[-a-zA-Z\\d\\/#&.:=?%@~_]+)*|[a-zA-Z\\d]+(?:;[-a-zA-Z\\d\\/#&.:=?%@~_]*)*)?\\u0007)",
        "(?:(?:\\d{1,4}(?:;\\d{0,4})*)?[\\dA-PR-TZcf-nq-uy=><~]))",
      ].join("|");
      const ansiRegex = new RegExp(pattern, undefined);
      const ansiRegex2 = new RegExp(pattern, "g");

      let output = "";

      // Listen for data events (output from the command)
      term.onData((data) => {
        output += data;
      });

      // Listen for the process to exit
      let outputData = await new Promise((resolve) => {
        term.onExit(() => {
          // Send the parsed output back to the client
          let outputData = ansiRegex.test(output)
            ? output.replace(ansiRegex2, "")
            : output;
          resolve(outputData)
        });
      })
      return c.json({ output: outputData })

    } catch (error) {
      console.error(error);
      return c.json({ error: "Failed to execute command" }, 500);
    }
  });
}
