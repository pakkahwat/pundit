// instrumentation.ts เป็นไฟล์พิเศษของ Next.js — ฟังก์ชัน register() ถูกเรียกครั้งเดียวตอน
// server เริ่มทำงาน (ทั้ง dev และ production) ก่อนโค้ดอื่นทั้งหมด เหมาะกับการตั้งค่าระดับ runtime
// ที่ต้องมีผลก่อนใครจะเริ่มยิง request ออกไป
//
// Next.js เรียก register() ในทุก runtime รวมถึง Edge ซึ่งไม่มีโมดูลของ Node.js ให้ใช้ — โค้ดที่
// ผูกกับ Node จึงต้องแยกไว้อีกไฟล์แล้ว dynamic import เข้ามาหลังเช็ค NEXT_RUNTIME
// (รูปแบบนี้เป็นสิ่งที่เอกสาร Next.js กำหนดไว้ ไม่ใช่แค่ความชอบ — เขียน import โมดูล Node ไว้ใน
// ไฟล์นี้ตรง ๆ จะขึ้น warning ตอน build เพราะ bundler ฝั่ง Edge เห็นและพยายาม bundle ตามไปด้วย)
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./instrumentation-node');
  }
}
