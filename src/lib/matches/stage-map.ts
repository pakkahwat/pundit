import type postgres from 'postgres';

import { sqlClient } from '@/db/client';
import { reportOps } from '@/lib/notify/ops';

import { buildStageMap, matchdayLabel, type StageInfo } from './stage-label';

/**
 * ตรวจว่าฤดูกาลนี้มีเลขแมตช์เดย์ซ้ำข้ามรอบไหม (เช่น PLAYOFFS ใช้ matchday 1 ซ้ำกับรอบลีก)
 *
 * ทั้งระบบใช้ (season, matchday) เป็นตัวระบุรอบ — ถ้าซ้ำ หน้าทาย/reveal จะเอานัดสองรอบมาปนกัน
 * และป้ายรอบจะผิดแบบเงียบ ๆ ยังไม่รู้ว่า football-data นับเลขรอบน็อกเอาต์ของ CL อย่างไร
 * (feed ตอนเปิดใช้มีแค่รอบลีก) จึงเช็คหลัง sync ทุกครั้งแล้วฟ้องเข้าช่อง ops แทนที่จะรอให้คนสังเกตเอง
 * คืน true ถ้าพบซ้ำ
 */
export async function checkStageMatchdayCollisions(
  sql: postgres.Sql,
  seasonId: string,
  code: string,
  log: (msg: string) => void = () => {},
): Promise<boolean> {
  const dup = await sql<{ matchday: number; stages: string }[]>`
    select matchday, string_agg(distinct stage, ',') as stages
    from matches
    where season_id = ${seasonId}::uuid and stage is not null
    group by matchday
    having count(distinct stage) > 1
    order by matchday
  `;
  const detail = dup.map((d) => `md ${d.matchday}: ${d.stages}`).join(' · ');
  if (dup.length > 0) {
    log(`[${code}] ⚠️ เลขแมตช์เดย์ซ้ำข้ามรอบ — ${detail} (ต้องแปลงเลขตอน sync ก่อนเปิดรอบน็อกเอาต์)`);
  }
  await reportOps(
    sql,
    `stage:${code}`,
    dup.length > 0 ? 'error' : 'ok',
    dup.length > 0 ? `เลขแมตช์เดย์ซ้ำข้ามรอบ: ${detail}` : null,
    log,
  );
  return dup.length > 0;
}

// ส่วนที่อ่าน stage จาก DB — ตรรกะป้าย/นับ leg อยู่ใน stage-label.ts (ไฟล์นั้นเทสต์ได้ ไฟล์นี้ไม่)

/**
 * แผนที่ matchday → StageInfo ของหลายฤดูกาลในคำสั่งเดียว (หน้าแรก/รายการลีกใช้)
 * ฤดูกาลที่ไม่มีข้อมูล stage เลย (ลีกที่ sync ก่อนมีคอลัมน์นี้) จะได้ Map ว่าง → ทุกแมตช์เดย์
 * ตกไปเป็น "แมตช์เดย์ N" ตามปกติ
 */
export async function getStageMaps(
  seasonIds: string[],
  sql: postgres.Sql = sqlClient,
): Promise<Map<string, Map<number, StageInfo>>> {
  const unique = [...new Set(seasonIds)];
  const result = new Map<string, Map<number, StageInfo>>();
  for (const id of unique) result.set(id, new Map());
  if (unique.length === 0) return result;

  const rows = await sql<{ season_id: string; matchday: number; stage: string | null }[]>`
    select season_id, matchday, min(stage) as stage
    from matches
    where season_id = any(${unique}::uuid[]) and stage is not null
    group by season_id, matchday
  `;

  const bySeason = new Map<string, { matchday: number; stage: string | null }[]>();
  for (const r of rows) {
    bySeason.set(r.season_id, [...(bySeason.get(r.season_id) ?? []), r]);
  }
  for (const [seasonId, seasonRows] of bySeason) {
    result.set(seasonId, buildStageMap(seasonRows));
  }
  return result;
}

/** เวอร์ชันฤดูกาลเดียว — คืนฟังก์ชันป้ายที่พร้อมใช้ในหน้าเว็บ/งาน cron */
export async function matchdayLabeler(
  seasonId: string,
  sql: postgres.Sql = sqlClient,
): Promise<(matchday: number) => string> {
  const maps = await getStageMaps([seasonId], sql);
  const map = maps.get(seasonId) ?? new Map<number, StageInfo>();
  return (matchday) => matchdayLabel(matchday, map.get(matchday));
}
