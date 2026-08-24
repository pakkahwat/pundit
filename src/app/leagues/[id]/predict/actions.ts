'use server';

import { auth } from '@/auth';
import { withUserContext } from '@/db/rls';
import { guardedUpsertPrediction } from '@/lib/predictions/guarded-upsert';
import { isPredictionOutcome } from '@/lib/predictions/outcome';

export type SubmitPredictionState = { error?: string; success?: boolean };

// เซ็นเนเจอร์ (matchId, prevState, formData) — matchId ถูก bind ไว้ล่วงหน้าจากฝั่ง client
// (ดู prediction-form.tsx) ก่อนส่งให้ useActionState ใช้งาน
export async function submitPrediction(
  matchId: string,
  _prevState: SubmitPredictionState,
  formData: FormData,
): Promise<SubmitPredictionState> {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: 'ต้องล็อกอินก่อน' };
  }

  const outcome = formData.get('outcome');
  if (!isPredictionOutcome(outcome)) {
    return { error: 'เลือกผลแพ้/ชนะ/เสมอก่อน' };
  }

  const userId = session.user.id;

  // เขียนคำทายผ่าน guardedUpsertPrediction เดียวกับที่ scripts/run-ai-predictions.ts ใช้ให้ AI
  // ทายผล — ดูเหตุผลใน src/lib/predictions/guarded-upsert.ts
  const rows = await withUserContext(userId, (tx) =>
    guardedUpsertPrediction(tx, userId, matchId, outcome),
  );

  if (rows.length === 0) {
    return { error: 'ปิดรับทายแล้ว (แมตช์นี้เริ่มแข่งไปแล้ว)' };
  }

  return { success: true };
}
