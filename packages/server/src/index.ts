import { createServer } from "node:http";
import { WebSocketServer } from "ws";
import { ClientHandler } from "./client-handler.js";
import { Adapter } from "./adapter.js";
import { AdapterLifx } from "./adapters/lifex.js";
import { AdapterTimer } from "./adapters/timer.js";

const main = async () => {
  const adapter = new Adapter();

  adapter.addAdapter(new AdapterLifx());
  adapter.addAdapter(new AdapterTimer());

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
