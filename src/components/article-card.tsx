"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

const MATCH_BANNER_IMAGES = [
  "https://images.unsplash.com/photo-1579952363873-27f3bade9f55?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1518091043644-c1d4457512c6?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1552318965-6e6be7484ad6?auto=format&fit=crop&w=1200&q=80",
];

const PLAYER_FOCUS_IMAGES = [
  "https://images.unsplash.com/photo-1560272564-c83b66b1ad12?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1579952363873-27f3bade9f55?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1518091043644-c1d4457512c6?auto=format&fit=crop&w=1200&q=80",
];

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
        <CoverArt title={title} urls={coverImageUrls} />
        <div className="p-5">
          <p className="text-xs text-muted">{dateLabel}</p>
          <p className="mt-1 font-display text-lg font-semibold text-foreground">
            {title}
          </p>
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
          <CoverArt title={title} urls={coverImageUrls} />
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

// เลือกภาพตามมุมข่าว: ข่าวเกมใช้ภาพกว้าง ส่วนข่าวตัวบุคคลใช้ภาพที่โฟกัสนักเตะมากกว่า
function CoverArt({ title, urls }: { title: string; urls: string[] }) {
  const normalizedTitle = title.toLowerCase();
  const playerStory = /ย้าย|บาดเจ็บ|เจ็บ|ความพร้อม|transfer|injury|squad/.test(
    normalizedTitle,
  );
  const fallbackPool = playerStory ? PLAYER_FOCUS_IMAGES : MATCH_BANNER_IMAGES;
  const imageIndex =
    [...title].reduce((sum, character) => sum + character.charCodeAt(0), 0) %
    fallbackPool.length;
  const articleImage = urls.find((url) => !isTeamCrestUrl(url));
  const imageUrl = articleImage ?? fallbackPool[imageIndex];
  const [imageSource, setImageSource] = useState(imageUrl);

  useEffect(() => {
    setImageSource(imageUrl);
  }, [imageUrl]);

  return (
    <div className="relative aspect-[16/9] w-full overflow-hidden bg-slate-950 sm:aspect-[2.4/1]">
      <img
        src={imageSource}
        alt=""
        className={`absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03] ${playerStory ? "object-center" : "object-[center_35%]"}`}
        loading="lazy"
        onError={() => setImageSource(fallbackPool[0])}
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent" />
    </div>
  );
}

function isTeamCrestUrl(url: string): boolean {
  return /\.svg(?:$|[?#])|crest|logo|badge|team[-_]?image|football-data\.org/i.test(
    url,
  );
}
