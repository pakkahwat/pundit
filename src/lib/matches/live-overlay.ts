import type { SportMonksLiveMatch } from "@/lib/football/sportmonks";
import { sameTeam } from "@/lib/football/team-name";

export { normalizeTeamName, sameTeam } from "@/lib/football/team-name";

// ── จับคู่แมตช์ข้าม provider แล้วทับเฉพาะสกอร์สด ────────────────────────────────
//
// แยกออกมาจาก today.ts เพราะไฟล์นั้น import @/db/client ซึ่ง throw ตอน import ถ้าไม่มี DATABASE_URL
// ตรรกะจับคู่ชื่อทีมเป็นส่วนที่พังเงียบที่สุดของฟีเจอร์นี้ (จับไม่ติด = สกอร์สดไม่ขึ้น โดยไม่มี error
// ให้เห็นเลย) จึงต้องเทสต์ได้โดยไม่ต้องมีฐานข้อมูล — ดู live-overlay.test.ts

const KICKOFF_TOLERANCE_MS = 30 * 60 * 1000;

export type MatchLike = {
  homeTeam: string;
  awayTeam: string;
  kickoffAt: string;
  status: string;
  homeScore: number | null;
  awayScore: number | null;
  live: boolean;
};

export function findLiveMatch(
  match: Pick<MatchLike, "homeTeam" | "awayTeam" | "kickoffAt">,
  live: SportMonksLiveMatch[],
): SportMonksLiveMatch | undefined {
  const kickoff = Date.parse(match.kickoffAt);
  return live.find((candidate) => {
    if (
      !sameTeam(candidate.homeTeam, match.homeTeam) ||
      !sameTeam(candidate.awayTeam, match.awayTeam)
    ) {
      return false;
    }
    // เช็คเวลาคิกออฟซ้ำอีกชั้น กันกรณีสองทีมนี้เจอกันสองนัดในช่วงใกล้กัน (นัดเลื่อน/รายการถ้วย)
    const candidateKickoff = Date.parse(candidate.kickoffAt);
    if (Number.isNaN(kickoff) || Number.isNaN(candidateKickoff)) return true;
    return Math.abs(kickoff - candidateKickoff) <= KICKOFF_TOLERANCE_MS;
  });
}

/**
 * ทับเฉพาะ "สกอร์กับสถานะ" ของนัดที่ SportMonks บอกว่ากำลังเตะอยู่ ฟิลด์ที่เหลือคงของเดิมทุกตัว
 *
 * generic ไว้เพื่อไม่ต้อง import type จาก today.ts (ซึ่งลาก db/client มาด้วย) และเพื่อให้ id,
 * matchday, predicted ฯลฯ ของผู้เรียกติดกลับไปครบโดยไม่ต้องรู้จักชนิดเหล่านั้นที่นี่
 */
export function overlayLiveScores<T extends MatchLike>(
  base: T[],
  live: SportMonksLiveMatch[],
): T[] {
  if (live.length === 0) return base;
  return base.map((match) => {
    const found = findLiveMatch(match, live);
    if (!found) return match;
    return {
      ...match,
      status: found.status,
      homeScore: found.homeScore,
      awayScore: found.awayScore,
      live: true,
    };
  });
}
