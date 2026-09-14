// ── วงจรตัดต่อ agent (circuit breaker) ───────────────────────────────────────────
//
// บทเรียนจริง (ก.ย. 2026): Mistral ถอด mistral-small ออกจากแผนฟรี (429 พร้อม
// x-ratelimit-limit-req-minute: 0 = ไม่มีสิทธิ์ตั้งแต่แรก ไม่ใช่โควตาเต็มชั่วคราว) แต่งาน
// ai-predictions ยังสั่งให้ตัวนั้นทายทุกนัดที่ค้างอยู่ ทุก 15 นาที ต่อเนื่อง 10 วัน = พัง 3,700+
// ครั้ง โดยแต่ละครั้งกิน retry 3 รอบ + เวลาราว 10 วิจากงบ 55 วิของรอบนั้น ซึ่งเป็นงบที่ agent
// ตัวอื่นต้องใช้ทายก่อนคิกออฟ (ก่อนหน้านี้ stealth/ox-alpha ก็พังแบบเดียวกัน 1,369 ครั้ง/สัปดาห์)
//
// กติกา: ถ้าครั้งหลังสุด CONSECUTIVE_FAILURES_TO_TRIP ครั้งติดของ agent พังหมด "และกระจายอยู่
// มากกว่าหนึ่งนัด" ถือว่าวงจรตัด — รอบนั้นให้ยิงหยั่งเชิงแค่ 1 นัด (retry น้อยสุด) ถ้าสำเร็จก็กลับมา
// ทายเต็มรูปแบบต่อทันทีในรอบเดียวกัน ถ้ายังพังก็ข้ามนัดที่เหลือของตัวนั้นไป ไม่บันทึก log เพิ่ม
// ไม่กินงบเวลา
//
// ทำไมต้อง "มากกว่าหนึ่งนัด": พังซ้ำอยู่นัดเดียวคือปัญหาเฉพาะคู่นั้น (เช่นโมเดลตอบผิดรูปกับข้อมูล
// ชุดนั้น) ไม่ใช่โมเดลล่ม — ถ้าตัดแล้วหยั่งเชิงไปโดนนัดเดิมทุกรอบ นัดอื่นที่คิกออฟพร้อมกันจะไม่ได้ทายเลย
//
// จงใจไม่ปิด agent ถาวรและไม่มี cooldown: free tier เจอ 429/503 ชั่วคราวเป็นเรื่องปกติ (Gemini
// ช่วงพีค) ถ้าบล็อกยาวแล้วมันหายเองพอดีตอนใกล้คิกออฟ จะเสียแมตช์เดย์นั้นถาวร (guarded upsert
// ไม่ให้ทายย้อน) ราคาของการหยั่งเชิงคือ 1-2 request ต่อรอบ cron ซึ่งถูกกว่าเดิมหลายสิบเท่า
// และกู้ตัวเองได้

export const CONSECUTIVE_FAILURES_TO_TRIP = 5;

export type AttemptRecord = { succeeded: boolean; matchId: string };

/**
 * ตัดสินจากผลของครั้งหลังสุด เรียงจาก "ใหม่สุด" ไป "เก่าสุด"
 * ตัดเมื่อมีประวัติครบจำนวน ทุกครั้งพัง และพังกระจายมากกว่าหนึ่งนัด — ประวัติน้อยกว่านั้น
 * (agent ใหม่) ไม่ตัด
 */
export function isCircuitTripped(
  recentNewestFirst: readonly AttemptRecord[],
  threshold = CONSECUTIVE_FAILURES_TO_TRIP,
): boolean {
  if (threshold <= 0 || recentNewestFirst.length < threshold) return false;
  const window = recentNewestFirst.slice(0, threshold);
  if (window.some((a) => a.succeeded)) return false;
  return new Set(window.map((a) => a.matchId)).size > 1;
}
