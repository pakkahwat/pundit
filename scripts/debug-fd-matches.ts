import './lib/prefer-ipv4';

import { config } from 'dotenv';
import path from 'node:path';

config({ path: path.resolve(__dirname, '../.env.local') });

// จิ้มดูว่า football-data /matches ตอบอะไรมาจริง ๆ เทียบกับ /standings — ใช้ไล่เคส
// "ตารางคะแนนบอกเตะแล้ว แต่ตาราง matches ใน DB ยังเป็น TIMED" ว่าข้อมูลเก่าค้างที่
// ฝั่ง API หรือฝั่งเรา (อ่านอย่างเดียว ไม่แตะ DB เลย)
//
// ใช้: npx tsx scripts/debug-fd-matches.ts PL 2   (ลีก, แมตช์เดย์)

const code = process.argv[2] ?? 'PL';
const matchday = process.argv[3] ?? '2';

async function fd(pathname: string) {
  const token = process.env.FOOTBALL_DATA_API_TOKEN;
  if (!token) throw new Error('Missing FOOTBALL_DATA_API_TOKEN ใน .env.local');
  const res = await fetch(`https://api.football-data.org/v4${pathname}`, {
    headers: { 'X-Auth-Token': token },
  });
  if (!res.ok) throw new Error(`${pathname} → ${res.status} ${await res.text()}`);
  return res.json();
}

async function main() {
  const m = (await fd(`/competitions/${code}/matches?matchday=${matchday}`)) as {
    matches: {
      utcDate: string; status: string; matchday: number;
      homeTeam: { shortName: string }; awayTeam: { shortName: string };
      score: { fullTime: { home: number | null; away: number | null } };
    }[];
  };
  console.log(`\n/matches ${code} แมตช์เดย์ ${matchday} — ${m.matches.length} นัด:`);
  for (const x of m.matches) {
    const ft = x.score.fullTime;
    console.log(
      `  ${x.homeTeam.shortName} ${ft.home ?? '-'}-${ft.away ?? '-'} ${x.awayTeam.shortName}` +
      ` | ${x.status} | เตะ ${x.utcDate}`,
    );
  }

  const s = (await fd(`/competitions/${code}/standings`)) as {
    standings: { type: string; table: { team: { shortName: string }; playedGames: number; points: number }[] }[];
  };
  const total = s.standings.find((t) => t.type === 'TOTAL')?.table ?? [];
  console.log(`\n/standings ${code} (แข่ง/แต้ม):`);
  console.log('  ' + total.map((r) => `${r.team.shortName} ${r.playedGames}/${r.points}`).join(' · '));
}

main().catch((err) => { console.error(err); process.exit(1); });
