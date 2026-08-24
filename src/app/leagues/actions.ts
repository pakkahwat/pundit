'use server';

import { eq } from 'drizzle-orm';
import { redirect } from 'next/navigation';

import { auth } from '@/auth';
import { db } from '@/db/client';
import { leagueMembers, leagues } from '@/db/schema';

// เข้าร่วมลีกด้วยคลิกเดียวจากหน้ารวมลีก ไม่ต้องมีลิงก์เชิญ
// onConflictDoNothing ทำให้กดซ้ำหรือกดพร้อมกันสองแท็บก็ไม่พัง (unique (league_id, user_id))
export async function joinLeagueById(leagueId: string) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect('/');
  }

  const [league] = await db.select().from(leagues).where(eq(leagues.id, leagueId)).limit(1);
  if (!league) {
    redirect('/leagues');
  }

  await db
    .insert(leagueMembers)
    .values({ leagueId, userId: session.user.id, role: 'member' })
    .onConflictDoNothing({ target: [leagueMembers.leagueId, leagueMembers.userId] });

  // พาไปหน้าทายผลเลย ไม่ต้องแวะหน้าลีกก่อน — จุดประสงค์ของหน้านี้คือให้เริ่มทายได้เร็วที่สุด
  redirect(`/leagues/${leagueId}/predict`);
}
