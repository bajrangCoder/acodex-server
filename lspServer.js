const WebSocket = require("ws");
const { spawn } = require("child_process");
const { StreamMessageReader, StreamMessageWriter } = require("vscode-jsonrpc");

const servers = [
    {
        args: [
            "node",
            [
                require.resolve("svelte-language-server/bin/server.js"),
                "--stdio",
            ],
        ],
        nameEndsWith: ".svelte",
    },
    {
        args: ["pylsp"],
        nameEndsWith: ".python",
    }, //add any other language servers here
];

function startLspServer() {
    const wss = new WebSocket.Server({ port: 3030 });

    wss.on("connection", (ws) => {
        servers.forEach((server) => {
            const { reader, writer } = startLsServer(server);
            server.writer = writer;

            reader.listen((message) => {
                ws.send(JSON.stringify(message));
            });
        });

        ws.on("message", (message) => {
            let parsed = JSON.parse(message);
            if (parsed.method && parsed.method === "initialize") {
                parsed.params.rootUri = __dirname;
            }
            if (
                !(
                    parsed.params &&
                    parsed.params.textDocument &&
                    parsed.params.textDocument.uri
                )
            ) {
                servers.forEach((server) => {
                    server.writer.write(parsed);
                });
                return;
            }

            const writer = servers.find(
                (server) =>
                    server.nameEndsWith &&
                    parsed.params.textDocument.uri.endsWith(server.nameEndsWith)
            )?.writer;

            if (writer) {
                writer.write(parsed);
            }
        });
    });

    function startLsServer(languageServer) {
        const serverProcess = spawn(...languageServer.args);
        serverProcess.stderr.on("data", (data) => {
            console.error(`${serverProcess.spawnfile} error: ${data}`);
        });

        serverProcess.on("exit", (code) => {
            console.log(`${serverProcess.spawnfile} exited with code ${code}`);
        });

        serverProcess.on("error", (err) => {
            console.error(`Failed to start ${serverProcess.spawnfile}:```, err);
        });

        const reader = new StreamMessageReader(serverProcess.stdout);
        const writer = new StreamMessageWriter(serverProcess.stdin);

        return { reader, writer };
    }
}

module.exports = startLspServer;
