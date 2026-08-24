const FOOTBALL_DATA_BASE = 'https://api.football-data.org/v4';

// ใช้ร่วมกันทุก script ที่คุย football-data.org (sync-fixtures.ts, sync-results.ts)
// token อ่านจาก process.env เท่านั้น ห้าม hardcode
export async function fdFetch<T>(pathname: string): Promise<T> {
  const token = process.env.FOOTBALL_DATA_API_TOKEN;
  if (!token) {
    throw new Error('Missing FOOTBALL_DATA_API_TOKEN ใน .env.local');
  }
  const res = await fetch(`${FOOTBALL_DATA_BASE}${pathname}`, {
    headers: { 'X-Auth-Token': token },
  });
  if (!res.ok) {
    throw new Error(`football-data.org ${pathname} ล้มเหลว: ${res.status} ${await res.text()}`);
  }
  return res.json() as Promise<T>;
}

export type FdMatch = {
  id: number;
  utcDate: string;
  status: string;
  matchday: number;
  homeTeam: { id: number; name: string };
  awayTeam: { id: number; name: string };
  score: { fullTime: { home: number | null; away: number | null } };
};
