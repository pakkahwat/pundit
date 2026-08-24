'use client';

import Image from 'next/image';
import { useEffect, useRef, useState, type ReactNode } from 'react';

// การ์ดบทความที่กดแล้วเปิดเป็น dialog ลอยขึ้นมาอ่านเต็ม
//
// ใช้ <dialog> ของ HTML มาตรฐาน + showModal() ไม่ได้ทำ overlay เองด้วย div เพราะ showModal()
// ให้ของที่ต้องเขียนเองเยอะมาแบบฟรี ๆ: กด ESC ปิดได้, โฟกัสถูกขังไว้ในกล่อง (กด Tab ไม่หลุดไป
// โดนลิงก์ข้างหลัง), ส่วนที่เหลือของหน้าถูกซ่อนจาก screen reader, และ ::backdrop เป็น element จริง
// ที่ทำ CSS ได้ — ทั้งหมดนี้คือเรื่อง accessibility ที่ทำเองมักพลาด
//
// เนื้อหาเต็มรับมาเป็น children ซึ่งถูกเรนเดอร์มาจาก Server Component แล้ว (ดู page.tsx) —
// เป็นรูปแบบที่ React รองรับตรง ๆ ทำให้ตัวแปลง markdown ยังทำงานฝั่ง server ไม่ต้องส่งไป client
export function ArticleCard({
  title,
  dateLabel,
  coverImageUrls,
  excerpt,
  children,
}: {
  title: string;
  dateLabel: string;
  coverImageUrls: string[];
  excerpt: string;
  children: ReactNode;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);

  // เรียก showModal()/close() ผ่าน effect แทนที่จะเรียกตอน onClick ตรง ๆ เพื่อให้ state ของ React
  // กับสถานะจริงของ <dialog> ตรงกันเสมอ (เช่นตอนผู้ใช้กด ESC ซึ่ง React ไม่รู้เรื่องด้วย)
  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group animate-fade-up w-full overflow-hidden rounded-xl border border-border bg-surface text-left transition-all duration-200 hover:-translate-y-0.5 hover:bg-surface-hover hover:shadow-lg"
      >
        <CoverArt urls={coverImageUrls} />
        <div className="p-5">
          <p className="text-xs text-muted">{dateLabel}</p>
          <p className="mt-1 font-display text-lg font-semibold text-foreground">{title}</p>
          <p className="mt-1 line-clamp-2 text-sm text-muted">{excerpt}</p>
        </div>
      </button>

      <dialog
        ref={dialogRef}
        onClose={() => setOpen(false)}
        // กดพื้นที่นอกกล่อง (backdrop) แล้วปิด — เช็คว่า target คือตัว dialog เอง ไม่ใช่ลูกข้างใน
        onClick={(e) => {
          if (e.target === dialogRef.current) setOpen(false);
        }}
        className="animate-pop-in m-auto w-[min(42rem,calc(100vw-2rem))] rounded-xl border border-border bg-surface p-0 text-foreground backdrop:bg-black/60 backdrop:backdrop-blur-sm"
      >
        <div className="max-h-[85vh] overflow-y-auto">
          <CoverArt urls={coverImageUrls} />
          <div className="p-6">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-xs text-muted">{dateLabel}</p>
                <h2 className="mt-1 font-display text-2xl font-semibold tracking-tight text-foreground">
                  {title}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="ปิด"
                className="shrink-0 rounded-lg border border-border px-3 py-1.5 text-sm text-muted transition-colors hover:bg-surface-hover hover:text-foreground"
              >
                ปิด
              </button>
            </div>
            {children}
          </div>
        </div>
      </dialog>
    </>
  );
}

// ภาพหน้าปก: โลโก้ทีมจริงจาก football-data.org วางซ้อนบนพื้นไล่สี — ไม่ได้ generate ภาพด้วย AI
// เพราะเปลืองโควตาและเสี่ยงได้ภาพที่ไม่ตรงกับเนื้อหา ส่วนโลโก้ทีมเป็นของจริงเสมอ
function CoverArt({ urls }: { urls: string[] }) {
  return (
    <div className="relative flex h-32 items-center justify-center gap-3 overflow-hidden bg-gradient-to-br from-accent/25 via-accent/10 to-transparent">
      {urls.length === 0 ? (
        <span className="font-display text-3xl font-semibold text-accent/40">Pundit</span>
      ) : (
        urls.slice(0, 3).map((url) => (
          <span
            key={url}
            className="flex h-16 w-16 items-center justify-center rounded-full bg-surface/80 p-2.5 shadow-sm ring-1 ring-border transition-transform duration-300 group-hover:scale-110"
          >
            <Image
              src={url}
              alt=""
              width={44}
              height={44}
              className="h-full w-full object-contain"
              unoptimized
            />
          </span>
        ))
      )}
    </div>
  );
}
