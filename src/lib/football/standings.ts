import { sqlClient } from '@/db/client';

import { competitionLabel } from './competitions';

// ตารางคะแนน "คำนวณเองจากตาราง matches ในระบบ" — เดิมใช้ endpoint /standings ของ
// football-data.org เพราะกลัวพลาดกฎพิเศษ (หักแต้ม, เกณฑ์ตัดสินอันดับเฉพาะลีก) แต่ของจริง
// ที่เจอบน prod แย่กว่านั้น: แผนฟรีเสิร์ฟ "ผลหลอน" — /standings นับผลของนัดที่ยังไม่เตะ
// ไปแล้ว (Hull แข่ง 2 ทั้งที่นัดสองคิกออฟบ่ายวันนั้น) ขณะที่ /matches ถูกต้อง ทำให้ช่อง
// แข่ง/แต้มขัดแย้งกับฟอร์ม 5 นัดหลังและแต้มผู้ทายที่คิดจาก DB ของเราเอง
//
// คำนวณเองจึงชนะทุกทาง: ทุกตัวเลขบนเว็บมาจากแหล่งเดียว (ตาราง matches ที่ผ่านการ์ด
// กันข้อมูลหลอนแล้ว — ดู upsertMatch) สอดคล้องกันเสมอ และประหยัด API ไป 1 request/ลีก
// แลกกับการไม่เห็นการหักแต้มอย่างเป็นทางการ ซึ่งยอมได้เพราะแต้มผู้เล่นของเราก็ไม่รู้จัก
// การหักแต้มอยู่แล้ว — อย่างน้อยเว็บทั้งเว็บเล่าเรื่องเดียวกัน
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

// คำนวณฟอร์ม 5 นัดหลังสุดจากตาราง matches (แหล่งเดียวกับตารางคะแนนข้างล่าง)
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
  const rows = await sqlClient<
    {
      external_id: number; name: string; short_name: string | null; tla: string | null;
      crest_url: string | null; played: number; won: number; draw: number; lost: number;
      gf: number; ga: number; points: number; current_matchday: number | null;
    }[]
  >`
    with season as (
      select id, current_matchday from seasons
      where competition_code = ${code} and is_active = true limit 1
    ),
    -- นับเฉพาะนัดที่จบและมีสกอร์ครบ (เกณฑ์เดียวกับที่ใช้ตัดแต้มผู้ทายใน score job)
    played as (
      select m.home_team_id as team_id,
        case
          when m.home_score > m.away_score then 'W'
          when m.home_score = m.away_score then 'D'
          else 'L'
        end as result,
        m.home_score as gf, m.away_score as ga
      from matches m
      where m.season_id = (select id from season) and m.status = 'FINISHED'
        and m.home_score is not null and m.away_score is not null
      union all
      select m.away_team_id,
        case
          when m.away_score > m.home_score then 'W'
          when m.away_score = m.home_score then 'D'
          else 'L'
        end,
        m.away_score, m.home_score
      from matches m
      where m.season_id = (select id from season) and m.status = 'FINISHED'
        and m.home_score is not null and m.away_score is not null
    ),
    -- ทีมทั้งหมดของฤดูกาล (รวมทีมที่ยังไม่เตะสักนัด — ต้องโผล่ในตารางด้วยค่า 0)
    season_teams as (
      select distinct team_id from (
        select home_team_id as team_id from matches where season_id = (select id from season)
        union all
        select away_team_id from matches where season_id = (select id from season)
      ) x
    )
    select
      t.external_id, t.name, t.short_name, t.tla, t.crest_url,
      count(p.result)::int as played,
      (count(*) filter (where p.result = 'W'))::int as won,
      (count(*) filter (where p.result = 'D'))::int as draw,
      (count(*) filter (where p.result = 'L'))::int as lost,
      coalesce(sum(p.gf), 0)::int as gf,
      coalesce(sum(p.ga), 0)::int as ga,
      ((count(*) filter (where p.result = 'W')) * 3
        + (count(*) filter (where p.result = 'D')))::int as points,
      (select current_matchday from season) as current_matchday
    from season_teams st
    join teams t on t.id = st.team_id
    left join played p on p.team_id = st.team_id
    group by t.external_id, t.name, t.short_name, t.tla, t.crest_url
    order by points desc, (coalesce(sum(p.gf), 0) - coalesce(sum(p.ga), 0)) desc,
      coalesce(sum(p.gf), 0) desc, t.name asc
  `;

  const formByTeam = await getRecentFormByExternalTeamId(code);

  // อันดับแบบเดียวกับตารางจริง: เสมอกันทุกเกณฑ์ (แต้ม/ได้เสีย/ประตูได้) = อันดับร่วม
  let position = 0;
  let prevKey = '';
  const table: StandingRow[] = rows.map((r, index) => {
    const key = `${r.points}|${r.gf - r.ga}|${r.gf}`;
    if (key !== prevKey) {
      position = index + 1;
      prevKey = key;
    }
    return {
      position,
      team: {
        id: r.external_id,
        name: r.name,
        shortName: r.short_name ?? r.name,
        tla: r.tla ?? '',
        crest: r.crest_url ?? '',
      },
      playedGames: r.played,
      form: formByTeam.get(r.external_id) ?? null,
      won: r.won,
      draw: r.draw,
      lost: r.lost,
      points: r.points,
      goalsFor: r.gf,
      goalsAgainst: r.ga,
      goalDifference: r.gf - r.ga,
    };
  });

  return {
    table,
    competitionName: competitionLabel(code, code),
    currentMatchday: rows[0]?.current_matchday ?? null,
    // คำนวณสดจาก DB ทุกครั้ง ไม่มี cache ให้ค้าง — สองฟิลด์นี้คงไว้ให้หน้าเดิมใช้ต่อได้เฉย ๆ
    stale: false,
    fetchedAt: new Date(),
  };
}
