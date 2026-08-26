'use client';

import Image from 'next/image';
import { useState } from 'react';

// รูปโปรไฟล์ของผู้เล่น — ใช้รูปจากบัญชี Google ที่ Auth.js เก็บไว้ให้ตอนล็อกอิน (users.image)
//
// มีไว้เพราะพอเปิดให้ตั้งชื่อเองได้ ชื่อในลีกก็ไม่ได้บอกแล้วว่าใครเป็นใคร (เพื่อนตั้งชื่อมั่ว ๆ กันหมด)
// รูปหน้าคนเป็นสิ่งที่จำได้เร็วกว่าตัวหนังสือมาก และไม่ต้องเปิดเผยชื่อจริงให้ใครเห็น
//
// เป็น client component เพราะต้องดัก onError: ลิงก์รูปของ Google มีวันหมดอายุและเปลี่ยนได้เมื่อ
// ผู้ใช้เปลี่ยนรูป ถ้าโหลดไม่ขึ้นแล้วปล่อยไว้จะได้ไอคอนรูปแตกซึ่งดูแย่กว่าไม่มีรูปเสียอีก
// จึงตกกลับไปใช้วงกลมตัวอักษรแรกแทน — คนที่ไม่เคยตั้งรูปโปรไฟล์ก็ได้วงกลมนี้เหมือนกัน
//
// referrerPolicy="no-referrer" จำเป็นสำหรับรูปของ Google — ถ้าส่ง referrer ไปด้วยบางกรณี
// เซิร์ฟเวอร์ของ Google จะตอบ 403 กลับมาแทนรูป
export function PlayerAvatar({
  image,
  name,
  isAi = false,
  size = 28,
}: {
  image: string | null;
  name: string | null;
  isAi?: boolean;
  size?: number;
}) {
  const [broken, setBroken] = useState(false);
  const box = { width: size, height: size };

  if (image && !broken) {
    return (
      <Image
        src={image}
        alt=""
        width={size}
        height={size}
        unoptimized
        referrerPolicy="no-referrer"
        onError={() => setBroken(true)}
        className="shrink-0 rounded-full object-cover"
        style={box}
      />
    );
  }

  // ตัวอักษรแรกของชื่อ — ภาษาไทยใช้ได้เหมือนกัน และ AI ใช้สีเน้นให้แยกออกจากคนตั้งแต่แรกเห็น
  const letter = (name?.trim()?.[0] ?? '?').toUpperCase();
  return (
    <span
      aria-hidden
      style={{ ...box, fontSize: Math.round(size * 0.42) }}
      className={`flex shrink-0 items-center justify-center rounded-full font-semibold ${
        isAi ? 'bg-accent-soft text-accent-soft-fg' : 'bg-surface-hover text-muted'
      }`}
    >
      {letter}
    </span>
  );
}
