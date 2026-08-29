"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

import {
  classifyArticleTopic,
  fallbackCoverImages,
  isPexelsImageUrl,
  isTeamCrestUrl,
  parseVsBannerUrl,
} from "@/lib/ai/article-cover";



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
          <CoverArt title={title} urls={coverImageUrls} linkCredit />
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

// เลือกภาพตามหัวข้อของบทความ ใช้ตัวจำแนกตัวเดียวกับตอนสร้างบทความ (lib/ai/article-cover.ts)
// เพื่อไม่ให้เกณฑ์สองฝั่งหลุดจากกัน — ปกติ urls[0] จะเป็นรูปข่าวจริงที่หามาตามหัวข้อแล้ว
// ส่วนตรงนี้คือทางสำรองสำหรับบทความเก่าที่ cover ยังเป็นรูปกลาง ๆ อยู่
function CoverArt({
  title,
  urls,
  linkCredit = false,
}: {
  title: string;
  urls: string[];
  /** true เฉพาะตอนเรนเดอร์ใน dialog ซึ่งไม่ได้อยู่ใน <button> จึงใส่ <a> จริงได้ */
  linkCredit?: boolean;
}) {
  const topic = classifyArticleTopic(title);
  const playerStory = topic === "transfer" || topic === "injury";
  const fallbackPool = fallbackCoverImages(topic);
  const imageIndex =
    [...title].reduce((sum, character) => sum + character.charCodeAt(0), 0) %
    fallbackPool.length;
  // vs:// ต้องเช็คก่อนกรองโลโก้ — ข้างในมันคือ URL โลโก้ทีมที่เข้ารหัสไว้ ถ้าปล่อยผ่าน
  // isTeamCrestUrl มันจะโดนคัดทิ้งเองทั้งที่เป็น banner ที่ตั้งใจใส่มา
  const articleImage = urls.find(
    (url) => parseVsBannerUrl(url) !== null || !isTeamCrestUrl(url),
  );
  const imageUrl = articleImage ?? fallbackPool[imageIndex];
  const vsBanner = parseVsBannerUrl(imageUrl);

  // เก็บ "URL ไหนโหลดไม่ขึ้น" แทนการเก็บ "URL ที่กำลังใช้"
  //
  // เดิมเก็บ URL ปัจจุบันไว้ใน state แล้วใช้ effect คอย sync กลับเมื่อ prop เปลี่ยน ซึ่งเป็น
  // การก๊อป prop ลง state เปล่า ๆ — React เรนเดอร์รอบแรกด้วยค่าเก่าก่อนแล้วค่อยเรนเดอร์ซ้ำ
  // (eslint react-hooks/set-state-in-effect ก็ฟ้องด้วย) พอเก็บเป็น "ตัวที่พัง" แทน
  // ค่าที่ใช้จริงก็คำนวณสด ๆ ตอนเรนเดอร์ได้เลย ไม่ต้องมี effect และไม่มีเรนเดอร์ซ้ำ
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const imageSource = failedUrl === imageUrl ? fallbackPool[0] : imageUrl;

  // แบนเนอร์โลโก้ "เหย้า vs เยือน" — ใช้กับบทความแมตช์ที่หาทั้งภาพข่าวและภาพสนามไม่ได้
  // (ดูคำอธิบาย scheme vs:// ใน lib/ai/article-cover.ts) เรนเดอร์เป็น component ตรงนี้เลย
  // เพราะภาพจริงที่ฝังโลโก้ external ไว้ข้างในโหลดไม่ขึ้นเมื่ออยู่ใน <img>
  if (vsBanner) {
    return (
      <div className="relative aspect-[16/9] w-full overflow-hidden bg-slate-950 sm:aspect-[2.4/1]">
        <div className="absolute inset-0 flex items-center justify-center gap-5 bg-gradient-to-br from-emerald-950 via-slate-950 to-slate-900 sm:gap-8">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={vsBanner.homeCrest}
            alt=""
            className="h-14 w-14 object-contain drop-shadow-lg sm:h-20 sm:w-20"
            loading="lazy"
          />
          <span className="font-display text-lg font-bold tracking-widest text-white/50 sm:text-2xl">
            VS
          </span>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={vsBanner.awayCrest}
            alt=""
            className="h-14 w-14 object-contain drop-shadow-lg sm:h-20 sm:w-20"
            loading="lazy"
          />
        </div>
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
      </div>
    );
  }

  return (
    <div className="relative aspect-[16/9] w-full overflow-hidden bg-slate-950 sm:aspect-[2.4/1]">
      {/* ใช้ <img> ธรรมดาโดยตั้งใจ ไม่ใช่ next/image — รูปหน้าปกมาจาก CDN ของสำนักข่าวที่ไหนก็ได้
        ตาม RSS ที่ดึงมา ประกาศ remotePatterns ล่วงหน้าให้ครบไม่ได้ และถ้าเปิด ** ให้ทุกโฮสต์
        ก็เท่ากับยกเว็บเราให้เป็น image proxy ฟรีของอินเทอร์เน็ต (ดูคอมเมนต์ใน next.config.ts) */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={imageSource}
        alt=""
        className={`absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03] ${playerStory ? "object-center" : "object-[center_35%]"}`}
        loading="lazy"
        onError={() => setFailedUrl(imageUrl)}
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent" />

      {/* Pexels ขอให้เว็บที่ใช้ภาพของเขาแสดงลิงก์กลับไปหาต้นทางอย่างเห็นได้ชัด (ดู TOS ของเขา)
        แสดงเฉพาะตอนที่รูปมาจาก Pexels จริง — รูปจากข่าวหรือรูปสต็อกในโค้ดไม่ต้องมี

        บนการ์ดใช้เป็นข้อความเฉย ๆ เพราะการ์ดทั้งใบเป็น <button> อยู่แล้ว ซ้อน <a> ข้างในไม่ได้
        ตามสเปก HTML ส่วนใน dialog ที่เปิดอ่านเต็มไม่มีข้อจำกัดนั้น จึงใส่ลิงก์จริงให้ตรงนั้น */}
      {isPexelsImageUrl(imageSource) &&
        (linkCredit ? (
          <a
            href="https://www.pexels.com"
            target="_blank"
            rel="noopener noreferrer"
            className="absolute bottom-1.5 right-2 text-[10px] text-white/70 underline-offset-2 hover:text-white hover:underline"
          >
            ภาพจาก Pexels
          </a>
        ) : (
          <span className="absolute bottom-1.5 right-2 text-[10px] text-white/70">
            ภาพจาก Pexels
          </span>
        ))}
    </div>
  );
}
