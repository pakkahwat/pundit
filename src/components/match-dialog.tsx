"use client";

import { useEffect, useRef } from "react";

import { TeamCrest } from "./team-crest";
import type { SportMonksLiveEvent } from "@/lib/football/sportmonks";
import type { TodayMatch } from "@/lib/matches/today";

// สกอร์บอร์ดเต็มของนัดเดียว — เปิดจากการกดการ์ดในหน้า /live
//
// หน้าตาอิงสกอร์บอร์ดของ SportMonks (โลโก้สองข้าง สกอร์ใหญ่กลาง คนยิงเรียงใต้ทีมตัวเอง)
// แต่ใช้ข้อมูลที่หน้า /live ถืออยู่แล้วทั้งหมด ไม่ยิง API เพิ่มแม้แต่ครั้งเดียว — เหตุการณ์มากับ
// payload สดตั้งแต่แรก ส่วน xG ที่เห็นในเดโมของเขาเป็น add-on ที่ต้องจ่ายเพิ่มต่างหาก จึงไม่มีที่นี่
//
// ใช้ <dialog> มาตรฐานเหมือน h2h-dialog — ได้ ESC ปิด, โฟกัสถูกขังในกล่อง และ ::backdrop ฟรี
export function MatchDialog({
  match,
  clockLabel,
  onClose,
}: {
  match: TodayMatch | null;
  clockLabel: string;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (match && !el.open) el.showModal();
    if (!match && el.open) el.close();
  }, [match]);

  const events = match?.events ?? [];
  const goals = events.filter((event) => event.kind !== "redcard");
  const reds = events.filter((event) => event.kind === "redcard");
  const showScore =
    match != null &&
    (match.live || (match.status === "FINISHED" && match.homeScore != null));

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onClick={(e) => {
        // กดฉากหลัง (ตัว dialog เอง ไม่ใช่ลูกข้างใน) = ปิด
        if (e.target === dialogRef.current) onClose();
      }}
      className="m-auto w-[min(92vw,34rem)] rounded-2xl border border-border bg-surface p-0 text-foreground backdrop:bg-black/60"
    >
      {match && (
        <div className="flex flex-col gap-5 p-6">
          <div className="flex items-center justify-between gap-2 text-xs text-muted">
            <span>
              พรีเมียร์ลีก
              {match.matchday > 0 && ` · แมตช์เดย์ ${match.matchday}`}
            </span>
            <button
              onClick={onClose}
              className="rounded-lg px-2 py-1 hover:bg-surface-hover hover:text-foreground"
              aria-label="ปิด"
            >
              ✕
            </button>
          </div>

          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
            <TeamColumn name={match.homeTeam} crest={match.homeCrest} />
            <div className="flex flex-col items-center gap-1">
              <span className="text-3xl font-bold tabular-nums">
                {showScore
                  ? `${match.homeScore ?? 0} - ${match.awayScore ?? 0}`
                  : "vs"}
              </span>
              <span
                className={`text-xs ${match.live ? "font-medium text-accent" : "text-muted"}`}
              >
                {clockLabel}
              </span>
            </div>
            <TeamColumn name={match.awayTeam} crest={match.awayCrest} />
          </div>

          {goals.length > 0 && (
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 border-t border-border pt-4 text-xs text-muted">
              <div className="flex flex-col items-end gap-1">
                {goals
                  .filter((event) => event.side === "home")
                  .map((event, index) => (
                    <ScorerLine key={index} event={event} align="right" />
                  ))}
              </div>
              <div className="flex flex-col items-start gap-1">
                {goals
                  .filter((event) => event.side === "away")
                  .map((event, index) => (
                    <ScorerLine key={index} event={event} align="left" />
                  ))}
              </div>
            </div>
          )}

          {reds.length > 0 && (
            <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-muted">
              {reds.map((event, index) => (
                <span key={index}>
                  🟥 {event.minute != null ? `${event.minute}' ` : ""}
                  {event.playerName ?? ""}
                </span>
              ))}
            </div>
          )}

          {match.live && goals.length === 0 && reds.length === 0 && (
            <p className="border-t border-border pt-4 text-center text-xs text-muted">
              ยังไม่มีประตูหรือใบแดงในเกมนี้
            </p>
          )}
        </div>
      )}
    </dialog>
  );
}

function TeamColumn({ name, crest }: { name: string; crest: string | null }) {
  return (
    <div className="flex min-w-0 flex-col items-center gap-2 text-center">
      <TeamCrest src={crest} size={48} />
      <span className="break-words text-sm font-medium">{name}</span>
    </div>
  );
}

function ScorerLine({
  event,
  align,
}: {
  event: SportMonksLiveEvent;
  align: "left" | "right";
}) {
  const minute =
    event.minute != null
      ? `${event.minute}${event.extraMinute ? `+${event.extraMinute}` : ""}'`
      : "";
  const suffix =
    event.kind === "owngoal"
      ? " (og)"
      : event.kind === "penalty"
        ? " (P)"
        : "";
  return (
    <span className="flex max-w-full items-center gap-1">
      {align === "right" ? (
        <>
          <span className="min-w-0 truncate">
            {event.playerName ?? "ไม่ระบุ"}
            {suffix}
          </span>
          <span className="shrink-0 tabular-nums text-accent">{minute}</span>
          <span aria-hidden>⚽</span>
        </>
      ) : (
        <>
          <span aria-hidden>⚽</span>
          <span className="shrink-0 tabular-nums text-accent">{minute}</span>
          <span className="min-w-0 truncate">
            {event.playerName ?? "ไม่ระบุ"}
            {suffix}
          </span>
        </>
      )}
    </span>
  );
}
