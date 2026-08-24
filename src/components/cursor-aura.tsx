'use client';

import { useEffect, useRef } from 'react';

// แสงเรืองตามเมาส์บนพื้นหลัง
//
// จงใจไม่เก็บตำแหน่งเมาส์ไว้ใน useState — mousemove ยิงถี่มาก (นับร้อยครั้งต่อวินาที) ถ้าเซ็ต state
// ทุกครั้งจะบังคับให้ React เรนเดอร์ใหม่ทั้ง component tree ตามไปด้วย เครื่องช้าจะกระตุกทันที
// วิธีนี้เขียนลง CSS variable ของ element ตรง ๆ ผ่าน ref ซึ่งไม่ผ่านวงจรเรนเดอร์ของ React เลย
//
// requestAnimationFrame อีกชั้นคุมให้เขียนอย่างมากเฟรมละครั้ง ไม่ใช่ทุก event ที่เข้ามา
export function CursorAura() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // อุปกรณ์สัมผัส (มือถือ/แท็บเล็ต) ไม่มีเคอร์เซอร์ให้ตาม — ไม่ต้องผูก listener ให้เปลืองแบต
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    // เคารพการตั้งค่าลดการเคลื่อนไหวของผู้ใช้ เหมือนที่ทำกับ animation อื่น ๆ ในแอป
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    let frame = 0;
    let x = 0;
    let y = 0;

    const onMove = (e: MouseEvent) => {
      x = e.clientX;
      y = e.clientY;
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const el = ref.current;
        if (!el) return;
        el.style.setProperty('--aura-x', `${x}px`);
        el.style.setProperty('--aura-y', `${y}px`);
        el.style.opacity = '1';
      });
    };

    // เมาส์ออกนอกหน้าต่างแล้วให้แสงจางหาย ไม่ค้างเป็นดวงนิ่ง ๆ ที่ขอบจอ
    const onLeave = () => {
      const el = ref.current;
      if (el) el.style.opacity = '0';
    };

    window.addEventListener('mousemove', onMove, { passive: true });
    document.addEventListener('mouseleave', onLeave);
    return () => {
      window.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseleave', onLeave);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div
      ref={ref}
      aria-hidden
      style={{ opacity: 0 }}
      className="pointer-events-none fixed inset-0 -z-10 transition-opacity duration-500 bg-[radial-gradient(18rem_18rem_at_var(--aura-x,50%)_var(--aura-y,50%),var(--color-accent-soft),transparent_70%)]"
    />
  );
}
