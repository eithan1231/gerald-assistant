import { hostname } from "os";
import { Client } from "./client.js";

const main = async () => {
  const clientName = process.env.CLIENT_NAME ?? hostname();
  const filteredMicrophone =
    !process.env.FILTERED_MICROPHONE ||
    process.env.FILTERED_MICROPHONE === "true";

  const client = new Client({
    name: clientName,
    microphone: filteredMicrophone ? "filtered" : "direct",
  });

  await client.start();
};

main();
