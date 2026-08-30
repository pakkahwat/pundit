// วินิจฉัย "สถิติหน้า /settings ไม่ตรงกับแต้ม" — อ่านอย่างเดียว ไม่แก้อะไรทั้งสิ้น
//
// ใช้: DATABASE_URL=... npx tsx scripts/debug-profile-stats.ts <email>
//
// พิมพ์ทุกคำทายของ user นี้ พร้อมสถานะ/สกอร์ของแมตช์ และแต้มที่ตัดไปแล้วรายลีก
// เพื่อหานัดที่ "มีแต้มแต่หน้าเว็บไม่นับว่าจบ" (status หลุดจาก FINISHED หรือสกอร์เป็น null)
import postgres from "postgres";

const email = process.argv[2];
if (!process.env.DATABASE_URL) throw new Error("ต้องตั้ง DATABASE_URL");
if (!email) throw new Error("ใช้: npx tsx scripts/debug-profile-stats.ts <email>");

const sql = postgres(process.env.DATABASE_URL, { max: 1 });

async function main() {
  const [user] = await sql<{ id: string; name: string | null }[]>`
    select id, name from users where email = ${email}`;
  if (!user) throw new Error(`ไม่พบ user อีเมล ${email}`);
  console.log(`user: ${user.name} (${user.id})\n`);

  const leagues = await sql<
    { id: string; name: string; season_id: string; code: string }[]
  >`
    select l.id, l.name, l.season_id, s.competition_code as code
    from league_members lm
    join leagues l on l.id = lm.league_id
    join seasons s on s.id = l.season_id
    where lm.user_id = ${user.id}::uuid`;
  console.log("ลีกที่อยู่:");
  for (const l of leagues)
    console.log(`  ${l.name} [${l.code}] league=${l.id} season=${l.season_id}`);

  // predictions โดน FORCE RLS — ต้องประกาศตัวก่อนถึงเห็นนัดที่ยังไม่เตะของตัวเอง
  const rows = await sql.begin(async (tx) => {
    await tx`select set_config('app.current_user_id', ${user.id}, true)`;
    return tx<
      {
        season_id: string; matchday: number; home: string; away: string;
        status: string; hs: number | null; aw: number | null;
        predicted: string; kickoff: string; points: string | null;
      }[]
    >`
      select m.season_id, m.matchday, ht.name as home, at.name as away,
        m.status::text as status, m.home_score as hs, m.away_score as aw,
        p.predicted_outcome as predicted, m.kickoff_at::text as kickoff,
        (select string_agg(l.name || '=' || ps.points_awarded, ', ')
          from prediction_scores ps join leagues l on l.id = ps.league_id
          where ps.prediction_id = p.id) as points
      from predictions p
      join matches m on m.id = p.match_id
      join teams ht on ht.id = m.home_team_id
      join teams at on at.id = m.away_team_id
      where p.user_id = ${user.id}::uuid
      order by m.kickoff_at`;
  });

  console.log(`\nคำทายทั้งหมด ${rows.length} นัด:`);
  for (const r of rows) {
    const finished = r.status === "FINISHED" && r.hs != null && r.aw != null;
    const flag = !finished && r.points ? "  <<< มีแต้มแต่หน้าเว็บไม่นับว่าจบ!" : "";
    console.log(
      `  [MD${r.matchday}] ${r.home} ${r.hs ?? "-"}-${r.aw ?? "-"} ${r.away}` +
      ` | status=${r.status} | ทาย=${r.predicted} | แต้ม: ${r.points ?? "ยังไม่ตัด"}${flag}`,
    );
  }

  const weird = await sql<{ status: string; n: string }[]>`
    select status::text, count(*) as n from matches group by 1 order by 2 desc`;
  console.log("\nสถานะแมตช์ทั้งระบบ:", weird.map((w) => `${w.status}=${w.n}`).join(", "));
}

main().finally(() => sql.end());
