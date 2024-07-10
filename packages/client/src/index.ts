import { Client } from "./client.js";

const main = async () => {
  const client = new Client({
    name: "test",
    microphone: "filtered",
  });

  await client.start();
};

main();
