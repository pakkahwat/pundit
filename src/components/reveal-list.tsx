'use client';

import { useEffect, useRef, useState } from 'react';

// ปุ่ม "กางทั้งหมด / หุบทั้งหมด" ของหน้าคำทายทุกคน
//
// การ์ดแต่ละใบเป็น <details> ที่เรนเดอร์จากฝั่งเซิร์ฟเวอร์ทั้งหมด ตัวนี้เป็น client component
// บาง ๆ ที่รับการ์ดเหล่านั้นมาเป็น children แล้วสั่งเปิด/ปิดผ่าน DOM โดยตรง — ทำแบบนี้เพื่อให้
// เนื้อหาจริง (ชื่อคน คำทาย ผล) ยังเป็น server component เหมือนเดิม ไม่ต้องส่งข้อมูลทั้งหน้า
// ไปฝั่ง browser เพียงเพื่อจะมีปุ่มกางหุบปุ่มเดียว
//
// แตะ open ตรง ๆ ได้เพราะ <details> เป็น uncontrolled อยู่แล้วโดยธรรมชาติ (ผู้ใช้กดเองก็เปลี่ยน
// ค่านี้) React ไม่ได้ถือ state ของมันไว้ จึงไม่มีอะไรหลุด sync
export function RevealList({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLUListElement>(null);
  const [allOpen, setAllOpen] = useState(false);

  const items = () => Array.from(ref.current?.querySelectorAll('details') ?? []);

  // ป้ายปุ่มต้องตรงกับของจริงเสมอ แม้ผู้ใช้จะกางหุบทีละใบเอง — event 'toggle' ไม่ bubble
  // จึงต้องดักที่ capture phase (พารามิเตอร์ตัวที่สาม = true) ไม่งั้นจะไม่ได้ยินอะไรเลย
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const sync = () => {
      const all = Array.from(el.querySelectorAll('details'));
      setAllOpen(all.length > 0 && all.every((d) => d.open));
    };
    sync();
    el.addEventListener('toggle', sync, true);
    return () => el.removeEventListener('toggle', sync, true);
  }, []);

  function toggleAll() {
    const all = items();
    // ถ้ายังมีใบที่หุบอยู่ = กางให้หมด ไม่งั้นหุบให้หมด — ตัดสินจากสภาพจริงตอนกด
    const next = all.some((d) => !d.open);
    for (const d of all) d.open = next;
    setAllOpen(next);
  }

  return (
    <>
      <div className="mb-3 flex justify-end">
        <button
          type="button"
          onClick={toggleAll}
          className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:border-accent hover:bg-accent-soft hover:text-accent-soft-fg"
        >
          {allOpen ? 'หุบทั้งหมด' : 'กางทั้งหมด'}
        </button>
      </div>
      <ul ref={ref} className="flex flex-col gap-3">
        {children}
      </ul>
    </>
  );
}
