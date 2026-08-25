import type postgres from 'postgres';

import { COLOR, postToDiscord, type DiscordMessage } from '@/lib/notify/discord';

// ── แจ้งเตือนเข้า Discord ของแต่ละลีก ─────────────────────────────────────────
//
// งานนี้ถูกยิงโดย cron ทุก ~15 นาที จึงต้องตอบคำถามได้ว่า "ตอนนี้ควรมีข้อความอะไรอยู่ในกลุ่มบ้าง"
// แล้วส่งเฉพาะอันที่ยังไม่เคยส่ง — ไม่ใช่ "มีอะไรเปลี่ยนตั้งแต่รอบที่แล้ว" ซึ่งจะพังทันทีที่ cron
// พลาดไปหนึ่งรอบหรือถูกยิงซ้ำ
//
// กันส่งซ้ำด้วย unique (league_id, kind, ref) ในตาราง notifications_sent ไม่ใช่ด้วยตัวแปรในโค้ด
// วิธีคือ "จองก่อนส่ง": insert ... on conflict do nothing ถ้าได้แถวคืนมาแปลว่าเราเป็นคนแรกที่ได้
// สิทธิ์ส่ง ถ้าไม่ได้แปลว่ามีคนส่งไปแล้ว — ทำให้ต่อให้ cron สองรอบทับกันพอดีก็ไม่มีทางโพสต์ซ้ำ
// ถ้าส่งไม่สำเร็จค่อยลบการจองคืนเพื่อให้รอบหน้าลองใหม่

type League = {
  id: string;
  name: string;
  season_id: string;
  discord_webhook_url: string;
  current_matchday: number | null;
};

type Candidate = { kind: string; ref: string; message: DiscordMessage };

const NAME = `coalesce(u.display_name, u.name)`;

// ── กติกาที่ 1: เตือนก่อนปิดรับ ────────────────────────────────────────────────
// ยิงครั้งเดียวต่อแมตช์เดย์ ตอนที่เหลือเวลาอีก 1-5 ชั่วโมงก่อนนัดแรกของแมตช์เดย์นั้นเตะ
// ช่วงกว้าง 4 ชั่วโมงเพราะ cron ยิงทุก 15 นาที ถ้าตั้งช่วงแคบกว่านี้แล้ว cron พลาดไปรอบหนึ่ง
// การเตือนจะหายไปเลย
async function deadlineRule(sql: postgres.Sql, league: League): Promise<Candidate[]> {
  const md = league.current_matchday;
  if (md == null) return [];

  const [next] = await sql<{ kickoff_at: Date; hours_left: number }[]>`
    select min(kickoff_at) as kickoff_at,
           extract(epoch from (min(kickoff_at) - now())) / 3600 as hours_left
    from matches
    where season_id = ${league.season_id} and matchday = ${md} and kickoff_at > now()
  `;
  if (!next?.kickoff_at) return [];
  if (next.hours_left < 1 || next.hours_left > 5) return [];

  // ใครยังทายไม่ครบบ้าง — นับเฉพาะคน ไม่นับ AI (AI มี cron ของตัวเองอยู่แล้ว)
  const slackers = await sql<{ name: string; missing: number }[]>`
    select ${sql.unsafe(NAME)} as name,
           count(*) filter (where p.id is null)::int as missing
    from league_members lm
    join users u on u.id = lm.user_id
    cross join matches m
    left join predictions p on p.match_id = m.id and p.user_id = lm.user_id
    where lm.league_id = ${league.id}
      and u.player_kind = 'human'
      and m.season_id = ${league.season_id}
      and m.matchday = ${md}
      and m.kickoff_at > now()
    group by lm.user_id, u.display_name, u.name
    having count(*) filter (where p.id is null) > 0
    order by 1
  `;
  if (slackers.length === 0) return [];

  const hours = Math.round(next.hours_left);
  return [
    {
      kind: 'deadline',
      ref: `md:${md}`,
      message: {
        embeds: [
          {
            title: `⏰ อีกราว ${hours} ชม. จะปิดรับทายแมตช์เดย์ ${md}`,
            description: `**ยังทายไม่ครบ:** ${slackers
              .map((s) => `${s.name} (${s.missing} นัด)`)
              .join(' · ')}\n\nทายไม่ทันคิกออฟคือเสียแต้มนัดนั้นถาวร`,
            color: COLOR.urgent,
            footer: { text: league.name },
          },
        ],
      },
    },
  ];
}

// ── กติกาที่ 2: เปิดคำทายทุกคนตอนคิกออฟ ────────────────────────────────────────
// จัดกลุ่มตาม "เวลาคิกออฟ" ไม่ใช่ตามนัด — เสาร์บ่ายสามที่เตะพร้อมกัน 5 คู่จะได้ข้อความเดียว
// ไม่ใช่ 5 ข้อความ ซึ่งเป็นความต่างระหว่างบอทที่คนอ่านกับบอทที่คนปิดเสียง
//
// จำกัดที่ 3 ชั่วโมงย้อนหลัง เพื่อไม่ให้ตอน deploy ครั้งแรกมันไล่โพสต์คำทายของทั้งฤดูกาลรวดเดียว
type RevealRow = {
  home: string;
  away: string;
  name: string;
  player_kind: 'human' | 'ai';
  predicted_outcome: 'HOME' | 'DRAW' | 'AWAY' | null;
};

async function revealRule(sql: postgres.Sql, league: League): Promise<Candidate[]> {
  // ดึงค่าเวลามาเป็น text ด้วย (ko_text) แล้วใช้อันนั้นเป็น ref — ไม่เรียก .toISOString() บนค่าที่
  // driver ส่งกลับมา เพราะ postgres.js คืน timestamptz มาเป็น string ไม่ใช่ Date เสมอไป
  // ขึ้นกับ type parser ที่ตั้งไว้ ให้ฐานข้อมูลแปลงเป็นข้อความให้เลยจึงแน่นอนกว่า
  const slots = await sql<{ ko_text: string }[]>`
    select distinct kickoff_at::text as ko_text
    from matches
    where season_id = ${league.season_id}
      and kickoff_at between now() - interval '3 hours' and now()
    order by 1
  `;

  const out: Candidate[] = [];
  for (const slot of slots) {
    const rows = await sql<RevealRow[]>`
      select ht.name as home, at.name as away,
             ${sql.unsafe(NAME)} as name, u.player_kind,
             p.predicted_outcome::text as predicted_outcome
      from matches m
      join teams ht on ht.id = m.home_team_id
      join teams at on at.id = m.away_team_id
      join league_members lm on lm.league_id = ${league.id}
      join users u on u.id = lm.user_id
      left join predictions p on p.match_id = m.id and p.user_id = lm.user_id
      where m.season_id = ${league.season_id} and m.kickoff_at::text = ${slot.ko_text}
      order by ht.name, u.player_kind, 3
    `;
    if (rows.length === 0) continue;

    const byMatch = new Map<string, RevealRow[]>();
    for (const r of rows) {
      const key = `${r.home} พบ ${r.away}`;
      const list = byMatch.get(key) ?? [];
      list.push(r);
      byMatch.set(key, list);
    }

    const label = (r: RevealRow) => {
      const p = r.predicted_outcome;
      const text = p === 'HOME' ? 'เจ้าบ้าน' : p === 'AWAY' ? 'ทีมเยือน' : p === 'DRAW' ? 'เสมอ' : '—';
      return `${r.player_kind === 'ai' ? '🤖 ' : ''}${r.name}: ${text}`;
    };

    out.push({
      kind: 'reveal',
      ref: `ko:${slot.ko_text}`,
      message: {
        embeds: [
          {
            title: '🔓 เริ่มแข่งแล้ว — เปิดคำทายทุกคน',
            color: COLOR.accent,
            fields: [...byMatch.entries()].slice(0, 25).map(([match, list]) => ({
              name: match,
              value: list.map(label).join('\n').slice(0, 1024),
            })),
            footer: { text: league.name },
          },
        ],
      },
    });
  }
  return out;
}

// ── กติกาที่ 3: แซงขึ้นนำ ──────────────────────────────────────────────────────
// ยิงเฉพาะตอนอันดับ 1 เปลี่ยนมือจริง ๆ — เทียบกับคนที่ขึ้นนำครั้งล่าสุดที่เคยประกาศไป
// ไม่ได้เทียบกับ "รอบที่แล้ว" ของ cron เพราะ cron อาจพลาดรอบหรือถูกยิงซ้ำได้
async function leadChangeRule(sql: postgres.Sql, league: League): Promise<Candidate[]> {
  const md = league.current_matchday ?? 0;

  const top = await sql<{ user_id: string; name: string; points: number }[]>`
    select p.user_id, ${sql.unsafe(NAME)} as name, sum(ps.points_awarded)::int as points
    from prediction_scores ps
    join predictions p on p.id = ps.prediction_id
    join users u on u.id = p.user_id
    where ps.league_id = ${league.id}
    group by p.user_id, u.display_name, u.name
    order by points desc, name asc
    limit 2
  `;
  if (top.length === 0) return [];

  const leader = top[0];
  const [last] = await sql<{ ref: string }[]>`
    select ref from notifications_sent
    where league_id = ${league.id} and kind = 'lead_change'
    order by sent_at desc
    limit 1
  `;
  const previousLeaderId = last?.ref.split(':')[1];
  if (previousLeaderId === leader.user_id) return [];

  const gap = top[1] ? leader.points - top[1].points : leader.points;
  return [
    {
      kind: 'lead_change',
      ref: `md${md}:${leader.user_id}`,
      message: {
        embeds: [
          {
            title: previousLeaderId ? `🔥 ${leader.name} แซงขึ้นนำแล้ว` : `👑 ${leader.name} ขึ้นนำเป็นคนแรก`,
            description:
              `${leader.points} แต้ม` +
              (top[1] ? ` · นำ ${top[1].name} อยู่ ${gap} แต้ม` : ''),
            color: COLOR.accent,
            footer: { text: league.name },
          },
        ],
      },
    },
  ];
}

// ── กติกาที่ 4: AI อ่านขาด / AI พลาดยับ ────────────────────────────────────────
// เอาเฉพาะเคสที่ขาดจริง: ฝั่งหนึ่งถูกหมด อีกฝั่งผิดหมด — ถ้าตั้งเกณฑ์หลวมกว่านี้จะกลายเป็น
// ข้อความประจำสัปดาห์ที่ไม่มีใครตื่นเต้นด้วย
async function aiSplitRule(sql: postgres.Sql, league: League): Promise<Candidate[]> {
  const rows = await sql<
    {
      match_id: string;
      home: string;
      away: string;
      home_score: number;
      away_score: number;
      human_total: number;
      human_correct: number;
      ai_total: number;
      ai_correct: number;
    }[]
  >`
    select
      m.id as match_id, ht.name as home, at.name as away,
      m.home_score, m.away_score,
      count(*) filter (where u.player_kind = 'human')::int as human_total,
      count(*) filter (where u.player_kind = 'human' and p.predicted_outcome::text = (
        case when m.home_score > m.away_score then 'HOME'
             when m.home_score < m.away_score then 'AWAY' else 'DRAW' end))::int as human_correct,
      count(*) filter (where u.player_kind = 'ai')::int as ai_total,
      count(*) filter (where u.player_kind = 'ai' and p.predicted_outcome::text = (
        case when m.home_score > m.away_score then 'HOME'
             when m.home_score < m.away_score then 'AWAY' else 'DRAW' end))::int as ai_correct
    from matches m
    join teams ht on ht.id = m.home_team_id
    join teams at on at.id = m.away_team_id
    join league_members lm on lm.league_id = ${league.id}
    join users u on u.id = lm.user_id
    join predictions p on p.match_id = m.id and p.user_id = lm.user_id
    where m.season_id = ${league.season_id}
      and m.status = 'FINISHED'
      and m.home_score is not null
      and m.kickoff_at > now() - interval '12 hours'
    group by m.id, ht.name, at.name, m.home_score, m.away_score
    having count(*) filter (where u.player_kind = 'human') > 0
       and count(*) filter (where u.player_kind = 'ai') > 0
  `;

  const out: Candidate[] = [];
  for (const r of rows) {
    const aiAllRight = r.ai_correct === r.ai_total && r.human_correct === 0;
    const humansAllRight = r.human_correct === r.human_total && r.ai_correct === 0;
    if (!aiAllRight && !humansAllRight) continue;

    out.push({
      kind: 'ai_split',
      ref: r.match_id,
      message: {
        embeds: [
          {
            title: aiAllRight ? '🤖 AI อ่านขาด คนพลาดทั้งกลุ่ม' : '🧠 คนอ่านขาด AI พลาดทั้งหมด',
            description:
              `**${r.home} ${r.home_score}-${r.away_score} ${r.away}**\n` +
              `คนทายถูก ${r.human_correct}/${r.human_total} · AI ทายถูก ${r.ai_correct}/${r.ai_total}`,
            color: aiAllRight ? COLOR.urgent : COLOR.accent,
            footer: { text: league.name },
          },
        ],
      },
    });
  }
  return out;
}

// ── กติกาที่ 5: สรุปแมตช์เดย์ ──────────────────────────────────────────────────
// ยิงเมื่อทุกนัดในแมตช์เดย์นั้นจบครบแล้ว (และคิดคะแนนแล้ว) — เขียนจากตัวเลขในฐานข้อมูลตรง ๆ
// ไม่ได้เรียก LLM เพราะงานนี้อยู่ใน serverless function ที่มีเพดาน 60 วิ การเรียกโมเดลเพิ่ม
// ความเสี่ยงที่ทั้ง job จะถูกตัดกลางคัน แลกกับสำนวนที่สวยขึ้นเล็กน้อย ไม่คุ้ม
async function recapRule(sql: postgres.Sql, league: League): Promise<Candidate[]> {
  const [done] = await sql<{ matchday: number }[]>`
    select m.matchday
    from matches m
    where m.season_id = ${league.season_id}
      and m.kickoff_at > now() - interval '24 hours'
    group by m.matchday
    having count(*) filter (where m.status <> 'FINISHED') = 0
       and count(*) > 0
    order by m.matchday desc
    limit 1
  `;
  if (!done) return [];

  const standings = await sql<{ name: string; player_kind: string; total: number; week: number }[]>`
    select ${sql.unsafe(NAME)} as name, u.player_kind,
           sum(ps.points_awarded)::int as total,
           sum(ps.points_awarded) filter (where m.matchday = ${done.matchday})::int as week
    from prediction_scores ps
    join predictions p on p.id = ps.prediction_id
    join matches m on m.id = p.match_id
    join users u on u.id = p.user_id
    where ps.league_id = ${league.id}
    group by p.user_id, u.display_name, u.name, u.player_kind
    order by total desc, name asc
    limit 12
  `;
  if (standings.length === 0) return [];

  const board = standings
    .map((r, i) => {
      const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
      const tag = r.player_kind === 'ai' ? ' 🤖' : '';
      return `${medal} ${r.name}${tag} — **${r.total}** (สัปดาห์นี้ +${r.week ?? 0})`;
    })
    .join('\n');

  const humans = standings.filter((r) => r.player_kind === 'human');
  const ais = standings.filter((r) => r.player_kind === 'ai');
  const bestHuman = humans[0];
  const bestAi = ais[0];
  const verdict =
    bestHuman && bestAi
      ? bestHuman.total > bestAi.total
        ? `คนยังนำ AI อยู่ (${bestHuman.name} ${bestHuman.total} · ${bestAi.name} ${bestAi.total})`
        : bestAi.total > bestHuman.total
          ? `AI แซงคนแล้ว (${bestAi.name} ${bestAi.total} · ${bestHuman.name} ${bestHuman.total})`
          : 'คนกับ AI เสมอกันพอดี'
      : '';

  return [
    {
      kind: 'recap',
      ref: `md:${done.matchday}`,
      message: {
        embeds: [
          {
            title: `📊 จบแมตช์เดย์ ${done.matchday} แล้ว`,
            description: `${board}${verdict ? `\n\n${verdict}` : ''}`,
            color: COLOR.neutral,
            footer: { text: league.name },
          },
        ],
      },
    },
  ];
}

// ── กติกาที่ 6: มีคอลัมน์ใหม่ ──────────────────────────────────────────────────
// ยิงเมื่อ AI เขียนคอลัมน์ประจำวันของลีกฟุตบอลที่กลุ่มนี้ทายเสร็จ
//
// ส่งแค่หัวข้อกับย่อหน้าแรก ไม่ยัดทั้งบทความลงห้องแชท — จุดประสงค์คือชวนให้กดไปอ่านบนเว็บ
// ไม่ใช่แทนที่หน้าเว็บ (และ Discord ก็จะตัดข้อความยาวเกินทิ้งอยู่ดี)
//
// ลิงก์ใช้ AUTH_URL ที่ตั้งไว้อยู่แล้วสำหรับ Auth.js แทนที่จะเพิ่ม env ใหม่อีกตัวให้ต้องดูแล
// ถ้าไม่ได้ตั้ง (เช่นตอนรันในเครื่อง) ก็แค่ไม่มีลิงก์ ข้อความอื่นยังส่งได้ปกติ
async function articleRule(sql: postgres.Sql, league: League): Promise<Candidate[]> {
  const [article] = await sql<{ id: string; title: string; body: string }[]>`
    select id, title, body
    from articles
    where season_id = ${league.season_id}
      and created_at > now() - interval '24 hours'
    order by published_on desc, created_at desc
    limit 1
  `;
  if (!article) return [];

  // ย่อหน้าแรก ตัด ** ของ markdown ออกก่อนเพราะ Discord ตีความคนละแบบกับที่เราเรนเดอร์บนเว็บ
  const first = article.body.split(/\n{2,}/)[0]?.replace(/\*\*/g, '').trim() ?? '';
  const excerpt = first.length > 300 ? `${first.slice(0, 300)}…` : first;

  const base = process.env.AUTH_URL?.replace(/\/$/, '');
  const link = base ? `\n\n[อ่านฉบับเต็ม](${base}/news/${article.id})` : '';

  return [
    {
      kind: 'article',
      ref: article.id,
      message: {
        embeds: [
          {
            title: `📰 ${article.title}`,
            description: `${excerpt}${link}`,
            color: COLOR.neutral,
            footer: { text: `คอลัมน์ประจำวันที่ AI เขียน · ${league.name}` },
          },
        ],
      },
    },
  ];
}

const RULES = [deadlineRule, revealRule, leadChangeRule, aiSplitRule, recapRule, articleRule];

export async function runNotify(sql: postgres.Sql, log = console.log) {
  const leagues = await sql<League[]>`
    select l.id, l.name, l.season_id, l.discord_webhook_url, s.current_matchday
    from leagues l
    join seasons s on s.id = l.season_id
    where l.discord_webhook_url is not null
  `;

  let sent = 0;
  let failed = 0;

  for (const league of leagues) {
    for (const rule of RULES) {
      let candidates: Candidate[] = [];
      try {
        candidates = await rule(sql, league);
      } catch (err) {
        // กติกาข้อหนึ่งพังไม่ควรทำให้ข้ออื่นและลีกอื่นไม่ได้ส่งเลย
        log(`[${league.name}] กติกา ${rule.name} ล้มเหลว: ${String(err)}`);
        failed++;
        continue;
      }

      for (const c of candidates) {
        // จองสิทธิ์ส่งก่อน — ถ้า insert ไม่ติดแปลว่าเคยส่งไปแล้ว ข้ามเลย
        const claimed = await sql<{ id: string }[]>`
          insert into notifications_sent (league_id, kind, ref)
          values (${league.id}, ${c.kind}, ${c.ref})
          on conflict (league_id, kind, ref) do nothing
          returning id
        `;
        if (claimed.length === 0) continue;

        try {
          await postToDiscord(league.discord_webhook_url, c.message);
          sent++;
          log(`[${league.name}] ส่ง ${c.kind} (${c.ref})`);
        } catch (err) {
          // คืนการจอง เพื่อให้รอบหน้าลองส่งใหม่ ไม่งั้นข้อความนี้จะหายไปตลอดกาล
          await sql`delete from notifications_sent where id = ${claimed[0].id}`;
          failed++;
          log(`[${league.name}] ส่ง ${c.kind} ไม่สำเร็จ: ${String(err)}`);
        }
      }
    }
  }

  return { processed: sent, failed, leagues: leagues.length };
}
