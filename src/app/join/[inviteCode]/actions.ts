'use server';

import { redirect } from 'next/navigation';

import { auth } from '@/auth';
import { db } from '@/db/client';
import { leagueMembers } from '@/db/schema';

export async function joinLeague(leagueId: string) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect('/');
  }

  // onConflictDoNothing ทำให้ join ซ้ำ (กดปุ่มซ้ำ, หรือเป็นสมาชิกอยู่แล้ว) เป็น no-op ปลอดภัย
  // ไม่ error ไม่สร้างแถวซ้ำ ตาม unique(league_id, user_id) ที่ตั้งไว้
  await db
    .insert(leagueMembers)
    .values({ leagueId, userId: session.user.id, role: 'member' })
    .onConflictDoNothing({ target: [leagueMembers.leagueId, leagueMembers.userId] });

  redirect(`/leagues/${leagueId}`);
}
