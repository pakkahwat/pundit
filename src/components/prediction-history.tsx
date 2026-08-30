import { TeamCrest } from "./team-crest";
import { formatKickoff } from "@/lib/match-time";
import {
  outcomeLabel,
  type PredictionOutcome,
} from "@/lib/predictions/outcome";

// ชิ้นส่วนเดียวใช้สองหน้า (แท็บคำทายของฉันในลีก และหน้าโปรไฟล์รวมทุกลีก) — แยกไฟล์ออกมา
// เพื่อไม่ให้สองหน้าค่อย ๆ หน้าตาเพี้ยนจากกันเมื่อแก้ทีหลัง ไม่มี "use client" เพราะเป็นการแสดงผลล้วน

export type HistoryRow = {
  matchId: string;
  matchday: number;
  kickoffAt: Date | string;
  status: string;
  homeTeam: string;
  awayTeam: string;
  homeCrest: string | null;
  awayCrest: string | null;
  homeScore: number | null;
  awayScore: number | null;
  predicted: PredictionOutcome;
  pointsAwarded: number | null;
};

export function actualOutcomeOf(row: HistoryRow): PredictionOutcome | null {
  if (
    row.status !== "FINISHED" ||
    row.homeScore == null ||
    row.awayScore == null
  )
    return null;
  if (row.homeScore > row.awayScore) return "HOME";
  if (row.homeScore < row.awayScore) return "AWAY";
  return "DRAW";
}

export function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-border bg-surface p-5">
      <span className="text-xs text-muted">{label}</span>
      <span className="font-display text-lg font-semibold text-foreground">
        {value}
      </span>
    </div>
  );
}

export function PredictionRow({ row }: { row: HistoryRow }) {
  const actual = actualOutcomeOf(row);
  const correct = actual !== null && actual === row.predicted;
  const played = actual !== null;

  return (
    <div className="flex flex-col gap-2 p-4">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="flex min-w-0 items-center gap-1.5 text-sm text-foreground">
          <TeamCrest src={row.homeCrest} size={18} />
          <span className="max-w-40 truncate">{row.homeTeam}</span>
        </span>
        <span className="shrink-0 rounded bg-surface-hover px-1.5 py-0.5 text-xs tabular-nums text-foreground">
          {played ? `${row.homeScore}-${row.awayScore}` : "vs"}
        </span>
        <span className="flex min-w-0 items-center gap-1.5 text-sm text-foreground">
          <TeamCrest src={row.awayCrest} size={18} />
          <span className="max-w-40 truncate">{row.awayTeam}</span>
        </span>
        <span className="ml-auto shrink-0 text-xs text-muted">
          {played ? "จบแล้ว" : formatKickoff(new Date(row.kickoffAt))}
        </span>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-muted">
          ทายไว้:{" "}
          <span
            className={played && !correct ? "line-through" : "text-foreground"}
          >
            {outcomeLabel(row.predicted, row.homeTeam, row.awayTeam)}
          </span>
        </span>

        {!played ? (
          <span className="text-xs text-muted">รอเตะ</span>
        ) : row.pointsAwarded == null ? (
          <span className="text-xs text-muted">รอคิดคะแนน</span>
        ) : correct ? (
          <span className="rounded-full bg-success/15 px-2 py-0.5 text-xs font-medium text-success">
            ถูก +{row.pointsAwarded}
          </span>
        ) : (
          <span className="text-xs text-muted">ผิด</span>
        )}
      </div>
    </div>
  );
}
