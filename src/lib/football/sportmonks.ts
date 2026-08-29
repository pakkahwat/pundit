const SPORTMONKS_BASE_URL = "https://api.sportmonks.com/v3/football";
// seasons.externalCompetitionId เป็น ID ของ football-data.org จึงใช้แทน SportMonks league ID ไม่ได้
// พรีเมียร์ลีกมี SportMonks league ID = 8 และ live endpoint จำกัดไว้ลีกเดียวตาม product scope
const SPORTMONKS_PREMIER_LEAGUE_ID = 8;

// สิ่งเดียวที่เราเอาจาก SportMonks คือ "สกอร์สด + สถานะ" ของนัดที่กำลังเตะอยู่เท่านั้น
//
// ตัวโปรแกรมแข่งเอง (id, คิกออฟ, แมตช์เดย์, โลโก้ทีม) ยังใช้ของ football-data.org ใน DB เราเหมือนเดิม
// เพราะนั่นคือชุดข้อมูลที่ผูกกับคำทายและการคิดคะแนน ถ้าเอาแมตช์ของ SportMonks มาแสดงแทนทั้งดุ้น
// id จะคนละชุดกันทันที เชื่อมกลับไปหาคำทายของผู้ใช้ไม่ได้เลย — ดู lib/matches/today.ts
export type SportMonksLiveEvent = {
  /** นาทีในเกมจากกรรมการ + ทดเวลา (เช่น 45+2 คือ minute 45, extraMinute 2) */
  minute: number | null;
  extraMinute: number | null;
  playerName: string | null;
  side: "home" | "away";
  kind: "goal" | "owngoal" | "penalty" | "redcard";
};

export type SportMonksLiveMatch = {
  /** ISO 8601 ลงท้ายด้วย Z เสมอ (normalize แล้ว ดู toIsoUtc) */
  kickoffAt: string;
  status: string;
  homeTeam: string;
  awayTeam: string;
  homeScore: number | null;
  awayScore: number | null;
  /** นาทีจริงในเกมจากนาฬิกากรรมการ (periods ของ SportMonks) — null ตอนพักครึ่ง/ไม่มีข้อมูล */
  minute: number | null;
  events: SportMonksLiveEvent[];
};

type SportMonksParticipant = {
  id?: number;
  name?: string;
  meta?: { location?: "home" | "away" };
};

type SportMonksScore = {
  participant_id?: number;
  score?: { goals?: number | null };
};

type SportMonksPeriod = {
  ticking?: boolean;
  minutes?: number | null;
};

type SportMonksEvent = {
  participant_id?: number;
  player_name?: string | null;
  minute?: number | null;
  extra_minute?: number | null;
  type?: { developer_name?: string | null } | null;
};

type SportMonksFixture = {
  id?: number;
  starting_at?: string;
  state?: { short_name?: string; name?: string };
  participants?: SportMonksParticipant[];
  scores?: SportMonksScore[];
  periods?: SportMonksPeriod[];
  events?: SportMonksEvent[];
};

type SportMonksResponse = {
  data?: SportMonksFixture[];
};

// SportMonks ส่ง starting_at มาเป็น "2026-08-27 19:00:00" — เป็นเวลา UTC แต่ไม่มี Z ต่อท้าย
//
// ถ้าโยนสตริงแบบนี้เข้า new Date() ตรง ๆ JS จะตีความเป็น "เวลาท้องถิ่นของเครื่องที่รัน" ไม่ใช่ UTC
// บน Vercel (timezone UTC) จึงบังเอิญถูก แต่บนเครื่อง dev ที่ไทยจะเพี้ยนไป 7 ชั่วโมง และที่แย่กว่านั้น
// คือ server กับ browser จะได้คนละค่าจากสตริงเดียวกัน ทำให้ React ฟ้อง hydration mismatch
// เลย normalize ให้เป็น ISO ที่มี Z เสมอตั้งแต่ตรงนี้ ปลายทางจะได้ไม่ต้องรู้เรื่องนี้อีก
function toIsoUtc(startingAt: string): string | null {
  const hasZone = /([zZ]|[+-]\d{2}:?\d{2})$/.test(startingAt);
  const iso = startingAt.replace(" ", "T");
  const parsed = new Date(hasZone ? iso : `${iso}Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function participant(
  participants: SportMonksParticipant[],
  location: "home" | "away",
) {
  return participants.find((item) => item.meta?.location === location);
}

/**
 * นาทีจริงในเกม จาก periods — พีเรียดที่ `ticking: true` คือช่วงที่นาฬิกากำลังเดิน และ `minutes`
 * ของมันคือนาทีบนสกอร์บอร์ดจริง (ครึ่งหลังนับต่อจาก 45 ให้แล้ว) ตอนพักครึ่งไม่มีอะไร ticking
 * จึงคืน null — ผู้เรียกใช้ state ("HT") แสดงคำว่าพักครึ่งแทนตัวเลข
 *
 * นี่คือเหตุผลที่เลิกคำนวณนาทีเองจากเวลาคิกออฟ: วิธีนั้นนับพักครึ่งเป็นนาทีในเกมไปด้วย
 * (นาทีจริง 45–60 บนนาฬิกาโลก = ยังพักอยู่) และไม่มีทางรู้เวลาทดเจ็บ
 */
export function minuteFromPeriods(
  periods: SportMonksPeriod[] | undefined,
): number | null {
  const ticking = (periods ?? []).find((period) => period.ticking === true);
  return typeof ticking?.minutes === "number" ? ticking.minutes : null;
}

// developer_name ของ event type ที่เราสนใจ → ชนิดที่หน้าเว็บรู้จัก เหตุการณ์อื่น (เปลี่ยนตัว,
// ใบเหลือง, VAR) จงใจไม่เอา — การ์ดหน้าแรกมีที่แค่บรรทัดสั้น ๆ เอาเฉพาะที่เปลี่ยนเกมจริง
const EVENT_KINDS: Record<string, SportMonksLiveEvent["kind"]> = {
  GOAL: "goal",
  OWNGOAL: "owngoal",
  PENALTY: "penalty",
  REDCARD: "redcard",
  YELLOWREDCARD: "redcard",
};

export function mapEvents(
  events: SportMonksEvent[] | undefined,
  homeParticipantId: number | undefined,
): SportMonksLiveEvent[] {
  return (events ?? [])
    .map((event): SportMonksLiveEvent | null => {
      const kind = EVENT_KINDS[event.type?.developer_name ?? ""];
      if (!kind) return null;
      return {
        kind,
        minute: typeof event.minute === "number" ? event.minute : null,
        extraMinute:
          typeof event.extra_minute === "number" ? event.extra_minute : null,
        playerName: event.player_name ?? null,
        side: event.participant_id === homeParticipantId ? "home" : "away",
      };
    })
    .filter((event): event is SportMonksLiveEvent => event !== null)
    .sort((a, b) => (a.minute ?? 0) - (b.minute ?? 0));
}

function scoreFor(
  scores: SportMonksScore[],
  participantId: number | undefined,
): number | null {
  const score = scores.find((item) => item.participant_id === participantId)
    ?.score?.goals;
  return typeof score === "number" ? score : null;
}

/** null = ไม่ได้ตั้ง token, API ล่ม หรือตอบไม่ ok — ปลายทางให้ fallback ไปใช้สกอร์ใน DB */
export async function getSportMonksPremierLeagueLive(): Promise<
  SportMonksLiveMatch[] | null
> {
  const token = process.env.SPORTMONKS_API_TOKEN;
  if (!token) return null;

  const url = new URL(`${SPORTMONKS_BASE_URL}/livescores/inplay`);
  url.searchParams.set("api_token", token);
  // events.type คือ nested include — ให้ชื่อชนิดเหตุการณ์ (developer_name) ติดมากับ event เลย
  // ไม่ต้องจำ type_id เป็นเลขวิเศษ; include เพิ่มไม่เสียเงินและไม่กินโควตาเพิ่ม เป็น call เดิม
  url.searchParams.set("include", "participants;scores;state;periods;events.type");
  url.searchParams.set("leagues", String(SPORTMONKS_PREMIER_LEAGUE_ID));

  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      next: { revalidate: 30 },
    });
    if (!response.ok) return null;

    const payload = (await response.json()) as SportMonksResponse;

    return (payload.data ?? [])
      .map((fixture) => {
        const participants = fixture.participants ?? [];
        const home = participant(participants, "home");
        const away = participant(participants, "away");
        if (!fixture.starting_at || !home?.name || !away?.name) return null;

        const kickoffAt = toIsoUtc(fixture.starting_at);
        if (!kickoffAt) return null;

        return {
          kickoffAt,
          status: fixture.state?.short_name ?? fixture.state?.name ?? "LIVE",
          homeTeam: home.name,
          awayTeam: away.name,
          homeScore: scoreFor(fixture.scores ?? [], home.id),
          awayScore: scoreFor(fixture.scores ?? [], away.id),
          minute: minuteFromPeriods(fixture.periods),
          events: mapEvents(fixture.events, home.id),
        } satisfies SportMonksLiveMatch;
      })
      .filter((match): match is SportMonksLiveMatch => match !== null);
  } catch {
    return null;
  }
}
