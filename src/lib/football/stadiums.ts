// ── สนามเหย้าของแต่ละสโมสร → หน้า Wikipedia ของสนาม ───────────────────────────
//
// ใช้ตอนหาภาพหน้าปกบทความที่เล่าถึงแมตช์: ภาพสนามเจ้าบ้านเกี่ยวข้องกับเกมนั้นแน่นอน
// ต่างจากภาพข่าวจาก RSS ที่บ่อยครั้งเป็นภาพประกอบข่าวอื่นที่แค่บังเอิญติดมากับ feed
//
// เก็บเป็น "ชื่อหน้า Wikipedia" ไม่ใช่ URL รูปตรง ๆ — URL รูปบน Wikimedia เปลี่ยนได้เมื่อมีคน
// อัปโหลดรูปใหม่ แต่ชื่อหน้าสนามนิ่งกว่ามาก แล้วค่อยถาม REST API เอารูปหลักของหน้านั้น ณ ตอนใช้
// (ดู fetchStadiumImage ใน lib/ai/article-cover-fetch.ts) ชื่อหน้าไหนผิด/ถูกเปลี่ยนชื่อ
// ก็แค่ได้ 404 แล้วตกไปใช้แบนเนอร์โลโก้แทน ไม่มีอะไรพัง

import { sameTeam } from "./team-name";

const STADIUM_PAGES: Record<string, string> = {
  // ── พรีเมียร์ลีก ──
  Arsenal: "Emirates Stadium",
  "Aston Villa": "Villa Park",
  Bournemouth: "Dean Court",
  Brentford: "Brentford Community Stadium",
  "Brighton & Hove Albion": "Falmer Stadium",
  Burnley: "Turf Moor",
  // ต้องมีวงเล็บกำกับ — "Stamford Bridge" เฉย ๆ คือหมู่บ้านในยอร์กเชียร์ (และสมรภูมิปี 1066)
  Chelsea: "Stamford Bridge (stadium)",
  "Crystal Palace": "Selhurst Park",
  Everton: "Everton Stadium",
  Fulham: "Craven Cottage",
  "Leeds United": "Elland Road",
  Liverpool: "Anfield",
  "Manchester City": "City of Manchester Stadium",
  "Manchester United": "Old Trafford",
  "Newcastle United": "St James' Park",
  "Nottingham Forest": "City Ground",
  Sunderland: "Stadium of Light",
  "Tottenham Hotspur": "Tottenham Hotspur Stadium",
  "West Ham United": "London Stadium",
  "Wolverhampton Wanderers": "Molineux Stadium",

  // ── ลาลีกา ──
  "Real Madrid": "Santiago Bernabéu Stadium",
  Barcelona: "Camp Nou",
  "Atletico Madrid": "Metropolitano Stadium",
  Sevilla: "Ramón Sánchez Pizjuán Stadium",
  "Real Betis": "Estadio Benito Villamarín",
  "Real Sociedad": "Anoeta Stadium",
  "Athletic Bilbao": "San Mamés Stadium (2013)",
  Villarreal: "Estadio de la Cerámica",
  Valencia: "Mestalla Stadium",
  "Celta Vigo": "Balaídos",
  Getafe: "Coliseum Alfonso Pérez",
  Osasuna: "El Sadar Stadium",
  // หน้านี้ยังไม่มีรูปประกอบ (ตรวจ 29 ส.ค. 2026) — ราโยจะตกไปใช้แบนเนอร์โลโก้จนกว่าจะมีคนอัปโหลด
  "Rayo Vallecano": "Vallecas Stadium",
  Mallorca: "Estadi de Son Moix",
  Girona: "Estadi Montilivi",
  Alaves: "Mendizorrotza Stadium",
  Espanyol: "RCDE Stadium",
  Elche: "Estadio Manuel Martínez Valero",
  Levante: "Estadi Ciutat de València",
  Oviedo: "Estadio Carlos Tartiere",
};

/** ชื่อหน้า Wikipedia ของสนามเหย้า — เทียบผ่าน sameTeam เพราะชื่อจาก DB มี FC/CF ต่อท้าย */
export function stadiumPageFor(team: string): string | null {
  const entry = Object.entries(STADIUM_PAGES).find(([name]) =>
    sameTeam(name, team),
  );
  return entry ? entry[1] : null;
}

/** รายชื่อทีมทั้งหมดที่มีสนามในตาราง — ใช้โดยสคริปต์ตรวจว่าแต่ละหน้ายังให้รูปได้จริง */
export function stadiumTeams(): string[] {
  return Object.keys(STADIUM_PAGES);
}
