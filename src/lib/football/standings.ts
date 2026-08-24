import { sqlClient } from '@/db/client';
import { fdFetch } from '@/lib/jobs/sync-results';

import { cachedFetchJson } from './cache';

// ตารางคะแนนอย่างเป็นทางการจาก football-data.org — ไม่ได้คำนวณเองจากตาราง matches ในระบบเรา
// เพราะตารางจริงมีกฎที่เราไม่ได้เก็บข้อมูลไว้ เช่นการหักแต้ม (ที่เกิดขึ้นจริงหลายครั้งในพรีเมียร์ลีก
// ช่วงหลัง) และเกณฑ์ตัดสินอันดับเมื่อแต้มเท่ากันซึ่งต่างกันไปตามลีก ถ้าคำนวณเองมีโอกาสไม่ตรงกับ
// ที่คนดูเห็นจากที่อื่น ซึ่งแย่กว่าไม่มีตารางเลย
export type StandingRow = {
  position: number;
  team: { id: number; name: string; shortName: string; tla: string; crest: string };
  playedGames: number;
  form: string | null;
  won: number;
  draw: number;
  lost: number;
  points: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
};

type StandingsResponse = {
  competition: { name: string; code: string };
  season: { currentMatchday: number | null };
  standings: { type: string; table: StandingRow[] }[];
};

// 30 นาที — ตารางคะแนนเปลี่ยนเฉพาะตอนมีนัดจบ ซึ่งเกิดไม่กี่ครั้งต่อสัปดาห์ ตั้งสั้นกว่านี้ก็เปลือง
// โควตา API เปล่า ๆ ตั้งยาวกว่านี้คนจะบ่นว่าตารางไม่อัปเดตหลังบอลจบ
const TTL_SECONDS = 30 * 60;

// คำนวณฟอร์ม 5 นัดหลังสุดเองจากตาราง matches ในระบบ
//
// ทำไมต้องคำนวณเอง: football-data.org ส่งฟิลด์ form มาเป็น null ในแผนฟรี (เป็นฟีเจอร์ของแผนเสียเงิน)
// แต่เรา sync ผลแข่งทุกนัดเข้า DB อยู่แล้ว จึงคำนวณได้เองฟรี ๆ และตรงกับข้อมูลที่เราใช้คิดคะแนน
// ให้ผู้เล่นด้วย — ถ้าลีกไหนยังไม่ได้ sync เข้า DB ก็จะคืน map ว่าง แล้วช่องนั้นแสดง "—" ตามเดิม
async function getRecentFormByExternalTeamId(code: string): Promise<Map<number, string>> {
  const rows = await sqlClient<{ external_id: number; form: string }[]>`
    with season as (
      select id from seasons where competition_code = ${code} and is_active = true limit 1
    ),
    team_matches as (
      select m.home_team_id as team_id, m.kickoff_at,
        case
          when m.home_score > m.away_score then 'W'
          when m.home_score = m.away_score then 'D'
          else 'L'
        end as result
      from matches m
      where m.season_id = (select id from season) and m.status = 'FINISHED'
      union all
      select m.away_team_id, m.kickoff_at,
        case
          when m.away_score > m.home_score then 'W'
          when m.away_score = m.home_score then 'D'
          else 'L'
        end
      from matches m
      where m.season_id = (select id from season) and m.status = 'FINISHED'
    ),
    ranked as (
      select tm.*, row_number() over (partition by tm.team_id order by tm.kickoff_at desc) as rn
      from team_matches tm
    )
    select t.external_id, string_agg(r.result, ',' order by r.kickoff_at asc) as form
    from ranked r
    join teams t on t.id = r.team_id
    where r.rn <= 5
    group by t.external_id
  `;
  return new Map(rows.map((r) => [r.external_id, r.form]));
}

export async function getStandings(code: string) {
  const { data, stale, fetchedAt } = await cachedFetchJson<StandingsResponse>(
    sqlClient,
    // ใส่รหัสลีกใน cache key ไม่งั้นตารางของลาลีกาจะไปทับของพรีเมียร์ลีก
    `standings:${code}`,
    TTL_SECONDS,
    () => fdFetch<StandingsResponse>(`/competitions/${code}/standings`),
  );

  // ตอบกลับมาหลายชุด (TOTAL / HOME / AWAY) — เอาเฉพาะตารางรวมซึ่งคือตารางคะแนนที่คนทั่วไปเข้าใจ
  const rawTable = data.standings.find((s) => s.type === 'TOTAL')?.table ?? [];

  // เติมฟอร์มที่คำนวณเองเข้าไปเมื่อ API ไม่ได้ส่งมา (แผนฟรีส่ง null เสมอ)
  const formByTeam = await getRecentFormByExternalTeamId(code);
  const table = rawTable.map((r) => ({
    ...r,
    form: r.form ?? formByTeam.get(r.team.id) ?? null,
  }));

  return {
    table,
    competitionName: data.competition?.name ?? code,
    currentMatchday: data.season?.currentMatchday ?? null,
    stale,
    fetchedAt,
  };
}
