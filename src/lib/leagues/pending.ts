import { and, eq, gt, inArray, sql } from 'drizzle-orm';

import { db } from '@/db/client';
import { withUserContext } from '@/db/rls';
import { matches, predictions } from '@/db/schema';

// นับนัดใน "แมตช์เดย์ปัจจุบัน" ที่ยังเปิดรับทายอยู่ และผู้ใช้คนนี้ยังไม่ได้ทาย
//
// แยกออกมาเป็นฟังก์ชันกลางเพราะทุกหน้าในลีก (ภาพรวม/ทายผล/อันดับ/คำทายทุกคน) ต้องใช้ตัวเลขนี้
// ไปแปะบนแท็บ "ทายผล" ถ้าปล่อยให้แต่ละหน้าคำนวณเอง สูตรจะค่อย ๆ เพี้ยนจากกันเมื่อแก้ทีหลัง
//
// เทียบเวลาด้วย now() ของ Postgres ไม่ใช่นาฬิกาของ Node — ให้ตรงกับตัวที่บังคับเวลาปิดรับ
// ตอนบันทึกคำทายจริง (guarded-upsert.ts) ไม่งั้นตัวเลขบนแท็บอาจไม่ตรงกับสิ่งที่ทายได้จริง
export async function pendingPredictionCount(
  seasonId: string,
  matchday: number,
  userId: string,
): Promise<number> {
  const openMatches = await db
    .select({ id: matches.id })
    .from(matches)
    .where(
      and(
        eq(matches.seasonId, seasonId),
        eq(matches.matchday, matchday),
        gt(matches.kickoffAt, sql`now()`),
      ),
    );

  if (openMatches.length === 0) return 0;

  const ids = openMatches.map((m) => m.id);
  // ต้องผ่าน withUserContext เพราะ RLS บน predictions — ไม่งั้นอ่านคำทายของตัวเองไม่เห็น
  const mine = await withUserContext(userId, (tx) =>
    tx
      .select({ matchId: predictions.matchId })
      .from(predictions)
      .where(and(eq(predictions.userId, userId), inArray(predictions.matchId, ids))),
  );

  return openMatches.length - mine.length;
}
