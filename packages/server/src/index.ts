import { createServer } from "node:http";
import { WebSocketServer } from "ws";
import { ClientHandler } from "./client-handler.js";
import { Adapter } from "./adapter.js";

const main = async () => {
  // interpreter.addAction({
  //   id: "set_timer",
  //   description: "Sets a timer for a specified amount of time",
  //   properties: [
  //     {
  //       name: "duration",
  //       description: "Duration of timer in seconds",
  //       type: "number",
  //       required: true,
  //     },
  //     {
  //       name: "name",
  //       description: "The presentable name of the timer",
  //       type: "string",
  //     },
  //   ],
  // });

  const adapter = new Adapter();
  await adapter.start();

  const server = createServer();

  const wsServer = new WebSocketServer({
    server: server,
  });

  wsServer.on(
    "connection",
    (socket, request) => new ClientHandler(socket, adapter)
  );

  server.listen(3000);
};

main();
