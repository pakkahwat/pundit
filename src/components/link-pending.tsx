'use client';

import { useLinkStatus } from 'next/link';

import { BallSpinner } from './ball-spinner';

// ตัวหมุนที่โผล่บนลิงก์ที่ "กดไปแล้วแต่หน้ายังไม่เปลี่ยน"
//
// useLinkStatus ต้องอยู่ใน component ที่เป็นลูกของ <Link> เท่านั้น (ตามเอกสารของ Next) จึงต้อง
// แยกเป็นไฟล์เล็ก ๆ แบบนี้ แล้วให้ LinkButton เรนเดอร์มันไว้ข้างใน — ตัว LinkButton เองยังเป็น
// server component อยู่เหมือนเดิม ไม่ต้องส่ง JS ของทั้ง ui.tsx ไปฝั่ง browser
//
// ทับกลางปุ่มแบบเดียวกับ SubmitButton เพื่อไม่ให้ปุ่มขยับตอนกด
//
// ใช้ฉากบัง bg-surface/75 + เบลอบาง ๆ แทนที่จะทึบไปเลย เพราะตัวนี้ถูกใช้บนพื้นหลายแบบ:
// ปุ่มเขียวทึบ, แท็บที่เลือกอยู่ (เขียว), แท็บที่ไม่ได้เลือก (โปร่งใส), ลิงก์ในเมนู — ถ้าใช้สีทึบ
// สีเดียวจะมีบางที่ที่ดูเหมือนแปะสี่เหลี่ยมผิดสีทับ ส่วน rounded-[inherit] ทำให้มุมโค้งเท่าตัวแม่
// ไม่ว่าตัวแม่จะโค้งเท่าไหร่
export function LinkPending() {
  const { pending } = useLinkStatus();
  if (!pending) return null;

  return (
    <span className="absolute inset-0 flex items-center justify-center rounded-[inherit] bg-surface/80 backdrop-blur-[1.5px]">
      <BallSpinner />
    </span>
  );
}
