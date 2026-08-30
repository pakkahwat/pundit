// ── สตรีคและเหรียญตรา: ส่วนตรรกะล้วน ────────────────────────────────────────────
//
// ไฟล์นี้ห้าม import อะไรที่แตะฐานข้อมูล — เกณฑ์การได้เหรียญคือกติกาของเกมที่ต้องเทสต์ได้
// โดยไม่ต้องมี DB (ดู badges.test.ts) ส่วนการดึงข้อมูลจริงและบันทึกเหรียญอยู่ใน profile.ts
//
// หลักการเก็บ: เหรียญเป็นของ "โปรไฟล์" ไม่ใช่ของลีก — คิดจากประวัติทายทั้งหมดของคนนั้น
// ข้ามทุกลีก และเมื่อได้แล้วได้เลย (บันทึกลง user_badges พร้อมวันที่) ต่อให้ฟอร์มตกทีหลัง
// เหรียญไม่หาย เหมือนถ้วยรางวัลบนหิ้ง ไม่ใช่ป้ายสถานะ

export type BadgeKey =
  | "streak-3"
  | "streak-5"
  | "streak-10"
  | "sharpshooter"
  | "deadeye"
  | "perfect-matchday"
  | "double-perfect"
  | "contrarian"
  | "ai-slayer"
  | "early-bird"
  | "first-blood"
  | "half-century"
  | "century"
  | "draw-whisperer"
  | "away-day"
  | "fortress"
  | "comeback"
  | "clutch"
  | "night-owl"
  | "regular"
  | "all-rounder";

export const BADGES: Record<
  BadgeKey,
  { label: string; description: string; emoji: string }
> = {
  "first-blood": {
    label: "ประเดิมสนาม",
    description: "คำทายนัดแรกออกผลแล้ว",
    emoji: "⚽",
  },
  "streak-3": {
    label: "ร้อนแรง",
    description: "ทายถูก 3 นัดติดต่อกัน",
    emoji: "🔥",
  },
  "streak-5": {
    label: "มือขึ้น",
    description: "ทายถูก 5 นัดติดต่อกัน",
    emoji: "⚡",
  },
  "streak-10": {
    label: "ตาทิพย์",
    description: "ทายถูก 10 นัดติดต่อกัน",
    emoji: "🔮",
  },
  sharpshooter: {
    label: "จอมแม่น",
    description: "ความแม่นตั้งแต่ 60% ขึ้นไป (อย่างน้อย 10 นัดที่จบแล้ว)",
    emoji: "🎯",
  },
  deadeye: {
    label: "แม่นเกินมนุษย์",
    description: "ความแม่นตั้งแต่ 70% ขึ้นไป (อย่างน้อย 20 นัดที่จบแล้ว)",
    emoji: "🦅",
  },
  "perfect-matchday": {
    label: "แมตช์เดย์เพอร์เฟกต์",
    description: "ทายถูกครบทุกนัดในแมตช์เดย์เดียว (อย่างน้อย 3 นัด)",
    emoji: "💯",
  },
  "double-perfect": {
    label: "เพอร์เฟกต์ซ้ำสอง",
    description: "ทำแมตช์เดย์เพอร์เฟกต์ได้อย่างน้อย 2 ครั้ง",
    emoji: "👑",
  },
  contrarian: {
    label: "สวนมติ",
    description: "ทายต่างจากเสียงข้างมากแล้วถูก อย่างน้อย 3 ครั้ง",
    emoji: "🐺",
  },
  "ai-slayer": {
    label: "ผู้ปราบ AI",
    description: "ความแม่นสูงกว่า AI ที่เก่งที่สุด (อย่างน้อย 10 นัดทั้งคู่)",
    emoji: "🤖",
  },
  "early-bird": {
    label: "นกตื่นเช้า",
    description: "ครึ่งหนึ่งของคำทายส่งล่วงหน้าเกิน 24 ชั่วโมง (อย่างน้อย 10 นัด)",
    emoji: "🐦",
  },
  "half-century": {
    label: "ครึ่งร้อย",
    description: "ทายครบ 50 นัดที่ออกผลแล้ว",
    emoji: "🎖️",
  },
  century: {
    label: "ร้อยศึก",
    description: "ทายครบ 100 นัดที่ออกผลแล้ว",
    emoji: "🏆",
  },
  "draw-whisperer": {
    label: "เซียนเสมอ",
    description: "ทายเสมอถูกอย่างน้อย 5 ครั้ง — ผลที่ทายยากที่สุด",
    emoji: "⚖️",
  },
  "away-day": {
    label: "สายบุก",
    description: "ทายทีมเยือนชนะถูกอย่างน้อย 10 ครั้ง",
    emoji: "🚌",
  },
  fortress: {
    label: "ป้อมปราการ",
    description: "ทายทีมเหย้าชนะถูกอย่างน้อย 15 ครั้ง",
    emoji: "🏰",
  },
  comeback: {
    label: "คัมแบ็ก",
    description: "พลาด 3 นัดติดแล้วกลับมาถูก 3 นัดติดทันที",
    emoji: "💪",
  },
  clutch: {
    label: "เส้นยาแดง",
    description: "ส่งคำทายภายในชั่วโมงสุดท้ายก่อนคิกออฟแล้วถูก อย่างน้อย 5 ครั้ง",
    emoji: "⏱️",
  },
  "night-owl": {
    label: "นกฮูก",
    description: "ส่งคำทายช่วงเที่ยงคืนถึงตี 5 (เวลาไทย) อย่างน้อย 5 ครั้ง",
    emoji: "🦉",
  },
  regular: {
    label: "ขาประจำ",
    description: "มีคำทายออกผลแล้วในอย่างน้อย 10 แมตช์เดย์",
    emoji: "📅",
  },
  "all-rounder": {
    label: "ครบเครื่อง",
    description: "ทายถูกครบทั้งเหย้าชนะ เสมอ และเยือนชนะ อย่างละ 3 ครั้ง",
    emoji: "🎨",
  },
};

export const BADGE_KEYS = Object.keys(BADGES) as BadgeKey[];

export function isBadgeKey(value: unknown): value is BadgeKey {
  return typeof value === "string" && value in BADGES;
}

/** หนึ่งนัดที่จบแล้วของผู้ใช้คนนี้ — เรียงตามเวลาคิกออฟจากเก่าไปใหม่ก่อนส่งเข้ามา */
export type ScoredRow = {
  matchday: number;
  correct: boolean;
  /** ผลที่ทายไว้ — ใช้กับเหรียญสายเหย้า/เยือน/เสมอ */
  predicted: "HOME" | "DRAW" | "AWAY";
  /** ชั่วโมงที่ส่งคำทายล่วงหน้าก่อนคิกออฟ (null = ไม่มีข้อมูล) */
  leadTimeHours: number | null;
  /** ชั่วโมง (0-23 เวลาไทย) ที่กดส่งคำทาย — ใช้กับเหรียญนกฮูก */
  submittedHourBkk: number | null;
  /** ทายต่างจากเสียงข้างมากของนัดนั้น (นับเฉพาะนัดที่มีผู้ทายอย่างน้อย 3 คน) */
  againstMajority: boolean;
};

export function computeStreaks(rows: Pick<ScoredRow, "correct">[]): {
  current: number;
  best: number;
} {
  let current = 0;
  let best = 0;
  for (const row of rows) {
    current = row.correct ? current + 1 : 0;
    if (current > best) best = current;
  }
  return { current, best };
}

const MIN_SAMPLE = 10;
const SHARPSHOOTER_ACCURACY = 0.6;
const DEADEYE_ACCURACY = 0.7;
const DEADEYE_MIN = 20;
const PERFECT_MATCHDAY_MIN = 3;
const CONTRARIAN_WINS = 3;
const EARLY_BIRD_HOURS = 24;
const CLUTCH_HOURS = 1;
const CLUTCH_WINS = 5;
const NIGHT_OWL_COUNT = 5;
const REGULAR_MATCHDAYS = 10;
const ALL_ROUNDER_EACH = 3;
const DRAW_WINS = 5;
const AWAY_WINS = 10;
const HOME_WINS = 15;

/**
 * ประเมินว่าจากประวัติชุดนี้ควรได้เหรียญอะไรบ้าง — คืน "ทุกเหรียญที่เข้าเกณฑ์ตอนนี้"
 * ผู้เรียก (profile.ts) เอาไป insert แบบ on conflict do nothing เอง เหรียญที่เคยได้แล้ว
 * จึงไม่ถูกถอนแม้เกณฑ์จะไม่ผ่านแล้วในภายหลัง
 */
export function evaluateBadges(
  rows: ScoredRow[],
  options: { beatsBestAi?: boolean } = {},
): BadgeKey[] {
  const earned: BadgeKey[] = [];
  const { best } = computeStreaks(rows);
  const correctRows = rows.filter((row) => row.correct);

  // ── สายปริมาณ ──
  if (rows.length >= 1) earned.push("first-blood");
  if (rows.length >= 50) earned.push("half-century");
  if (rows.length >= 100) earned.push("century");
  if (new Set(rows.map((row) => row.matchday)).size >= REGULAR_MATCHDAYS) {
    earned.push("regular");
  }

  // ── สายสตรีค ──
  if (best >= 3) earned.push("streak-3");
  if (best >= 5) earned.push("streak-5");
  if (best >= 10) earned.push("streak-10");

  // คัมแบ็ก: พลาด ≥3 ติด แล้วตามด้วยถูก ≥3 ติดทันที — ไล่หาจุดเปลี่ยนโมเมนตัมในลำดับจริง
  let losing = 0;
  let winningAfterSlump = 0;
  let inRecovery = false;
  for (const row of rows) {
    if (row.correct) {
      if (inRecovery || losing >= 3) {
        inRecovery = true;
        winningAfterSlump++;
        if (winningAfterSlump >= 3) {
          earned.push("comeback");
          break;
        }
      }
      losing = 0;
    } else {
      losing++;
      inRecovery = false;
      winningAfterSlump = 0;
    }
  }

  // ── สายความแม่น ──
  if (
    rows.length >= MIN_SAMPLE &&
    correctRows.length / rows.length >= SHARPSHOOTER_ACCURACY
  ) {
    earned.push("sharpshooter");
  }
  if (
    rows.length >= DEADEYE_MIN &&
    correctRows.length / rows.length >= DEADEYE_ACCURACY
  ) {
    earned.push("deadeye");
  }

  // ── สายแมตช์เดย์ ──
  const byMatchday = new Map<number, ScoredRow[]>();
  for (const row of rows) {
    const group = byMatchday.get(row.matchday) ?? [];
    group.push(row);
    byMatchday.set(row.matchday, group);
  }
  // หมายเหตุ: เกณฑ์นี้ดูเฉพาะนัดที่ "ผู้ใช้ทายและจบแล้ว" ในแมตช์เดย์นั้น ไม่ได้บังคับว่าต้องทาย
  // ครบทุกนัดของโปรแกรม — การทายน้อยนัดเองก็เป็นความเสี่ยงอยู่แล้ว (นัดที่ไม่ทาย = 0 แต้มถาวร)
  const perfectCount = [...byMatchday.values()].filter(
    (group) =>
      group.length >= PERFECT_MATCHDAY_MIN && group.every((row) => row.correct),
  ).length;
  if (perfectCount >= 1) earned.push("perfect-matchday");
  if (perfectCount >= 2) earned.push("double-perfect");

  // ── สายชนิดผล ──
  const winsOf = (outcome: ScoredRow["predicted"]) =>
    correctRows.filter((row) => row.predicted === outcome).length;
  if (winsOf("DRAW") >= DRAW_WINS) earned.push("draw-whisperer");
  if (winsOf("AWAY") >= AWAY_WINS) earned.push("away-day");
  if (winsOf("HOME") >= HOME_WINS) earned.push("fortress");
  if (
    winsOf("HOME") >= ALL_ROUNDER_EACH &&
    winsOf("DRAW") >= ALL_ROUNDER_EACH &&
    winsOf("AWAY") >= ALL_ROUNDER_EACH
  ) {
    earned.push("all-rounder");
  }

  // ── สายจังหวะเวลา ──
  const contrarianWins = correctRows.filter(
    (row) => row.againstMajority,
  ).length;
  if (contrarianWins >= CONTRARIAN_WINS) earned.push("contrarian");

  const withLeadTime = rows.filter((row) => row.leadTimeHours !== null);
  if (withLeadTime.length >= MIN_SAMPLE) {
    const sorted = withLeadTime
      .map((row) => row.leadTimeHours as number)
      .sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    if (median >= EARLY_BIRD_HOURS) earned.push("early-bird");
  }

  const clutchWins = correctRows.filter(
    (row) => row.leadTimeHours !== null && row.leadTimeHours <= CLUTCH_HOURS,
  ).length;
  if (clutchWins >= CLUTCH_WINS) earned.push("clutch");

  const nightSubmissions = rows.filter(
    (row) =>
      row.submittedHourBkk !== null &&
      row.submittedHourBkk >= 0 &&
      row.submittedHourBkk < 5,
  ).length;
  if (nightSubmissions >= NIGHT_OWL_COUNT) earned.push("night-owl");

  // ── เทียบ AI ──
  if (options.beatsBestAi && rows.length >= MIN_SAMPLE) {
    earned.push("ai-slayer");
  }

  return earned;
}
