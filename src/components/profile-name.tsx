"use client";

import { useEffect, useRef, useState } from "react";

import { PlayerAvatar } from "./player-avatar";
import type { ProfileBadge } from "@/lib/stats/profile";

// ── การ์ดโปรไฟล์ผู้ทาย: กดที่ชื่อแล้วเด้งขึ้นมา ─────────────────────────────────
//
// มาแทน tooltip เฉลยชื่อจริงแบบเดิม — tooltip ใช้บนมือถือไม่ได้เลย (ไม่มีเมาส์ให้ชี้)
// และจุได้แค่บรรทัดเดียว การ์ดนี้กดได้ทุกอุปกรณ์ โชว์ทั้งชื่อจริง สถิติ สตรีคสูงสุด
// และเหรียญตราที่เก็บถาวรบนโปรไฟล์ (ดู lib/stats/badges.ts)
//
// โหลดตอนกดเปิดครั้งแรกเท่านั้นแล้วจำไว้ (แนวเดียวกับ h2h-dialog) — หน้าลีกมีชื่อคนเป็นสิบ
// ถ้าดึงล่วงหน้าทุกคนคือ N queries ต่อการเปิดหน้าเดียว ทั้งที่ผู้ใช้กดดูจริงแค่บางคน

type ProfilePayload = {
  name: string | null;
  realName: string | null;
  image: string | null;
  isAi: boolean;
  agentKey: string | null;
  modelId: string | null;
  overall: {
    predicted: number;
    finished: number;
    correct: number;
    accuracy: number | null;
    bestStreak: number;
    recentForm: boolean[];
  };
  league: { scored: number; correct: number; points: number };
  badges: ProfileBadge[];
};

export function ProfileName({
  leagueId,
  userId,
  name,
  isAi = false,
  className = "",
}: {
  leagueId: string;
  userId: string;
  name: string;
  isAi?: boolean;
  className?: string;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<ProfilePayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  async function openCard() {
    setOpen(true);
    if (data || loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/profile/${leagueId}/${userId}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData((await res.json()) as ProfilePayload);
    } catch {
      setError("ดึงโปรไฟล์ไม่สำเร็จ ลองใหม่อีกครั้ง");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        onClick={openCard}
        className={`min-w-0 break-words text-left underline-offset-2 hover:text-foreground hover:underline ${className}`}
      >
        {name}
      </button>

      <dialog
        ref={dialogRef}
        onClose={() => setOpen(false)}
        onClick={(e) => {
          if (e.target === dialogRef.current) setOpen(false);
        }}
        className="m-auto w-[min(92vw,26rem)] rounded-2xl border border-border bg-surface p-0 text-foreground backdrop:bg-black/60"
      >
        <div className="flex flex-col gap-4 p-5">
          <div className="flex items-start justify-between gap-2">
            <div className="flex min-w-0 items-center gap-3">
              <PlayerAvatar
                image={data?.image ?? null}
                name={data?.name ?? name}
                isAi={data?.isAi ?? isAi}
                agentKey={data?.agentKey ?? null}
                size={44}
              />
              <div className="min-w-0">
                <p className="break-words font-display text-base font-semibold">
                  {data?.name ?? name}
                </p>
                {data?.realName && (
                  <p className="text-xs text-muted">{data.realName}</p>
                )}
                {data?.isAi && data.modelId && (
                  <p className="truncate text-xs text-muted">{data.modelId}</p>
                )}
              </div>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="rounded-lg px-2 py-1 text-muted hover:bg-surface-hover hover:text-foreground"
              aria-label="ปิด"
            >
              ✕
            </button>
          </div>

          {loading && <p className="text-sm text-muted">กำลังโหลด...</p>}
          {error && <p className="text-sm text-danger">{error}</p>}

          {data && (
            <>
              <div className="grid grid-cols-3 gap-2 text-center">
                <Stat
                  label="ความแม่น"
                  value={
                    data.overall.accuracy !== null
                      ? `${Math.round(data.overall.accuracy * 100)}%`
                      : "—"
                  }
                />
                <Stat
                  label="ทายถูก"
                  value={`${data.overall.correct}/${data.overall.finished}`}
                />
                <Stat
                  label="สตรีคสูงสุด"
                  value={
                    data.overall.bestStreak > 0
                      ? `${data.overall.bestStreak} นัด`
                      : "—"
                  }
                />
              </div>

              <div className="flex items-center justify-between gap-2 rounded-lg bg-surface-hover px-3 py-2 text-xs">
                <span className="text-muted">ในลีกนี้</span>
                <span className="text-foreground">
                  {data.league.correct}/{data.league.scored} นัด ·{" "}
                  {data.league.points} แต้ม
                </span>
              </div>

              {data.overall.recentForm.length > 0 && (
                <div className="flex items-center gap-2 text-xs text-muted">
                  <span>ฟอร์ม 5 นัดล่าสุด</span>
                  <span className="flex gap-1">
                    {data.overall.recentForm.map((correct, index) => (
                      <span
                        key={index}
                        className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold ${
                          correct
                            ? "bg-success/15 text-success"
                            : "bg-danger/15 text-danger"
                        }`}
                      >
                        {correct ? "✓" : "✗"}
                      </span>
                    ))}
                  </span>
                </div>
              )}

              <div>
                <p className="mb-2 text-xs font-medium text-muted">
                  เหรียญตรา ({data.badges.length})
                </p>
                {data.badges.length === 0 ? (
                  <p className="text-xs text-muted">
                    ยังไม่มีเหรียญ — ทายให้ถูกเข้าไว้
                  </p>
                ) : (
                  <ul className="flex flex-wrap gap-2">
                    {data.badges.map((badge) => (
                      <li
                        key={badge.key}
                        title={badge.description}
                        className="flex cursor-help items-center gap-1.5 rounded-full border border-border bg-surface-hover px-2.5 py-1 text-xs"
                      >
                        <BadgeIcon badgeKey={badge.key} emoji={badge.emoji} />
                        {badge.label}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}
        </div>
      </dialog>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border px-2 py-2.5">
      <p className="font-display text-base font-semibold">{value}</p>
      <p className="mt-0.5 text-[11px] text-muted">{label}</p>
    </div>
  );
}

// เหรียญวาดด้วย CSS: วงกลมไล่เฉดน้ำเงินเข้ม ขอบทอง emoji ตรงกลาง — ดูเป็น "เหรียญ" จริง
// โดยไม่ต้องมีไฟล์รูปเลยสักใบ (ทาง Gemini image generation ต้องเปิด billing — 429 บน free tier)
//
// ถ้าวันหน้ามีรูปจริงใน public/badges/<key>.png (จาก npm run generate-badge-images หลังเปิด
// billing) รูปจะทับเหรียญ CSS เองอัตโนมัติ — ลองโหลดก่อน พังค่อยโชว์เหรียญวาด
function BadgeIcon({ badgeKey, emoji }: { badgeKey: string; emoji: string }) {
  const [hasImage, setHasImage] = useState(true);
  return (
    <span
      aria-hidden
      className="relative inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-slate-700 via-slate-900 to-slate-950 text-[13px] leading-none shadow-sm ring-2 ring-amber-500/70"
    >
      {emoji}
      {hasImage && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/badges/${badgeKey}.png`}
          alt=""
          className="absolute inset-0 h-full w-full rounded-full object-cover"
          onError={() => setHasImage(false)}
        />
      )}
    </span>
  );
}
