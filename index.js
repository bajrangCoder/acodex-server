#!/usr/bin/env node

const { WebSocketServer } = require("ws");
const pty = require("node-pty");

function startWebSocketServer() {
  let port = parseInt(process.env.WS_PORT || process.env.PORT || 8767);

  const server = new WebSocketServer({
    port: port,
  });
  
  server.on("connection", function (connection) {
    const shell = pty.spawn("bash", [], {
      name: "xterm-256color",
      cwd: process.env.HOME,
      env: process.env,
    });
  
    connection.on("message", function (message) {
      const command = typeof message === "string" ? message.trim() : message.toString("utf8").trim();
      shell.write(command + "\r");
    });
  
    shell.on("data", function (data) {
      connection.send(data);
    });
  
    shell.on("exit", function () {
      connection.close();
    });
  });

  console.log(`AcodeX Server started on port: ${port}`);
}

// Export the function to make it accessible from other modules
module.exports = startWebSocketServer;

// If this script is executed directly from the command line, start the WebSocket server
if (require.main === module) {
  startWebSocketServer();
}
