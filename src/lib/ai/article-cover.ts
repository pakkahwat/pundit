// ── เลือกภาพหน้าปกบทความให้ตรงกับเรื่องที่เขียน ────────────────────────────────
//
// ปัญหาเดิม: cover ถูกดึงตอนสร้าง ArticleSource ซึ่งเกิดขึ้น *ก่อน* โมเดลจะเขียนบทความ ตอนนั้นยัง
// ไม่มีพาดหัวให้ดูเลยว่าบทความจะพูดเรื่องอะไร คำค้นจึงเป็นคำกลาง ๆ ของทั้งลีก ("<ลีก> football news")
// ผลคือทุกบทความของลีกเดียวกันได้รูปแรกจาก RSS ชุดเดียวกันเป๊ะ — หน้ารวมข่าวเลยเป็นภาพเดียวซ้ำทั้งหน้า
//
// วิธีใหม่: จำแนกหัวข้อจากพาดหัวที่เขียนเสร็จแล้ว แล้วค่อยไปหารูปด้วยคำค้นของหัวข้อนั้น
// ข่าวย้ายทีมจะได้ภาพจากข่าวตลาดซื้อขายจริง ข่าวผลแข่งจะได้ภาพในสนาม ไม่ใช่รูปสต็อกใบเดียวกันหมด

import { detectTeamsInTitle } from "@/lib/football/team-aliases";
import {
  MATCH_BANNER_IMAGES,
  PLAYER_FOCUS_IMAGES,
  parseRssItems,
} from "./article-source";

export type ArticleTopic =
  | "transfer"
  | "injury"
  | "match"
  | "preview"
  | "standings"
  | "predictions"
  | "general";

// เรียงตามลำดับความจำเพาะ — ตัวที่แคบกว่าต้องมาก่อน เพราะพาดหัวหนึ่งมักเข้าได้หลายหมวด
// เช่น "ตลาดซัมเมอร์เดือด! ส่องดีลสะท้านพรีเมียร์ลีก" เข้าได้ทั้ง transfer และ general
// แต่ transfer เจาะจงกว่าจึงต้องชนะ
const TOPIC_PATTERNS: { topic: ArticleTopic; pattern: RegExp }[] = [
  {
    topic: "transfer",
    pattern:
      /ย้ายทีม|ซื้อขาย|ตลาด(ซื้อขาย|นักเตะ|ซัมเมอร์)?|ซัมเมอร์|ดีล|ค่าตัว|คว้าตัว|เซ็นสัญญา|สัญญาใหม่|ยืมตัว|เสริมทัพ|transfer|deal|signing|loan/i,
  },
  {
    topic: "injury",
    pattern:
      /บาดเจ็บ|เจ็บหนัก|อาการเจ็บ|พักฟื้น|ฟิตพร้อม|ความฟิต|เจ็บยาว|injury|injured|fitness|sidelined/i,
  },
  {
    topic: "predictions",
    pattern:
      /\bAI\b|ทายผล|ทายแม่น|ทายพลาด|ความแม่น|คนปะทะ|คน vs|มนุษย์|prediction|accuracy/i,
  },
  // preview ต้องมาก่อน match เพราะพาดหัวพูดถึงโปรแกรมล่วงหน้ามักยืมคำของการเล่นเกมมาใช้
  // ("โปรแกรมซดแข้งสุดสัปดาห์") ถ้า match ชนะก่อนจะกลายเป็นข่าวผลแข่งทั้งที่ยังไม่ได้เตะ
  // คำที่ใช้ตรงนี้จึงต้องเป็นคำที่ชี้ "อนาคต" ชัด ๆ เท่านั้น ("ศึก" กว้างเกินไป จงใจไม่ใส่)
  {
    topic: "preview",
    pattern:
      /โปรแกรม|สุดสัปดาห์|นัดสำคัญ|จับตา|เตรียม(บุก|รับ)|คิวชน|ล่วงหน้า|รอเปิดสนาม|เปิดฉาก|preview|fixtures|weekend/i,
  },
  {
    topic: "match",
    pattern:
      /ถล่ม|บุกชนะ|เปิดบ้าน|ดวล|เฉือน|สรุปผล|สรุปศึก|ผลการแข่ง|ไล่ตี|พ่าย|ยิง|ประตู|ชนะ|แพ้|เสมอ/i,
  },
  // standings อยู่ท้ายสุดโดยตั้งใจ — ข่าวสรุปผลแข่งมักพ่วงเรื่องตารางคะแนนไว้ในพาดหัวเดียวกัน
  // ("ถล่มโหด! สรุปผลลาลีกาและความเดือดตารางคะแนน") เรื่องหลักคือเกม ไม่ใช่ตาราง
  {
    topic: "standings",
    pattern:
      /ตารางคะแนน|จ่าฝูง|นำฝูง|พุ่งนำ|ลุ้นแชมป์|ไล่ล่า|ตกชั้น|อันดับ|แต้ม|หนีตกชั้น|standings|table|title race|relegation/i,
  },
];
/**
 * เดาหัวข้อของบทความจากพาดหัวเป็นหลัก โดยใช้ย่อหน้าแรกช่วยตัดสินเมื่อพาดหัวกำกวม
 *
 * ตั้งใจให้เป็น keyword matching ไม่ใช่เรียก LLM ซ้ำอีกรอบ — งานนี้แค่เลือกรูป ไม่คุ้มกับการจ่าย
 * ค่าเรียกโมเดลเพิ่มและรอ latency อีกก้อน ทายพลาดบ้างก็แค่ได้รูปที่ตรงน้อยลง ไม่ได้ทำให้อะไรพัง
 */
export function classifyArticleTopic(
  title: string,
  body: string = "",
): ArticleTopic {
  const fromTitle = TOPIC_PATTERNS.find((entry) => entry.pattern.test(title));
  if (fromTitle) return fromTitle.topic;

  // พาดหัวไม่บอกอะไรเลย ค่อยดูย่อหน้าแรก — ตัดมาแค่ช่วงต้นเพื่อไม่ให้คำที่โผล่ผ่าน ๆ กลางบทความ
  // มาชี้นำหัวข้อทั้งใบ
  const opening = body.slice(0, 400);
  const fromBody = TOPIC_PATTERNS.find((entry) => entry.pattern.test(opening));
  return fromBody ? fromBody.topic : "general";
}

// คำเสริมท้ายชื่อทีมสำหรับค้นข่าว — สั้น ๆ พอให้ข่าวที่ได้ตรงมุมของบทความ
const TOPIC_NEWS_WORD: Record<ArticleTopic, string> = {
  transfer: "transfer news",
  injury: "injury news",
  match: "match report",
  preview: "preview",
  standings: "table",
  predictions: "analysis",
  general: "news",
};

/**
 * คำค้น Google News สำหรับหารูปของบทความนั้น — ไล่จากเจาะจงที่สุดไปกว้างสุด
 * ผู้เรียกจะลองทีละอันจนกว่าจะได้รูปที่ใช้ได้ (ดู fetchTopicCoverImages)
 *
 * ลำดับความสำคัญ: ชื่อทีมที่พาดหัวพูดถึงมาก่อนเสมอ เพราะเป็นสิ่งเดียวที่ทำให้ได้ "ภาพของเกมนั้นจริง ๆ"
 * ถ้าพาดหัวพูดถึงสองทีม แปลว่ากำลังเล่าถึงแมตช์ระหว่างคู่นั้น คำค้น "A vs B" จึงตรงที่สุด
 */
export function coverSearchQueries(
  topic: ArticleTopic,
  seasonName: string,
  title: string,
  knownTeams?: string[],
): string[] {
  const byTopic: Record<ArticleTopic, string[]> = {
    transfer: [
      `${seasonName} transfer deal signing`,
      `${seasonName} transfer news`,
    ],
    injury: [`${seasonName} injury news player`, `${seasonName} team news`],
    match: [
      `${seasonName} match report highlights`,
      `${seasonName} results roundup`,
    ],
    preview: [
      `${seasonName} weekend fixtures preview`,
      `${seasonName} upcoming matches`,
    ],
    standings: [
      `${seasonName} table title race`,
      `${seasonName} standings latest`,
    ],
    predictions: [`${seasonName} predictions analysis`, `${seasonName} preview`],
    general: [`${seasonName} football news`],
  };

  const teams = detectTeamsInTitle(title, knownTeams);
  const topicWord = TOPIC_NEWS_WORD[topic];
  const teamQueries =
    teams.length >= 2
      ? [
          `${teams[0]} vs ${teams[1]}`,
          `${teams[0]} ${teams[1]} ${topicWord}`,
          `${teams[0]} ${topicWord}`,
        ]
      : teams.length === 1
        ? [`${teams[0]} ${topicWord}`, `${teams[0]} football`]
        : [];

  // ชื่อทีมที่เขียนด้วยอักษรละตินในพาดหัวอยู่แล้ว ใช้เป็นตัวช่วยรองลงมา เผื่อฉายาที่ยังไม่มีในตาราง
  const latinHint = extractLatinKeywords(title);
  return [
    ...teamQueries,
    ...(latinHint ? [`${seasonName} ${latinHint}`] : []),
    ...byTopic[topic],
    `${seasonName} football news`,
  ];
}

// พาดหัวเป็นภาษาไทย แต่ชื่อทีมมักถูกเขียนทับด้วยอักษรละตินอยู่บ้าง ("ส่องดีล Man City")
// ดึงเฉพาะส่วนนั้นออกมาใช้เป็นคำค้นเสริม — ถ้าไม่มีเลยก็ข้ามไป
function extractLatinKeywords(title: string): string | null {
  const words = title.match(/[A-Za-z][A-Za-z.'-]{2,}/g);
  if (!words || words.length === 0) return null;
  return words.slice(0, 3).join(" ");
}

/** รูปสต็อกสำรองเมื่อหารูปจากข่าวจริงไม่ได้ — หมวดที่เป็นเรื่องของคนใช้ภาพที่โฟกัสนักเตะ */
export function fallbackCoverImages(topic: ArticleTopic): string[] {
  const playerCentric: ArticleTopic[] = ["transfer", "injury", "predictions"];
  return playerCentric.includes(topic)
    ? PLAYER_FOCUS_IMAGES
    : MATCH_BANNER_IMAGES;
}

/**
 * รูปนี้เป็นโลโก้/ตราสโมสรหรือเปล่า
 *
 * RSS แนบโลโก้ทีมมาบ่อยมาก ซึ่งใช้เป็นภาพหน้าปกข่าวแล้วดูเป็นแบรนด์ทีมมากกว่าสื่อฟุตบอล
 * เช็คไว้ที่เดียวเพราะทั้งฝั่งเลือกรูปตอนสร้างบทความและฝั่งเรนเดอร์การ์ดต้องใช้เกณฑ์เดียวกัน
 */
export function isTeamCrestUrl(url: string): boolean {
  return /\.svg(?:$|[?#])|crest|logo|badge|team[-_]?image|football-data\.org/i.test(
    url,
  );
}

// ── คำค้นสำหรับ Pexels ────────────────────────────────────────────────────────
//
// ต่างจากคำค้นข่าว (coverSearchQueries) ตรงที่อันนั้นหา "ข่าวเรื่องนี้" แล้วเอารูปที่ข่าวแนบมา
// ส่วนอันนี้หา "ภาพที่หน้าตาเป็นเรื่องนี้" จากคลังภาพสต็อก จึงต้องบรรยายเป็น *ฉาก* ไม่ใช่หัวข้อข่าว
// และห้ามใส่ชื่อลีก/ชื่อทีมลงไป เพราะคลังสต็อกไม่มีภาพลิขสิทธิ์ของแมตช์จริงอยู่แล้ว
// ใส่ไปมีแต่จะได้ผลลัพธ์ว่าง
// คำค้นทุกอันขึ้นต้นด้วย "soccer" โดยตั้งใจ ห้ามใช้ "football" นำ — Pexels เป็นคลังภาพฝั่งอเมริกา
// คำว่า football ที่นั่นหมายถึงอเมริกันฟุตบอล ค้นแล้วได้ภาพหมวกกันน็อคกับถ้วยรักบี้มาแทน
// (เคสจริงที่เจอ: "football trophy silverware" คืนถ้วยอเมริกันฟุตบอลกับบาสเกตบอล)
//
// มีหลายคำค้นต่อหมวดเพื่อให้บทความคนละใบได้ภาพคนละแบบ — ดู pickBySeed ว่าเลือกยังไง
const PEXELS_QUERIES: Record<ArticleTopic, string[]> = {
  transfer: [
    "soccer player signing contract",
    "handshake business contract signing",
    "soccer transfer press conference",
    "soccer player new jersey presentation",
  ],
  injury: [
    "soccer player injury on pitch",
    "soccer physio treating player",
    "soccer player stretcher medical",
    "athlete knee injury treatment",
  ],
  match: [
    "soccer match action shot",
    "soccer player kicking ball game",
    "soccer players celebrating goal",
    "soccer tackle duel match",
  ],
  preview: [
    "empty soccer stadium night",
    "soccer pitch floodlights evening",
    "soccer stadium seats before match",
    "soccer ball on penalty spot",
  ],
  standings: [
    "soccer trophy celebration team",
    "soccer team lifting trophy",
    "soccer champions celebration confetti",
    "soccer stadium crowd celebrating",
  ],
  predictions: [
    "soccer coach tactics board",
    "soccer analyst data screen",
    "soccer manager touchline thinking",
    "sports statistics dashboard",
  ],
  general: [
    "soccer stadium crowd",
    "soccer ball on grass pitch",
    "soccer players training",
    "soccer fans supporters stand",
  ],
};

// FNV-1a 32 บิต + ขั้น avalanche (fmix32 ของ MurmurHash3)
//
// ต้องมีทั้งสองส่วน ขาดอันไหนก็พัง:
//
// 1. เดิมใช้ "ผลรวมรหัสอักขระ" ซึ่งกระจายแย่มาก พาดหัวที่ตัวอักษรรวมกันได้ใกล้เคียงกันจะได้
//    ผลลัพธ์ตรงกัน — FNV-1a คูณด้วย prime ทุกตัวอักษร ลำดับตัวอักษรจึงมีผลด้วย ไม่ใช่แค่ผลรวม
//
// 2. แต่ FNV-1a เพียว ๆ ยังกระจาย "บิตล่าง" ไม่ดี ซึ่งเป็นบิตที่ % ใช้พอดี เคสจริงที่เจอ:
//    พาดหัวข่าวผลแข่งภาษาไทยสี่อัน ได้ค่า hash ต่างกันหมด (2372801230, 3009096938,
//    1981280158, 887264602) แต่ % 4 ได้ 2 ทั้งสี่อัน ทุกใบเลยได้คำค้นเดียวกัน
//    ขั้น avalanche คลุกบิตสูงลงมาผสมกับบิตล่างก่อน ผลหารเอาเศษจึงกระจายจริง
function hashSeed(seed: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x85ebca6b) >>> 0;
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 0xc2b2ae35) >>> 0;
  hash ^= hash >>> 16;
  return hash >>> 0;
}

/**
 * เลือกสมาชิกหนึ่งตัวจากลิสต์แบบกระจายแต่คงที่
 *
 * ต้อง "คงที่" เพราะบทความใบเดิมควรได้ภาพเดิมทุกครั้งที่รัน backfill ซ้ำ ไม่ใช่สุ่มใหม่ทุกรอบ
 * จนภาพในหน้ารวมข่าวเปลี่ยนไปมาเอง
 */
export function pickBySeed<T>(items: T[], seed: string): T {
  return items[hashSeed(seed) % items.length];
}

export function pexelsQueries(topic: ArticleTopic): string[] {
  return PEXELS_QUERIES[topic];
}

/** คำค้นของหมวดนี้ เรียงใหม่ให้บทความแต่ละใบเริ่มจากคนละอัน (ยังคงครบทุกอันไว้เป็นทางสำรอง) */
export function pexelsQueriesFor(topic: ArticleTopic, seed: string): string[] {
  const queries = PEXELS_QUERIES[topic];
  const start = hashSeed(seed) % queries.length;
  return [...queries.slice(start), ...queries.slice(0, start)];
}

/** รูปนี้มาจาก Pexels หรือเปล่า — การ์ดใช้ตัดสินว่าต้องแสดงเครดิตไหม (ดู CoverArt) */
export function isPexelsImageUrl(url: string): boolean {
  try {
    // เทียบแบบ endsWith("pexels.com") เฉย ๆ ไม่พอ — "evilpexels.com" ก็ผ่าน ต้องกั้นที่ขอบ subdomain
    const { hostname } = new URL(url);
    return hostname === "pexels.com" || hostname.endsWith(".pexels.com");
  } catch {
    return false;
  }
}

// ── แบนเนอร์โลโก้ "เหย้า vs เยือน" ────────────────────────────────────────────
//
// ทางสำรองของบทความแมตช์เมื่อหาภาพสนามเจ้าบ้านไม่ได้: แทนที่จะจบที่ภาพสต็อกที่ไม่เกี่ยวอะไร
// กับเกมเลย ใช้โลโก้สองทีมประกบกันแทน — เกี่ยวกับเกมนั้น 100% เสมอ เพราะโลโก้มาจาก DB เราเอง
//
// เก็บเป็น URL scheme ของเราเอง ("vs://<crest>::<crest>") ไม่ใช่ภาพจริง เพราะจะ "วาด" ภาพ
// โลโก้ประกบกันฝั่ง server ก็ต้องมีตัว render ภาพ ส่วน SVG ที่ฝัง external image ก็โหลดไม่ขึ้น
// เมื่ออยู่ใน <img> (เบราว์เซอร์บล็อก external resource ใน SVG-as-image) — ให้การ์ดฝั่ง client
// ตรวจเจอ scheme นี้แล้วเรนเดอร์เป็น component เองตรง ๆ ง่ายและเบากว่ามาก (ดู CoverArt)

const VS_BANNER_PREFIX = "vs://";

export function vsBannerUrl(homeCrest: string, awayCrest: string): string {
  // encodeURIComponent เข้ารหัส ":" เป็น %3A — ตัวคั่น "::" จึงไม่มีทางชนกับเนื้อ URL
  return `${VS_BANNER_PREFIX}${encodeURIComponent(homeCrest)}::${encodeURIComponent(awayCrest)}`;
}

export function parseVsBannerUrl(
  url: string,
): { homeCrest: string; awayCrest: string } | null {
  if (!url.startsWith(VS_BANNER_PREFIX)) return null;
  const parts = url.slice(VS_BANNER_PREFIX.length).split("::");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  try {
    return {
      homeCrest: decodeURIComponent(parts[0]),
      awayCrest: decodeURIComponent(parts[1]),
    };
  } catch {
    return null;
  }
}
