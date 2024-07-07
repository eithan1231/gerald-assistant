import { Client } from "./client.js";

const main = async () => {
  const client = new Client({
    name: "test",
  });

  await client.start();
};

main();
