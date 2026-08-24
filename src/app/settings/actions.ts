'use server';

import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';

import { auth } from '@/auth';
import { db } from '@/db/client';
import { users } from '@/db/schema';

export type UpdateDisplayNameState = { error?: string; success?: boolean };

export async function updateDisplayName(
  _prevState: UpdateDisplayNameState,
  formData: FormData,
): Promise<UpdateDisplayNameState> {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: 'ต้องล็อกอินก่อน' };
  }

  const raw = String(formData.get('displayName') ?? '').trim();
  if (raw.length === 0) {
    // ล้างค่าทิ้ง = กลับไปใช้ชื่อจาก Google (coalesce ใน displayNameSql จะ fallback ให้เอง)
    await db.update(users).set({ displayName: null }).where(eq(users.id, session.user.id));
    revalidatePath('/', 'layout');
    return { success: true };
  }

  if (raw.length > 40) {
    return { error: 'ชื่อยาวเกินไป (ไม่เกิน 40 ตัวอักษร)' };
  }

  await db.update(users).set({ displayName: raw }).where(eq(users.id, session.user.id));

  // ชื่อโผล่แทบทุกหน้า (แถบหัวเว็บ ตารางคะแนน คำทายทุกคน) — ล้าง cache ทั้ง layout ทีเดียว
  // ไม่งั้นผู้ใช้จะเห็นชื่อเก่าค้างอยู่บางหน้าจนกว่าจะโหลดใหม่
  revalidatePath('/', 'layout');
  return { success: true };
}
