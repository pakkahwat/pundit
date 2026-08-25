'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

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

  return (
    <Link
      href={href}
      aria-current={isActive ? 'page' : undefined}
      className={`relative rounded-lg px-2.5 py-1.5 text-sm font-medium transition-colors ${
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
