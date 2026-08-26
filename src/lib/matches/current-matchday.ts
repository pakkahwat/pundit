import type postgres from 'postgres';

import { sqlClient } from '@/db/client';

// ── "แมตช์เดย์ปัจจุบัน" ของฤดูกาลหนึ่งคืออะไร ────────────────────────────────
//
// กติกา: แมตช์เดย์ของ "นัดถัดไปที่ยังไม่ถึงเวลาคิกออฟ" — ถ้าเตะจบทั้งฤดูกาลแล้วก็คือแมตช์เดย์สุดท้าย
//
// เดิมเราเชื่อค่า currentSeason.currentMatchday ที่ football-data.org ส่งมา แล้วเก็บลง
// seasons.current_matchday ตรง ๆ ปัญหาคือค่านั้นเดินหน้าไปก่อนที่แมตช์เดย์ปัจจุบันจะเตะครบ
// (เคสจริงที่เจอ: ลาลีกาแมตช์เดย์ 1 ยังเหลืออีก 3 นัดที่ยังไม่เตะและยังทายได้อยู่ แต่ API บอกว่า
// currentMatchday = 2 ไปแล้ว) ผลคือทั้งเว็บเพี้ยนพร้อมกันหมด: หน้าทายผลเด้งไปแมตช์เดย์ 2 แล้ว
// ติดป้ายว่าแมตช์เดย์ 1 "ผ่านไปแล้ว" ทั้งที่ยังทายได้, หน้าคำทายทุกคนโชว์นัดของแมตช์เดย์ 2
// แค่นัดเดียวแทนที่จะโชว์นัดที่เตะไปแล้วของแมตช์เดย์ 1, และปุ่ม → เปิดให้ทายล่วงหน้าเกินจริง
//
// จึงเลิกเชื่อค่าจากผู้ให้บริการ แล้วคำนวณจากตาราง matches ของเราเองซึ่งเป็นข้อมูลชุดเดียวกับที่
// ใช้ตัดสินว่าปิดรับคำทายหรือยัง (kickoff_at เทียบ now() ของ Postgres) — สองอย่างนี้จึงตรงกัน
// เสมอโดยธรรมชาติ ไม่ต้องรอ cron และไม่ขึ้นกับว่าผู้ให้บริการนับแมตช์เดย์ยังไง
//
// ทำไมใช้ "นัดถัดไปที่ยังไม่คิกออฟ" ไม่ใช่ "แมตช์เดย์ต่ำสุดที่ยังมีนัดไม่คิกออฟ":
// นัดที่ถูกเลื่อน (postponed) จะยังอยู่แมตช์เดย์เดิมแต่ไปเตะอีกหลายเดือนข้างหน้า ถ้าใช้แบบหลัง
// ทั้งฤดูกาลจะค้างอยู่ที่แมตช์เดย์ 1 ตลอด ส่วนแบบนี้จะเรียงตามเวลาจริง นัดที่เตะก่อนย่อมมาก่อน
//
// กติกานี้เขียนไว้ที่เดียวและใช้กับทุกลีก — เพิ่มลีกใหม่ในอนาคตก็ได้พฤติกรรมเดียวกันทันที
// โดยไม่ต้องไปแก้อะไรตามหน้าต่าง ๆ อีก

/**
 * หาแมตช์เดย์ปัจจุบันของหลายฤดูกาลพร้อมกันในคำสั่งเดียว
 *
 * ใช้เวอร์ชันนี้เมื่อหน้าหนึ่งต้องรู้ค่าของหลายลีก (หน้าแรก, รายการลีก, job แจ้งเตือน) เพื่อไม่ให้
 * เกิด N+1 query — ส่วนกรณีลีกเดียวใช้ getCurrentMatchday() ที่ห่อฟังก์ชันนี้ไว้อีกที
 *
 * คืนเฉพาะ season_id ที่มีอยู่จริง — id ที่ไม่รู้จักจะไม่อยู่ใน Map
 */
export async function getCurrentMatchdays(
  seasonIds: string[],
  sql: postgres.Sql = sqlClient,
): Promise<Map<string, number>> {
  const unique = [...new Set(seasonIds)];
  if (unique.length === 0) return new Map();

  const rows = await sql<{ season_id: string; md: number }[]>`
    select
      s.id as season_id,
      coalesce(
        -- นัดถัดไปที่ยังไม่คิกออฟ (เรียงตามเวลาจริง ไม่ใช่ตามเลขแมตช์เดย์)
        -- tie-break ด้วยเลขแมตช์เดย์ เผื่อสองนัดคนละแมตช์เดย์คิกออฟพร้อมกันเป๊ะ ๆ
        (
          select mnext.matchday
          from matches mnext
          where mnext.season_id = s.id
            and mnext.matchday is not null
            and mnext.kickoff_at > now()
          order by mnext.kickoff_at asc, mnext.matchday asc
          limit 1
        ),
        -- เตะครบทั้งฤดูกาลแล้ว — ค้างไว้ที่แมตช์เดย์สุดท้าย ไม่ใช่เด้งกลับไป 1
        (select max(mlast.matchday) from matches mlast where mlast.season_id = s.id),
        -- ยังไม่มีโปรแกรมแข่งในระบบเลย (ฤดูกาลใหม่ที่ยังไม่ sync)
        1
      )::int as md
    from seasons s
    where s.id = any(${unique}::uuid[])
  `;

  return new Map(rows.map((r) => [r.season_id, r.md]));
}

/** แมตช์เดย์ปัจจุบันของฤดูกาลเดียว — ค่าเริ่มต้น 1 เมื่อยังไม่มีข้อมูลอะไรเลย */
export async function getCurrentMatchday(
  seasonId: string,
  sql: postgres.Sql = sqlClient,
): Promise<number> {
  const map = await getCurrentMatchdays([seasonId], sql);
  return map.get(seasonId) ?? 1;
}

/**
 * เขียนค่าที่คำนวณได้กลับลง seasons.current_matchday
 *
 * หน้าเว็บทุกหน้าคำนวณสด ๆ อยู่แล้วจึงไม่ได้ต้องพึ่งคอลัมน์นี้ แต่ยังเก็บให้ตรงกันไว้เพราะ
 * มันเป็นคอลัมน์ที่คนเปิดฐานข้อมูลดูแล้วเชื่อ ถ้าปล่อยให้ค้างค่าเก่าจาก API ไว้จะกลายเป็นกับดัก
 * สำหรับคนที่มาเขียนโค้ดต่อ (รวมถึงเราเองในอีกสามเดือน)
 */
export async function syncCurrentMatchdayColumn(
  seasonIds: string[],
  sql: postgres.Sql = sqlClient,
): Promise<Map<string, number>> {
  const map = await getCurrentMatchdays(seasonIds, sql);
  for (const [seasonId, md] of map) {
    await sql`update seasons set current_matchday = ${md} where id = ${seasonId}::uuid`;
  }
  return map;
}
