// ── เทียบชื่อทีมข้ามแหล่งข้อมูล ────────────────────────────────────────────────
//
// อยู่ที่นี่เพราะมีสองงานที่ต้องใช้เกณฑ์เดียวกัน: จับคู่สกอร์สดจาก SportMonks กับโปรแกรมแข่งของเรา
// (lib/matches/live-overlay.ts) และหาว่าพาดหัวบทความพูดถึงทีมไหน (lib/football/team-aliases.ts)
// ถ้าปล่อยให้แต่ละที่เขียนเอง เกณฑ์จะหลุดจากกันโดยไม่มีอะไรฟ้อง

/**
 * ทำชื่อทีมให้เทียบกันได้ระหว่าง football-data.org กับ SportMonks
 *
 * สองเจ้าเรียกไม่เหมือนกัน: "Manchester City FC" vs "Manchester City",
 * "Brighton & Hove Albion FC" vs "Brighton and Hove Albion",
 * "Wolverhampton Wanderers FC" vs "Wolves" (เคสนี้จับด้วย substring ไม่ติด — ดูหมายเหตุใน sameTeam)
 */
export function normalizeTeamName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, "and")
    .replace(/\b(fc|afc|cf|sc|ac|club|football|association)\b/g, "")
    .replace(/[^a-z0-9]/g, "");
}

export function sameTeam(a: string, b: string): boolean {
  const x = normalizeTeamName(a);
  const y = normalizeTeamName(b);
  if (!x || !y) return false;
  if (x === y) return true;
  // ยอมให้จับแบบ "ชื่อหนึ่งอยู่ในอีกชื่อ" ได้ แต่ต้องยาวพอสมควรก่อน ไม่งั้นชื่อสั้น ๆ ไปโดนได้ครึ่งลีก
  return x.length >= 5 && y.length >= 5 && (x.includes(y) || y.includes(x));
}
