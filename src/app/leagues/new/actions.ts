'use server';

import { and, eq } from 'drizzle-orm';
import { redirect } from 'next/navigation';

import { auth } from '@/auth';
import { db } from '@/db/client';
import { aiAgents, leagueMembers, leagues, seasons } from '@/db/schema';

export type CreateLeagueState = { error?: string };

// เซ็นเนเจอร์ (prevState, formData) => Promise<State> เป็นแบบที่ useActionState ฝั่ง client ต้องการ
// เพื่อให้โชว์ error กลับไปที่ฟอร์มได้โดยไม่ต้องเด้งไปหน้า error.tsx เต็มหน้า
export async function createLeague(
  _prevState: CreateLeagueState,
  formData: FormData,
): Promise<CreateLeagueState> {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: 'ต้องล็อกอินก่อน' };
  }

  const name = String(formData.get('name') ?? '').trim();
  if (!name) {
    return { error: 'ใส่ชื่อลีกด้วย' };
  }

  const competitionCode = String(formData.get('competitionCode') ?? '').trim();
  if (!competitionCode) {
    return { error: 'เลือกลีกที่จะทายด้วย' };
  }

  // หา season จากรหัสลีกที่เลือก — เช็คกับ DB ไม่ใช่เชื่อค่าที่ส่งมาจากฟอร์ม เพราะ dropdown
  // ถูกแก้ค่าได้จาก devtools ถ้าไม่เจอก็แปลว่าส่งค่ามั่วมาหรือยังไม่ได้ sync ลีกนั้น
  const [season] = await db
    .select()
    .from(seasons)
    .where(and(eq(seasons.competitionCode, competitionCode), eq(seasons.isActive, true)))
    .limit(1);
  if (!season) {
    return { error: 'ยังไม่มีข้อมูลของลีกที่เลือก — รัน npm run db:sync-fixtures ก่อน' };
  }

  // invite_code ได้ค่ามาจาก default ของ Postgres เอง (gen_random_uuid() ที่ตั้งไว้ใน schema.sql)
  // ไม่ต้องสร้างใน JS
  const [league] = await db
    .insert(leagues)
    .values({ name, seasonId: season.id, createdBy: session.user.id })
    .returning();

  await db.insert(leagueMembers).values({
    leagueId: league.id,
    userId: session.user.id,
    role: 'owner',
  });

  // เพิ่ม AI agent ที่ active ทุกตัวเข้าลีกใหม่นี้อัตโนมัติ (ไม่ต้อง invite ผ่านลิงก์เหมือนมนุษย์
  // เพราะ AI ไม่มีทาง login ได้อยู่แล้ว) — ลีกที่สร้างไว้ก่อนหน้านี้ (ก่อนมี AI agent ในระบบ) ใช้
  // scripts/join-ai-agents-to-leagues.ts รันแยกเพื่อ backfill
  const activeAgents = await db
    .select({ userId: aiAgents.userId })
    .from(aiAgents)
    .where(eq(aiAgents.isActive, true));
  if (activeAgents.length > 0) {
    await db
      .insert(leagueMembers)
      .values(
        activeAgents.map((a) => ({ leagueId: league.id, userId: a.userId, role: 'member' as const })),
      )
      .onConflictDoNothing({ target: [leagueMembers.leagueId, leagueMembers.userId] });
  }

  redirect(`/leagues/${league.id}`);
}
