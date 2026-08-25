import { sqlClient } from '@/db/client';
import { fdFetch } from '@/lib/jobs/sync-results';

import { cachedFetchJson } from './cache';

export type H2hMatch = {
  id: number;
  utcDate: string;
  competition: { name: string };
  homeTeam: { id: number; name: string; shortName: string | null; crest: string | null };
  awayTeam: { id: number; name: string; shortName: string | null; crest: string | null };
  score: { fullTime: { home: number | null; away: number | null } };
};

export type H2hResult = {
  aggregates: {
    numberOfMatches: number;
    totalGoals: number;
    homeTeam: { id: number; name: string; wins: number; draws: number; losses: number };
    awayTeam: { id: number; name: string; wins: number; draws: number; losses: number };
  };
  matches: H2hMatch[];
};

// สถิติการเจอกันของคู่นี้ — API ให้มาผูกกับ "แมตช์" ไม่ใช่ผูกกับคู่ทีม เลยต้องใช้ external_id
// ของแมตช์ที่กำลังจะแข่ง (ซึ่งเราเก็บไว้ในตาราง matches ตอน sync อยู่แล้ว)
//
// แคชยาว 6 ชั่วโมง เพราะประวัติการเจอกันในอดีตแทบไม่เปลี่ยน จะเปลี่ยนก็ต่อเมื่อคู่นี้เพิ่งแข่งจบ
// ซึ่งตอนนั้นแมตช์ที่เราถามก็ไม่ใช่แมตช์ที่ยังไม่แข่งแล้ว
const TTL_SECONDS = 6 * 60 * 60;

export async function getHeadToHead(matchExternalId: number, limit = 10) {
  const { data } = await cachedFetchJson<H2hResult>(
    sqlClient,
    `h2h:${matchExternalId}:${limit}`,
    TTL_SECONDS,
    () => fdFetch<H2hResult>(`/matches/${matchExternalId}/head2head?limit=${limit}`),
  );
  return data;
}
