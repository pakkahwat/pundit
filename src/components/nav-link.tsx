'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';

import { LinkPending } from './link-pending';

// ลิงก์ในแถบหัวเว็บที่รู้ว่าตัวเองคือหน้าที่กำลังเปิดอยู่หรือเปล่า
//
// เป็น client component ตัวเดียวในแถบหัวเว็บ เพราะ usePathname() อ่านได้เฉพาะฝั่ง browser
// (server ไม่มี "หน้าที่กำลังเปิด" — มันเห็นแค่ request ทีละอัน) แลก JS ไม่กี่บรรทัดกับการที่
// ผู้ใช้รู้ตำแหน่งตัวเองตลอดเวลา ซึ่งคุ้มกว่ามาก
//
// เทียบแบบ startsWith เพื่อให้หน้าลูกยังนับเป็นหน้าเดียวกัน (เช่น /leagues/xxx/predict ก็ยัง
// ไฮไลต์ "ลีก") ยกเว้น '/' ที่ต้องเทียบแบบตรงตัว ไม่งั้นมันจะ active ตลอดทุกหน้า
export function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const isActive = href === '/' ? pathname === '/' : pathname.startsWith(href);
  const ref = useRef<HTMLAnchorElement>(null);

  // บนจอมือถือแถบเมนูเลื่อนแนวนอนได้ และเมนูยาวเกินจอ — ถ้าหน้าที่เปิดอยู่คือตัวท้าย ๆ
  // (เช่น "ตารางคะแนน") มันจะอยู่นอกจอตั้งแต่แรก คนใช้เห็นแต่ "หน้าแรก" แล้วไม่รู้ว่าตัวเอง
  // อยู่ตรงไหน เลยเลื่อนแถบให้ตัวที่ active มาอยู่กลางจอตั้งแต่โหลดเสร็จ
  //
  // block: 'nearest' สำคัญ — ถ้าไม่ใส่ เบราว์เซอร์จะเลื่อนหน้าทั้งหน้าในแนวตั้งตามไปด้วย
  // ส่วนตัวที่ซ่อนด้วย sm:hidden/hidden จะไม่มีผลอะไร เพราะ element ที่ display:none เลื่อนไม่ได้อยู่แล้ว
  useEffect(() => {
    if (!isActive) return;
    ref.current?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }, [isActive]);

  return (
    <Link
      ref={ref}
      href={href}
      aria-current={isActive ? 'page' : undefined}
      className={`relative whitespace-nowrap rounded-lg px-2.5 py-1.5 text-sm font-medium transition-colors ${
        isActive
          ? 'bg-accent-soft text-accent-soft-fg'
          : 'text-muted hover:bg-surface-hover hover:text-foreground'
      }`}
    >
      {children}
      <LinkPending />
    </Link>
  );
}
