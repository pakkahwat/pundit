import { config } from "dotenv";
import path from "node:path";

config({ path: path.resolve(__dirname, "../.env.local") });

const token = process.env.SPORTMONKS_API_TOKEN;
if (!token) {
  console.log("SPORTMONKS_API_TOKEN: missing");
  process.exit(1);
}

const url = new URL("https://api.sportmonks.com/v3/football/livescores/inplay");
url.searchParams.set("api_token", token);
url.searchParams.set("include", "participants;scores;state;round;league");
url.searchParams.set("leagues", "8");

const response = await fetch(url);
const payload = (await response.json()) as {
  data?: unknown[];
  message?: string;
  rate_limit?: { remaining?: number; resets_in_seconds?: number };
};

console.log("HTTP:", response.status);
console.log("data count:", payload.data?.length ?? 0);
console.log("message:", payload.message ?? "none");
console.log("rate remaining:", payload.rate_limit?.remaining ?? "unknown");
console.log(
  "reset seconds:",
  payload.rate_limit?.resets_in_seconds ?? "unknown",
);
if (payload.data?.[0]) {
  console.log("first fixture:", JSON.stringify(payload.data[0], null, 2));
}
