import { config } from "dotenv";
import path from "node:path";

config({ path: path.resolve(__dirname, "../.env.local") });

// วินิจฉัยว่า token/แผนของเราใช้อะไรกับ SportMonks ได้บ้าง — รันตอนมีบอล PL กำลังเตะ
// จะเห็นชัดที่สุด (endpoint inplay คืนเฉพาะนัดที่กำลังแข่ง นอกเวลานั้น data ว่างเป็นเรื่องปกติ)
//
// ไล่ยิงทีละชุด include เพราะ API ปฏิเสธ "ทั้ง call" เมื่อขอ include ที่แผนไม่มีสิทธิ์
// ผลของแต่ละแถวจึงบอกตรง ๆ ว่าสิทธิ์ขาดที่ตัวไหน

const token = process.env.SPORTMONKS_API_TOKEN;
if (!token) {
  console.log("SPORTMONKS_API_TOKEN: missing");
  process.exit(1);
}

const INCLUDE_SETS = [
  "participants;scores;state",
  "participants;scores;state;periods",
  "participants;scores;state;events.type",
  "participants;scores;state;periods;events.type",
];

for (const include of INCLUDE_SETS) {
  const url = new URL(
    "https://api.sportmonks.com/v3/football/livescores/inplay",
  );
  url.searchParams.set("api_token", token);
  url.searchParams.set("include", include);
  url.searchParams.set("leagues", "8");

  const response = await fetch(url);
  const payload = (await response.json()) as {
    data?: unknown[];
    message?: string;
  };
  console.log(
    `[${response.status}] include=${include}`.padEnd(75),
    `data=${payload.data?.length ?? 0}`,
    payload.message ? `msg=${payload.message}` : "",
  );
}

// เช็คว่า "แผนเห็นพรีเมียร์ลีกไหม" โดยไม่ต้องรอมีบอลเตะ — ถามข้อมูลลีกตรง ๆ
const leagueUrl = new URL("https://api.sportmonks.com/v3/football/leagues/8");
leagueUrl.searchParams.set("api_token", token);
const leagueResponse = await fetch(leagueUrl);
const league = (await leagueResponse.json()) as {
  data?: { name?: string };
  message?: string;
};
console.log(
  `[${leagueResponse.status}] league 8 =`,
  league.data?.name ?? league.message ?? "ไม่รู้จัก",
  leagueResponse.status === 200
    ? "→ แผนนี้เข้าถึงพรีเมียร์ลีกได้"
    : "→ แผนนี้เข้าพรีเมียร์ลีกไม่ได้ (free plan มีแค่เดนมาร์ก/สกอตแลนด์) สกอร์สดจะไม่มา",
);
