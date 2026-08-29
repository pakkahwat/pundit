"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { TeamCrest } from "./team-crest";
import { Badge, Card } from "./ui";
import type { TodayMatch } from "@/lib/matches/today";

// นัดหนึ่งใช้เวลาจริงราว 105 นาที (45+45 พักครึ่ง 15) บวกทดเจ็บอีกหน่อย เผื่อไว้ 150 นาที
// เลยจุดนี้ถือว่าจบไปแล้วแน่ ๆ แม้ cron จะยังไม่ได้อัปเดต status มาเป็น FINISHED
const MATCH_WINDOW_MIN = 150;

type Phase = "upcoming" | "live" | "awaiting" | "finished";

function phaseOf(m: TodayMatch, secondsSince: number): Phase {
  if (m.status === "FINISHED" && m.homeScore != null) return "finished";
  if (secondsSince < 0) return "upcoming";
  // m.live = SportMonks ยืนยันมาว่านัดนี้อยู่ใน inplay จริง เชื่อได้มากกว่าการเดาจากหน้าต่างเวลา
  if (m.live) return "live";
  if (secondsSince < MATCH_WINDOW_MIN * 60) return "live";
  return "awaiting";
}

function formatCountdown(secondsUntil: number): string {
  const mins = Math.ceil(secondsUntil / 60);
  if (mins < 60) return `อีก ${mins} นาที`;
  const hours = Math.floor(mins / 60);
  const rem = mins % 60;
  return rem === 0 ? `อีก ${hours} ชม.` : `อีก ${hours} ชม. ${rem} นาที`;
}

function formatKickoffTime(iso: string): string {
  return new Intl.DateTimeFormat("th-TH", {
    timeZone: "Asia/Bangkok",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function LiveMatches({ matches }: { matches: TodayMatch[] }) {
  // เริ่มจากค่าที่ server คำนวณมา (จาก now() ของ Postgres) แล้วค่อยให้ browser เดินต่อเอง
  //
  // ทำแบบนี้เพราะถ้าให้ client คำนวณเวลาเองตั้งแต่ render แรก ผลจะไม่ตรงกับที่ server เรนเดอร์มา
  // (นาฬิกาคนละเครื่องไม่ตรงกันเป๊ะ) แล้ว React จะฟ้อง hydration mismatch — เริ่มจากค่า server
  // เหมือนกันทั้งสองฝั่งก่อน แล้วอัปเดตใน effect ซึ่งรันหลัง hydrate เสร็จแล้วเท่านั้น
  const [offsetSec, setOffsetSec] = useState(0);

  useEffect(() => {
    // เดินนาทีละครั้งพอ — ตัวเลขที่โชว์เป็นหน่วยนาที เดินถี่กว่านี้ก็ไม่มีอะไรเปลี่ยน
    const id = setInterval(() => setOffsetSec((s) => s + 60), 60_000);
    return () => clearInterval(id);
  }, []);

  if (matches.length === 0) return null;

  // สกอร์ที่เชื่อได้มีสองกรณีเท่านั้น: จบแล้ว (cron ดึงผลมาแล้ว) หรือมีสกอร์สดจาก SportMonks
  // ระหว่างเตะที่ไม่มีสกอร์สด ตัวเลขใน DB ยังเป็นของก่อนเริ่มเกม โชว์ไปก็หลอกตาเปล่า ๆ
  const showScoreFor = (m: TodayMatch, phase: Phase) =>
    phase === "finished" || (phase === "live" && m.live);

  const liveCount = matches.filter((match) => {
    const secondsSince = match.secondsSinceKickoff + offsetSec;
    return phaseOf(match, secondsSince) === "live";
  }).length;
  const orderedMatches = [...matches].sort((a, b) => {
    const aLive = phaseOf(a, a.secondsSinceKickoff + offsetSec) === "live";
    const bLive = phaseOf(b, b.secondsSinceKickoff + offsetSec) === "live";
    return Number(bLive) - Number(aLive);
  });

  // มีนัดกำลังเตะอยู่ แต่ไม่มีสกอร์สดให้เลยสักนัด = ตกไป fallback ของ football-data.org
  // เฉพาะตอนนั้นถึงค่อยขึ้นคำอธิบาย ไม่งั้นจะไปเถียงกับสกอร์สดที่โชว์อยู่ข้าง ๆ เอง
  const needsDelayNotice = liveCount > 0 && !matches.some((m) => m.live);

  return (
    <>
      <div className="mb-3 flex items-center justify-between gap-3 text-sm text-muted">
        <span>{matches.length} คู่ในช่วงวันนี้</span>
        {liveCount > 0 && (
          <span className="font-medium text-accent">
            กำลังแข่ง {liveCount} คู่
          </span>
        )}
      </div>
      <ul
        className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
        aria-label="โปรแกรมบอลพรีเมียร์ลีกวันนี้"
      >
        {orderedMatches.map((m) => {
          const secondsSince = m.secondsSinceKickoff + offsetSec;
          const phase = phaseOf(m, secondsSince);
          const elapsedMin = Math.floor(secondsSince / 60);

          return (
            <li key={m.id}>
              <Card
                className={`flex h-full animate-fade-up flex-col gap-3 ${
                  phase === "live" ? "border-accent/50" : ""
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-muted">
                    {m.competitionCode === "PL"
                      ? "พรีเมียร์ลีก"
                      : m.competitionCode === "PD"
                        ? "ลาลีกา"
                        : m.competitionCode}
                    {m.matchday > 0 && ` · แมตช์เดย์ ${m.matchday}`}
                  </span>

                  {phase === "live" && (
                    <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-accent-soft px-2 py-0.5 text-xs font-medium text-accent-soft-fg">
                      <span className="animate-pulse-soft h-1.5 w-1.5 rounded-full bg-accent" />
                      กำลังแข่ง
                    </span>
                  )}
                  {phase === "finished" && (
                    <span className="shrink-0 text-xs text-muted">จบแล้ว</span>
                  )}
                  {phase === "awaiting" && (
                    <span className="shrink-0 text-xs text-muted">รอผล</span>
                  )}
                  {phase === "upcoming" && (
                    <span className="shrink-0 text-xs text-muted">
                      {formatKickoffTime(m.kickoffAt)}
                    </span>
                  )}
                </div>

                <div className="flex flex-col gap-2">
                  <TeamLine
                    name={m.homeTeam}
                    crest={m.homeCrest}
                    score={m.homeScore}
                    showScore={showScoreFor(m, phase)}
                    won={
                      phase === "finished" &&
                      (m.homeScore ?? 0) > (m.awayScore ?? 0)
                    }
                  />
                  <TeamLine
                    name={m.awayTeam}
                    crest={m.awayCrest}
                    score={m.awayScore}
                    showScore={showScoreFor(m, phase)}
                    won={
                      phase === "finished" &&
                      (m.awayScore ?? 0) > (m.homeScore ?? 0)
                    }
                  />
                </div>

                <div className="mt-auto flex items-center justify-between gap-2 border-t border-border pt-2.5">
                  <span className="text-xs text-muted">
                    {phase === "upcoming" && formatCountdown(-secondsSince)}
                    {/* จงใจเขียนว่า "เริ่มไปแล้ว X นาที" ไม่ใช่ "นาทีที่ X" เพราะนี่คือเวลาจริงที่
                      ผ่านไปตั้งแต่คิกออฟ ซึ่งรวมพักครึ่งกับเวลาทดเจ็บอยู่ด้วย ไม่ใช่นาทีในเกม */}
                    {phase === "live" && `เริ่มไปแล้ว ${elapsedMin} นาที`}
                    {phase === "awaiting" && "รอระบบดึงผล"}
                    {phase === "finished" && formatKickoffTime(m.kickoffAt)}
                  </span>

                  {m.predicted === false && phase === "upcoming" && (
                    <Badge tone="accent">ยังไม่ทาย</Badge>
                  )}
                  {m.predicted === true && (
                    <span className="text-xs text-muted">ทายแล้ว</span>
                  )}
                </div>
              </Card>
            </li>
          );
        })}
      </ul>
      {needsDelayNotice && <LiveNotice />}
    </>
  );
}

function TeamLine({
  name,
  crest,
  score,
  showScore,
  won,
}: {
  name: string;
  crest: string | null;
  score: number | null;
  showScore: boolean;
  won: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <TeamCrest src={crest} size={20} />
      <span
        className={`min-w-0 flex-1 truncate text-sm ${won ? "font-semibold text-foreground" : "text-foreground"}`}
      >
        {name}
      </span>
      {showScore && (
        <span className="shrink-0 text-sm font-semibold tabular-nums text-foreground">
          {score}
        </span>
      )}
    </div>
  );
}

// แถบอธิบายว่าทำไมนัดที่กำลังแข่งถึงไม่มีสกอร์ — พูดตรง ๆ ดีกว่าปล่อยให้ผู้ใช้เข้าใจว่าเว็บพัง
export function LiveNotice({ href = "/leagues" }: { href?: string }) {
  return (
    <p className="mt-3 text-xs text-muted">
      นัดที่กำลังแข่งยังไม่แสดงสกอร์ เพราะข้อมูลชุดที่เราใช้ให้สกอร์แบบหน่วงเวลา
      — ผลจะขึ้นให้เอง ภายในราวครึ่งชั่วโมงหลังจบเกม{" "}
      <Link href={href} className="text-accent hover:underline">
        ไปหน้าลีก →
      </Link>
    </p>
  );
}
