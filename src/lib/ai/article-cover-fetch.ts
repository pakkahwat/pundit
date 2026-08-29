import { parseRssItems } from "./article-source";
import type { ResolvedFixture } from "./article-source";
import {
  coverSearchQueries,
  fallbackCoverImages,
  isTeamCrestUrl,
  pexelsQueriesFor,
  pickBySeed,
  vsBannerUrl,
  type ArticleTopic,
} from "./article-cover";
import { stadiumPageFor } from "@/lib/football/stadiums";

// ── หารูปหน้าปกตามหัวข้อของบทความ (ฝั่งที่ยิงเน็ต) ──────────────────────────────
//
// แยกไฟล์จาก article-cover.ts เพราะไฟล์นั้นถูก import จาก article-card.tsx ซึ่งเป็น client
// component — โค้ดที่อ่าน API key กับยิง fetch ฝั่งเซิร์ฟเวอร์ไม่ควรมีโอกาสหลุดไปอยู่ใน bundle
// ของ browser เลยตั้งแต่แรก แทนที่จะไปหวังให้ tree-shaking ตัดให้ถูกทุกครั้ง
//
// เรียกหลังโมเดลเขียนบทความเสร็จแล้วเท่านั้น เพราะต้องใช้พาดหัวจริงเป็นตัวตั้งคำค้น
// ไล่หาสามชั้น หยุดทันทีที่ได้รูปที่ใช้ได้:
//   1. รูปจากข่าวจริงที่ตรงหัวข้อ (Google News RSS) — ตรงเรื่องที่สุด แต่ไม่ได้มีทุกครั้ง
//   2. ภาพสต็อกจาก Pexels ที่ค้นด้วยคำบรรยายฉากของหัวข้อนั้น — คุมคุณภาพได้ ต้องมี PEXELS_API_KEY
//   3. รูปสต็อกคงที่ในโค้ด — ทางสุดท้าย บทความต้องมีหน้าปกทุกใบ ไม่มีเคสการ์ดว่าง

const HTTP_TIMEOUT_MS = 5_000;

async function isUsableImageUrl(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, {
      method: "HEAD",
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
    });
    return (
      response.ok &&
      (response.headers.get("content-type") ?? "").startsWith("image/")
    );
  } catch {
    return false;
  }
}

type PexelsResponse = {
  photos?: { src?: { landscape?: string; large?: string } }[];
};

// ขอมาเป็นหน้า ๆ แล้วค่อยเลือกเอง แทนการขอ per_page=1 แล้วหยิบใบแรก
//
// ขอทีละใบทำให้ "คำค้นเดียวกัน = รูปเดียวกันตลอดกาล" บทความทุกใบในหมวดเดียวกันจึงได้ภาพซ้ำกันหมด
// ซึ่งเป็นอาการเดียวกับที่ตั้งใจจะแก้ตั้งแต่แรก แค่ย้ายจากระดับลีกมาเป็นระดับหมวดเท่านั้นเอง
const PEXELS_PER_PAGE = 20;

/**
 * ค้นภาพสต็อกจาก Pexels — คืน null เมื่อไม่ได้ตั้ง key, ยิงไม่ผ่าน หรือไม่เจอผลลัพธ์
 *
 * ไม่มี key ก็ใช้งานได้ตามปกติ แค่ข้ามชั้นนี้ไป (แนวเดียวกับ SPORTMONKS_API_TOKEN)
 * โควตาฟรีคือ 200 ครั้ง/ชั่วโมง ซึ่งเหลือเฟือเพราะเราเขียนบทความแค่ลีกละหนึ่งใบต่อวัน
 * และชั้นนี้จะถูกเรียกก็ต่อเมื่อหารูปจากข่าวจริงไม่ได้เท่านั้น
 *
 * seed ใช้เลือกว่าจะหยิบรูปใบไหนจากผลลัพธ์ — ใส่พาดหัวบทความเข้ามา บทความคนละใบจะได้คนละรูป
 * แต่ใบเดิมจะได้รูปเดิมทุกครั้งที่รันซ้ำ
 */
export async function searchPexelsPhoto(
  query: string,
  seed: string,
): Promise<string | null> {
  const apiKey = process.env.PEXELS_API_KEY;
  if (!apiKey) return null;

  const url = new URL("https://api.pexels.com/v1/search");
  url.searchParams.set("query", query);
  url.searchParams.set("orientation", "landscape");
  url.searchParams.set("per_page", String(PEXELS_PER_PAGE));

  try {
    // Pexels ใช้ค่า key ดิบใน Authorization ไม่ใช่รูปแบบ "Bearer <key>"
    const response = await fetch(url, {
      headers: { Authorization: apiKey },
      signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
    });
    if (!response.ok) return null;

    const payload = (await response.json()) as PexelsResponse;
    const photos = (payload.photos ?? [])
      .map((photo) => photo.src?.landscape ?? photo.src?.large)
      .filter((src): src is string => Boolean(src));
    if (photos.length === 0) return null;

    // เติม salt ให้ต่างจากตอนเลือกคำค้น ไม่งั้นสองอย่างใช้ hash ก้อนเดียวกันแล้วขยับพร้อมกัน
    return pickBySeed(photos, `${seed}#photo`);
  } catch {
    return null;
  }
}

type WikiSummary = {
  thumbnail?: { source?: string };
  originalimage?: { source?: string };
};

/**
 * ภาพสนามเหย้าของทีม จากรูปหลักของหน้า Wikipedia ของสนามนั้น
 *
 * ใช้ REST summary endpoint เพราะให้รูปหลักของหน้ามาเลยใน call เดียว ไม่ต้อง parse HTML
 *
 * สองกับดักที่เจอมาแล้วจริง (ทดสอบใน browser กับ upload.wikimedia.org ตรง ๆ):
 * 1. thumbnail.source มี query string "?utm_source=..." ต่อท้าย ต้องตัดทิ้งก่อนแก้ขนาด
 * 2. เซิร์ฟเวอร์รูปย่อของ Wikimedia รับเฉพาะความกว้างบางค่าเท่านั้น — 500/960/1280 ผ่าน
 *    แต่ 640/800/1024/1200 โดนปฏิเสธหมด เวอร์ชันแรกขอ 1200px จึงพังทุกรูปทั้งที่หน้า
 *    Wikipedia มีรูปครบ จึงขอ 1280px และ **ตรวจ HEAD ก่อนคืนเสมอ** — เว็บเขาเปลี่ยน
 *    นโยบายแบบนี้ได้อีก อย่าคืน URL ที่ไม่เคยพิสูจน์ว่าโหลดได้จริง
 */
const WIKIMEDIA_THUMB_WIDTH = 1280;

export async function fetchStadiumImage(team: string): Promise<string | null> {
  const page = stadiumPageFor(team);
  if (!page) return null;

  const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(page.replace(/ /g, "_"))}`;
  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": "pundit/0.1" },
      signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
    });
    if (!response.ok) return null;

    const summary = (await response.json()) as WikiSummary;
    const thumb = summary.thumbnail?.source?.split("?")[0];

    // ไล่จากใหญ่ไปเล็ก: รูปย่อ 1280px → รูปต้นฉบับ → รูปย่อเล็กที่ API ให้มา (~320px ก็ยัง
    // ดีกว่าไม่มี) — ตัวแรกที่ HEAD ผ่านชนะ
    const candidates = [
      thumb?.replace(/\/\d+px-/, `/${WIKIMEDIA_THUMB_WIDTH}px-`),
      summary.originalimage?.source?.split("?")[0],
      thumb,
    ].filter((candidate): candidate is string => Boolean(candidate));

    for (const candidate of [...new Set(candidates)]) {
      if (await isUsableImageUrl(candidate)) return candidate;
    }
    return null;
  } catch {
    return null;
  }
}

async function newsImageFor(
  topic: ArticleTopic,
  seasonName: string,
  title: string,
  knownTeams?: string[],
): Promise<string | null> {
  for (const query of coverSearchQueries(topic, seasonName, title, knownTeams)) {
    const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}`;
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0" },
        signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
      });
      if (!response.ok) continue;

      const candidates = parseRssItems(await response.text())
        .map((item) => item.imageUrl)
        .filter((image): image is string => Boolean(image))
        .filter((image) => !isTeamCrestUrl(image));

      for (const candidate of candidates) {
        // เช็คทีละรูปแล้วหยุดทันทีที่เจอตัวที่ใช้ได้ ไม่ต้องยิง HEAD ครบทุกตัวให้เปลืองเวลา
        if (await isUsableImageUrl(candidate)) return candidate;
      }
    } catch {
      // feed ล่มก็แค่ลองคำค้นถัดไป ไม่ควรทำให้ทั้งงานเขียนบทความพัง
    }
  }
  return null;
}

export type CoverContext = {
  knownTeams?: string[];
  /** ทีมที่จับได้จากพาดหัว เรียงตามที่โผล่ — ใช้เดาเมื่อหา fixture จริงไม่เจอ */
  teams?: string[];
  /** แมตช์ที่บทความเล่าถึง (รู้ฝั่งเหย้า/เยือนจริงจาก DB) — ปลดล็อกชั้นภาพสนาม/โลโก้ */
  fixture?: ResolvedFixture | null;
  /** หาโลโก้จากชื่อทีม — ผู้เรียกผูกกับตาราง teams ผ่าน sameTeam เอง เพราะชื่อจากตารางฉายา
      ("Manchester City") กับชื่อใน DB ("Manchester City FC") เทียบตรงตัวไม่ติด */
  crestFor?: (team: string) => string | null;
};

/** ชั้นที่ให้ภาพออกมาจริง — ให้ backfill/cron พิมพ์บอกได้ว่าแต่ละใบมาจากไหน */
export type CoverLayer = "stadium" | "logos" | "news" | "pexels" | "stock";

export type CoverResult = { urls: string[]; layer: CoverLayer };

// ลำดับการหา (บทความที่ผูกกับแมตช์ได้):
//   1. ภาพสนามเจ้าบ้าน — เกี่ยวกับเกมนั้นแน่นอน และดูเป็นสื่อฟุตบอลจริง
//   2. โลโก้เหย้า vs เยือน — เกี่ยวกับเกมนั้น 100% เพราะมาจาก DB เราเอง
//   3. รูปจากข่าว → Pexels → รูปสต็อกในโค้ด (ชุดเดิม)
// บทความที่ไม่ผูกกับแมตช์ (ตลาดซื้อขายรวม ๆ, สรุปหลายเกม) ข้ามสองชั้นแรกไปเลย
//
// เดิมเอารูปข่าวขึ้นก่อน แต่พบว่ารูปที่ RSS แนบมาบ่อยครั้งเป็นภาพประกอบข่าวอื่นที่แค่ติดมากับ feed
// ไม่เกี่ยวกับเกมในพาดหัวจริง สนามเจ้าบ้านแม้จะ "จำเพาะ" น้อยกว่าภาพจากเกม แต่ไม่มีทางผิดเกม
export async function fetchTopicCoverImages(
  seasonName: string,
  topic: ArticleTopic,
  title: string,
  context: CoverContext = {},
): Promise<CoverResult> {
  const fallback = fallbackCoverImages(topic);
  const { knownTeams, teams = [], fixture, crestFor } = context;
  const withFallback = (image: string, layer: CoverLayer): CoverResult => ({
    urls: [image, ...fallback].slice(0, 6),
    layer,
  });

  if (topic === "match" || topic === "preview") {
    // ไม่มี fixture จริงก็เดาจากพาดหัว — หน้าต่างข้อมูลของบทความแคบ (ผลย้อนหลัง 2 วัน,
    // โปรแกรมแค่วันนี้) บทความ preview สุดสัปดาห์ที่เขียนวันศุกร์จึงหา fixture ไม่เจอเป็นปกติ
    // ทีมแรกในพาดหัวอาจไม่ใช่เจ้าบ้านจริง แต่สนามของทีมที่ถูกเอ่ยถึงยังตรงเรื่องกว่า
    // ภาพข่าวสุ่ม ๆ มาก และแบนเนอร์โลโก้ก็แค่สลับซ้ายขวาเท่านั้น ไม่มีอะไรผิดสาระ
    const homeTeam = fixture?.homeTeam ?? teams[0];
    if (homeTeam) {
      const stadiumImage = await fetchStadiumImage(homeTeam);
      if (stadiumImage) return withFallback(stadiumImage, "stadium");
    }

    const pair =
      fixture ??
      (teams.length >= 2 ? { homeTeam: teams[0], awayTeam: teams[1] } : null);
    if (pair && crestFor) {
      const homeCrest = crestFor(pair.homeTeam);
      const awayCrest = crestFor(pair.awayTeam);
      if (homeCrest && awayCrest) {
        return withFallback(vsBannerUrl(homeCrest, awayCrest), "logos");
      }
    }
  }

  const newsImage = await newsImageFor(topic, seasonName, title, knownTeams);
  if (newsImage) return withFallback(newsImage, "news");

  // เรียงคำค้นใหม่ตามพาดหัวด้วย บทความคนละใบจึงเริ่มจากคำค้นคนละอัน ได้ภาพต่างกันอีกชั้นหนึ่ง
  for (const query of pexelsQueriesFor(topic, title)) {
    const stockImage = await searchPexelsPhoto(query, title);
    if (stockImage) return withFallback(stockImage, "pexels");
  }

  return { urls: fallback, layer: "stock" };
}
