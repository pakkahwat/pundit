import { sqlClient } from '@/db/client';
import { fdFetch } from '@/lib/jobs/sync-results';

import { cachedFetchJson } from './cache';

export type TeamMatch = {
  id: number;
  utcDate: string;
  status: string;
  matchday: number | null;
  competition: { code: string; name: string; emblem: string };
  homeTeam: { id: number; name: string; shortName: string | null; crest: string | null };
  awayTeam: { id: number; name: string; shortName: string | null; crest: string | null };
  score: { fullTime: { home: number | null; away: number | null } };
};

type TeamResponse = {
  id: number;
  name: string;
  shortName: string | null;
  tla: string | null;
  crest: string | null;
  venue: string | null;
  website: string | null;
  founded: number | null;
};

// โปรแกรมแข่งของทีมดึงจาก API ไม่ใช่จากตาราง matches ในระบบ เพราะ DB เราเก็บเฉพาะลีกที่ sync ไว้
// แต่ทีมหนึ่งลงแข่งหลายรายการ (ลีก, ถ้วยในประเทศ, ยุโรป) ซึ่งคนดูอยากเห็นครบ
// แคช 1 ชั่วโมง — โปรแกรมแข่งเปลี่ยนน้อยกว่าตารางคะแนนมาก
const TTL_SECONDS = 60 * 60;

export async function getTeamWithMatches(teamId: number) {
  const [team, matches] = await Promise.all([
    cachedFetchJson<TeamResponse>(sqlClient, `team:${teamId}`, TTL_SECONDS, () =>
      fdFetch<TeamResponse>(`/teams/${teamId}`),
    ),
    cachedFetchJson<{ matches: TeamMatch[] }>(
      sqlClient,
      `team:${teamId}:matches`,
      TTL_SECONDS,
      () => fdFetch<{ matches: TeamMatch[] }>(`/teams/${teamId}/matches?limit=100`),
    ),
  ]);

  const all = matches.data.matches ?? [];
  const finished = all
    .filter((m) => m.status === 'FINISHED')
    .sort((a, b) => b.utcDate.localeCompare(a.utcDate));
  const upcoming = all
    .filter((m) => m.status !== 'FINISHED')
    .sort((a, b) => a.utcDate.localeCompare(b.utcDate));

  return { team: team.data, upcoming, finished, stale: team.stale || matches.stale };
}
