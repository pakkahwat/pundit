import type postgres from 'postgres';

export type FormEntry = {
  matchId: string;
  kickoffAt: string;
  opponent: string;
  isHome: boolean;
  goalsFor: number;
  goalsAgainst: number;
  result: 'W' | 'D' | 'L';
};

export type StandingsRow = {
  team: string;
  played: number;
  points: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDiff: number;
};

export type MatchContext = {
  matchId: string;
  kickoffAt: string;
  homeTeam: string;
  awayTeam: string;
  homeForm: FormEntry[];
  awayForm: FormEntry[];
  headToHead: FormEntry[]; // มุมมองจากทีมเหย้าของแมตช์เป้าหมาย
  standings: StandingsRow[];
};

type RawFormRow = {
  match_id: string;
  kickoff_at: string;
  opponent: string;
  is_home: boolean;
  gf: number;
  ga: number;
};

function toFormEntry(r: RawFormRow): FormEntry {
  return {
    matchId: r.match_id,
    kickoffAt: r.kickoff_at,
    opponent: r.opponent,
    isHome: r.is_home,
    goalsFor: r.gf,
    goalsAgainst: r.ga,
    result: r.gf > r.ga ? 'W' : r.gf === r.ga ? 'D' : 'L',
  };
}

// สร้าง context ให้ AI (ทั้ง baseline และตัวที่ใช้ LLM) ใช้ทายผล — ทุก query ในนี้กรองด้วย
// "kickoff_at ของแมตช์เป้าหมาย" เสมอ (ไม่ใช่ now()) เพื่อรับประกันว่าต่อให้รัน job ช้าไปแค่ไหน
// หรือรันย้อนหลังเพื่อเทส AI จะไม่มีทางเห็นผลของแมตช์ที่ "ในเวลาจริง" ยังไม่เกิดขึ้นก่อนแมตช์ที่
// กำลังทายได้เลย — นี่คือหัวใจของ requirement ข้อ 5 (AI ห้ามเข้าถึงข้อมูลหลังแข่งจบของแมตช์ที่
// กำลังทาย) ต่างจาก "กันเวลาปิดรับ" (ที่ใช้ now() ของ Postgres ใน guarded-upsert.ts) ซึ่งเป็นคนละ
// เรื่องกัน: อันนั้นกันการ "เขียน" หลังปิดรับ ส่วนอันนี้กันการ "อ่าน" ข้อมูลที่ยังไม่ควรมีอยู่จริง
export async function buildMatchContext(sql: postgres.Sql, matchId: string): Promise<MatchContext> {
  const [target] = await sql<
    {
      id: string;
      kickoff_at: string;
      season_id: string;
      home_team_id: string;
      away_team_id: string;
      home_name: string;
      away_name: string;
    }[]
  >`
    select m.id, m.kickoff_at, m.season_id, m.home_team_id, m.away_team_id,
      ht.name as home_name, at.name as away_name
    from matches m
    join teams ht on ht.id = m.home_team_id
    join teams at on at.id = m.away_team_id
    where m.id = ${matchId}
  `;
  if (!target) {
    throw new Error(`ไม่พบแมตช์ ${matchId}`);
  }

  const recentForm = (teamId: string) => sql<RawFormRow[]>`
    select
      m.id as match_id, m.kickoff_at,
      case when m.home_team_id = ${teamId} then at.name else ht.name end as opponent,
      m.home_team_id = ${teamId} as is_home,
      case when m.home_team_id = ${teamId} then m.home_score else m.away_score end as gf,
      case when m.home_team_id = ${teamId} then m.away_score else m.home_score end as ga
    from matches m
    join teams ht on ht.id = m.home_team_id
    join teams at on at.id = m.away_team_id
    where (m.home_team_id = ${teamId} or m.away_team_id = ${teamId})
      and m.status = 'FINISHED'
      and m.kickoff_at < ${target.kickoff_at}
    order by m.kickoff_at desc
    limit 5
  `;

  const [homeFormRows, awayFormRows, h2hRows, standingsRows] = await Promise.all([
    recentForm(target.home_team_id),
    recentForm(target.away_team_id),
    sql<RawFormRow[]>`
      select
        m.id as match_id, m.kickoff_at,
        case when m.home_team_id = ${target.home_team_id} then at.name else ht.name end as opponent,
        m.home_team_id = ${target.home_team_id} as is_home,
        case when m.home_team_id = ${target.home_team_id} then m.home_score else m.away_score end as gf,
        case when m.home_team_id = ${target.home_team_id} then m.away_score else m.home_score end as ga
      from matches m
      join teams ht on ht.id = m.home_team_id
      join teams at on at.id = m.away_team_id
      where ((m.home_team_id = ${target.home_team_id} and m.away_team_id = ${target.away_team_id})
          or (m.home_team_id = ${target.away_team_id} and m.away_team_id = ${target.home_team_id}))
        and m.status = 'FINISHED'
        and m.kickoff_at < ${target.kickoff_at}
      order by m.kickoff_at desc
      limit 5
    `,
    sql<{ team: string; played: number; points: number; gf: number; ga: number; gd: number }[]>`
      with team_matches as (
        select home_team_id as team_id, home_score as gf, away_score as ga,
          case when home_score > away_score then 3 when home_score = away_score then 1 else 0 end as pts
        from matches
        where season_id = ${target.season_id} and status = 'FINISHED' and kickoff_at < ${target.kickoff_at}
        union all
        select away_team_id as team_id, away_score as gf, home_score as ga,
          case when away_score > home_score then 3 when away_score = home_score then 1 else 0 end as pts
        from matches
        where season_id = ${target.season_id} and status = 'FINISHED' and kickoff_at < ${target.kickoff_at}
      )
      select t.name as team, count(*)::int as played, sum(pts)::int as points,
        sum(gf)::int as gf, sum(ga)::int as ga, sum(gf - ga)::int as gd
      from team_matches tm
      join teams t on t.id = tm.team_id
      group by t.id, t.name
      order by points desc, gd desc, gf desc
    `,
  ]);

  return {
    matchId: target.id,
    kickoffAt: target.kickoff_at,
    homeTeam: target.home_name,
    awayTeam: target.away_name,
    homeForm: homeFormRows.map(toFormEntry),
    awayForm: awayFormRows.map(toFormEntry),
    headToHead: h2hRows.map(toFormEntry),
    standings: standingsRows.map((r) => ({
      team: r.team,
      played: r.played,
      points: r.points,
      goalsFor: r.gf,
      goalsAgainst: r.ga,
      goalDiff: r.gd,
    })),
  };
}
