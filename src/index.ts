import { runScheduler } from "./scheduler/scheduler";
import { client } from "./db/client";

async function main() {
  await client.connect();

  console.log("Starting RSS reader scheduler...");
  await runScheduler();
}

main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
