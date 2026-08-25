'use server';

import { and, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';

import { auth } from '@/auth';
import { db } from '@/db/client';
import { leagueMembers, leagues } from '@/db/schema';
import { COLOR, isValidDiscordWebhook, postToDiscord } from '@/lib/notify/discord';

export type WebhookState = { ok?: string; error?: string };

// เจ้าของลีกเท่านั้นที่ตั้ง/ลบ webhook ได้ — เช็คสิทธิ์ที่ server ทุกครั้ง ไม่เชื่อว่า UI ซ่อนฟอร์มไว้
// เพราะ Server Action ถูกเรียกตรง ๆ ได้โดยไม่ต้องผ่านหน้าเว็บ
async function requireOwner(leagueId: string): Promise<string | null> {
  const session = await auth();
  if (!session?.user?.id) return null;

  const [row] = await db
    .select({ role: leagueMembers.role })
    .from(leagueMembers)
    .where(and(eq(leagueMembers.leagueId, leagueId), eq(leagueMembers.userId, session.user.id)))
    .limit(1);

  return row?.role === 'owner' ? session.user.id : null;
}

export async function saveDiscordWebhook(
  leagueId: string,
  _prev: WebhookState,
  formData: FormData,
): Promise<WebhookState> {
  if (!(await requireOwner(leagueId))) {
    return { error: 'เฉพาะเจ้าของลีกเท่านั้นที่ตั้งค่านี้ได้' };
  }

  const raw = String(formData.get('webhookUrl') ?? '').trim();

  // ช่องว่าง = ปิดการแจ้งเตือน
  if (raw === '') {
    await db.update(leagues).set({ discordWebhookUrl: null }).where(eq(leagues.id, leagueId));
    revalidatePath(`/leagues/${leagueId}`);
    return { ok: 'ปิดการแจ้งเตือนแล้ว' };
  }

  // ตรวจว่าเป็น webhook ของ Discord จริง — ไม่ใช่แค่กันพิมพ์ผิด แต่กันไม่ให้ใครสั่งให้ server
  // ของเรายิง request ไปที่อยู่ภายในเครือข่ายที่คนนอกยิงเองไม่ถึง
  if (!isValidDiscordWebhook(raw)) {
    return { error: 'ต้องเป็นลิงก์ webhook ของ Discord (ขึ้นต้นด้วย https://discord.com/api/webhooks/)' };
  }

  // ยิงข้อความทดสอบก่อนบันทึก — ถ้าลิงก์ผิดหรือถูกลบไปแล้วจะรู้ทันที ดีกว่ามารู้ตอนที่ควรได้รับ
  // การเตือนก่อนปิดรับแล้วไม่มีอะไรเข้ากลุ่ม
  try {
    await postToDiscord(raw, {
      embeds: [
        {
          title: '✅ เชื่อมต่อ Pundit สำเร็จ',
          description: 'ห้องนี้จะได้รับการเตือนก่อนปิดรับทาย คำทายทุกคนตอนคิกออฟ และสรุปแมตช์เดย์',
          color: COLOR.accent,
        },
      ],
    });
  } catch {
    return { error: 'ส่งข้อความทดสอบไม่สำเร็จ — ลองเช็คว่าลิงก์ยังใช้ได้อยู่ไหม' };
  }

  await db.update(leagues).set({ discordWebhookUrl: raw }).where(eq(leagues.id, leagueId));
  revalidatePath(`/leagues/${leagueId}`);
  return { ok: 'บันทึกแล้ว — ลองดูข้อความทดสอบในห้อง Discord ได้เลย' };
}
