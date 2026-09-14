// ── ป้ายชื่อ "รอบ" ของแมตช์เดย์ (ส่วนตรรกะล้วน ไม่แตะ DB — เทสต์ได้) ─────────────────
//
// ลีกปกติทุกแมตช์เดย์คือ "แมตช์เดย์ N" แต่บอลถ้วย (แชมเปียนส์ลีก) หลังรอบลีกจะเป็นเพลย์ออฟ/
// รอบ 16 ทีม/... ซึ่งเตะสองนัด — เลขแมตช์เดย์ยังเป็นตัวระบุรอบในระบบ (URL, คำทาย, คะแนน) แต่ที่
// แสดงให้คนอ่านควรเป็นชื่อรอบ ค่าจากคอลัมน์ matches.stage (vocabulary ของ football-data.org)
//
// "นัดแรก/นัดสอง" ไม่ได้มาจาก API — คำนวณจากลำดับแมตช์เดย์ภายใน stage เดียวกัน (แมตช์เดย์ที่
// น้อยกว่า = นัดแรก) จึงต้องรู้แมตช์เดย์ทั้งหมดของ stage นั้นก่อน ดู buildStageMap
// ส่วนที่อ่านจาก DB อยู่ใน stage-map.ts (แยกไฟล์เพราะ db/client โยน error ตอน import ถ้าไม่มี env
// ทำให้เทสต์ไฟล์นี้ไม่ได้ — เหตุผลเดียวกับ article-source.ts)

export type StageInfo = {
  stage: string | null;
  /** ลำดับนัดภายใน stage (1 = นัดแรก) — null ถ้า stage นั้นมีนัดเดียวหรือเป็นรอบลีก */
  leg: number | null;
};

const STAGE_NAMES: Record<string, string> = {
  PLAYOFFS: 'เพลย์ออฟ',
  LAST_32: 'รอบ 32 ทีม',
  LAST_16: 'รอบ 16 ทีม',
  QUARTER_FINALS: 'รอบ 8 ทีม',
  SEMI_FINALS: 'รอบรองชนะเลิศ',
  THIRD_PLACE: 'ชิงอันดับ 3',
  FINAL: 'รอบชิงชนะเลิศ',
};

// รอบที่นับเป็น "แมตช์เดย์" ธรรมดา
const LEAGUE_LIKE = new Set(['REGULAR_SEASON', 'LEAGUE_STAGE', 'GROUP_STAGE']);

const LEG_LABEL = ['นัดแรก', 'นัดสอง', 'นัดสาม'];

/** ป้ายที่คนอ่าน: "แมตช์เดย์ 5", "เพลย์ออฟ นัดแรก", "รอบชิงชนะเลิศ" */
export function matchdayLabel(matchday: number, info?: StageInfo | null): string {
  const stage = info?.stage ?? null;
  if (!stage || LEAGUE_LIKE.has(stage)) return `แมตช์เดย์ ${matchday}`;
  const name = STAGE_NAMES[stage] ?? stage;
  if (info?.leg == null) return name;
  return `${name} ${LEG_LABEL[info.leg - 1] ?? `นัดที่ ${info.leg}`}`;
}

/**
 * สร้างแผนที่ matchday → StageInfo จากรายการ (matchday, stage) ของฤดูกาลเดียว
 * นับ leg จากลำดับแมตช์เดย์ภายใน stage — แมตช์เดย์ที่น้อยกว่าคือนัดแรก
 */
export function buildStageMap(
  rows: { matchday: number; stage: string | null }[],
): Map<number, StageInfo> {
  // รับได้ทั้งแถวที่ group มาแล้วและแถวดิบ (หลายนัดต่อแมตช์เดย์) — เก็บเป็น Set ต่อ stage
  // ไม่งั้นนัดที่ 2 ของแมตช์เดย์ 10 จะกลายเป็น "นัดที่ 9" เพราะนับซ้ำ
  const sorted = [...rows].sort((a, b) => a.matchday - b.matchday);
  const perStage = new Map<string, Set<number>>();
  for (const r of sorted) {
    if (!r.stage) continue;
    const set = perStage.get(r.stage) ?? new Set<number>();
    set.add(r.matchday);
    perStage.set(r.stage, set);
  }
  const map = new Map<number, StageInfo>();
  for (const r of sorted) {
    if (!r.stage || map.has(r.matchday)) continue;
    const mds = [...(perStage.get(r.stage) ?? [])].sort((a, b) => a - b);
    const leagueLike = LEAGUE_LIKE.has(r.stage);
    map.set(r.matchday, {
      stage: r.stage,
      leg: leagueLike || mds.length < 2 ? null : mds.indexOf(r.matchday) + 1,
    });
  }
  return map;
}
