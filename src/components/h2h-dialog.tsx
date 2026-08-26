'use client';

import { useEffect, useRef, useState } from 'react';

import { PitchLoader } from '@/components/pitch-loader';
import { TeamCrest } from '@/components/team-crest';
import type { H2hResult } from '@/lib/football/h2h';

// ปุ่ม "สถิติเจอกัน" + dialog ที่โหลดข้อมูลตอนกดเปิดครั้งแรกเท่านั้น (lazy)
// ใช้ <dialog> มาตรฐานเหมือนการ์ดบทความ — ได้ ESC ปิด, โฟกัสถูกขังในกล่อง และ ::backdrop มาให้ฟรี
export function H2hDialog({
  matchExternalId,
  homeTeam,
  awayTeam,
}: {
  matchExternalId: number;
  homeTeam: string;
  awayTeam: string;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<H2hResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  // โหลดตอนกดเปิด ไม่ได้ทำใน useEffect — การ fetch ที่เกิดจากการกดปุ่มเป็น "ผลของ event"
  // ไม่ใช่ "การซิงค์กับ state ภายนอก" ซึ่งเป็นสิ่งที่ effect มีไว้ทำ (eslint rule
  // react-hooks/set-state-in-effect ก็เตือนเรื่องนี้) เขียนแบบนี้อ่านง่ายกว่าและไม่ต้องมีธง
  // cancelled คอยกันเซ็ต state ซ้อน
  // โหลดครั้งเดียวแล้วเก็บไว้ กดเปิดซ้ำไม่ยิง API ใหม่ (นอกจากรอบก่อนล้มเหลว)
  async function openDialog() {
    setOpen(true);
    if (data || loading) return;

    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/h2h/${matchExternalId}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData((await res.json()) as H2hResult);
    } catch {
      setError('ดึงสถิติไม่สำเร็จ ลองใหม่อีกครั้ง');
    } finally {
      setLoading(false);
    }
  }

  // นับ ชนะ/เสมอ/แพ้ เองจากรายการนัดที่ API ส่งมา ไม่ใช้ตัวเลขใน aggregates
  //
  // เหตุผล: แผนฟรีของ football-data.org ส่ง aggregates มาไม่ตรงกับรายการนัดจริง (เจอเคส
  // 10 นัดแต่รายงาน ชนะ 0 เสมอ 1 แพ้ 0) ส่วนรายการนัดพร้อมสกอร์นั้นถูกต้องเสมอ นับเองจึงตรงกว่า
  // และผู้ใช้ตรวจสอบได้ทันทีว่าตัวเลขข้างบนมาจากรายการข้างล่าง
  //
  // ต้องนับตาม id ของทีม ไม่ใช่ตามฝั่งเหย้า/เยือน เพราะแต่ละนัดในอดีตสลับกันเป็นเจ้าบ้าน
  const agg = data?.aggregates;
  const tally = (() => {
    if (!data || !agg) return null;
    const homeId = agg.homeTeam.id;
    let homeWins = 0;
    let draws = 0;
    let awayWins = 0;
    let goals = 0;

    for (const m of data.matches) {
      const h = m.score.fullTime.home;
      const a = m.score.fullTime.away;
      if (h == null || a == null) continue;
      goals += h + a;

      if (h === a) {
        draws++;
        continue;
      }
      // ทีมที่ชนะในนัดนั้นคือใคร แล้วเทียบว่าเป็นทีมไหนของคู่ที่เรากำลังดู
      const winnerId = h > a ? m.homeTeam.id : m.awayTeam.id;
      if (winnerId === homeId) homeWins++;
      else awayWins++;
    }

    return { homeWins, draws, awayWins, goals, played: data.matches.length };
  })();

  return (
    <>
      <button
        type="button"
        onClick={openDialog}
        className="rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:border-accent hover:bg-accent-soft hover:text-accent-soft-fg"
      >
        สถิติเจอกัน
      </button>

      <dialog
        ref={dialogRef}
        onClose={() => setOpen(false)}
        onClick={(e) => {
          if (e.target === dialogRef.current) setOpen(false);
        }}
        className="animate-pop-in m-auto w-[min(34rem,calc(100vw-1.5rem))] rounded-xl border border-border bg-surface p-0 text-foreground backdrop:bg-black/60 backdrop:backdrop-blur-sm"
      >
        <div className="max-h-[85vh] overflow-y-auto p-6">
          <div className="mb-4 flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-xs text-muted">สถิติการเจอกัน</p>
              <h2 className="mt-1 font-display text-xl font-semibold tracking-tight text-foreground">
                {homeTeam} พบ {awayTeam}
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

          {loading && (
            <div className="py-6">
              <PitchLoader label="กำลังดึงสถิติ..." />
            </div>
          )}
          {error && <p className="text-sm text-danger">{error}</p>}

          {tally && tally.played === 0 && (
            <p className="text-sm text-muted">ยังไม่เคยเจอกันในข้อมูลที่มี</p>
          )}

          {data && tally && tally.played > 0 && (
            <>
              <div className="mb-5 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg border border-border p-3">
                  <p className="text-2xl font-semibold tabular-nums text-foreground">
                    {tally.homeWins}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-muted">{homeTeam} ชนะ</p>
                </div>
                <div className="rounded-lg border border-border p-3">
                  <p className="text-2xl font-semibold tabular-nums text-foreground">
                    {tally.draws}
                  </p>
                  <p className="mt-0.5 text-xs text-muted">เสมอ</p>
                </div>
                <div className="rounded-lg border border-border p-3">
                  <p className="text-2xl font-semibold tabular-nums text-foreground">
                    {tally.awayWins}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-muted">{awayTeam} ชนะ</p>
                </div>
              </div>

              <p className="mb-2 text-xs text-muted">
                {tally.played} นัดหลังสุด · รวม {tally.goals} ประตู
              </p>

              <ul className="divide-y divide-border rounded-lg border border-border">
                {data.matches.map((m) => (
                  <li key={m.id} className="flex items-center justify-between gap-3 p-3 text-sm">
                    <span className="min-w-0">
                      <span className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
                        <span className="flex min-w-0 items-center gap-1.5">
                          <TeamCrest src={m.homeTeam.crest} size={16} />
                          <span>{m.homeTeam.shortName ?? m.homeTeam.name}</span>
                        </span>
                        <span className="shrink-0 rounded bg-surface-hover px-1.5 py-0.5 text-xs tabular-nums">
                          {m.score.fullTime.home}-{m.score.fullTime.away}
                        </span>
                        <span className="flex min-w-0 items-center gap-1.5">
                          <TeamCrest src={m.awayTeam.crest} size={16} />
                          <span>{m.awayTeam.shortName ?? m.awayTeam.name}</span>
                        </span>
                      </span>
                      <span className="mt-0.5 block text-xs text-muted">{m.competition.name}</span>
                    </span>
                    <span className="shrink-0 text-xs text-muted">
                      {new Intl.DateTimeFormat('th-TH', {
                        timeZone: 'Asia/Bangkok',
                        year: '2-digit',
                        month: 'short',
                        day: 'numeric',
                      }).format(new Date(m.utcDate))}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </dialog>
    </>
  );
}
