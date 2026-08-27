const SPORTMONKS_BASE_URL = "https://api.sportmonks.com/v3/football";
// seasons.externalCompetitionId เป็น ID ของ football-data.org จึงใช้แทน SportMonks league ID ไม่ได้
// พรีเมียร์ลีกมี SportMonks league ID = 8 และ live endpoint จำกัดไว้ลีกเดียวตาม product scope
const SPORTMONKS_PREMIER_LEAGUE_ID = 8;

export type SportMonksLiveMatch = {
  id: string;
  kickoffAt: string;
  status: string;
  homeTeam: string;
  awayTeam: string;
  homeCrest: string | null;
  awayCrest: string | null;
  homeScore: number | null;
  awayScore: number | null;
  matchday: number;
  secondsSinceKickoff: number;
};

type SportMonksParticipant = {
  id?: number;
  name?: string;
  image_path?: string | null;
  meta?: { location?: "home" | "away" };
};

type SportMonksScore = {
  participant_id?: number;
  score?: { goals?: number | null };
};

type SportMonksFixture = {
  id?: number;
  starting_at?: string;
  state?: { short_name?: string; name?: string };
  round?: { name?: string; round?: number } | null;
  participants?: SportMonksParticipant[];
  scores?: SportMonksScore[];
};

type SportMonksResponse = {
  data?: SportMonksFixture[];
};

function participant(
  participants: SportMonksParticipant[],
  location: "home" | "away",
) {
  return participants.find((item) => item.meta?.location === location);
}

function scoreFor(
  scores: SportMonksScore[],
  participantId: number | undefined,
): number | null {
  const score = scores.find((item) => item.participant_id === participantId)
    ?.score?.goals;
  return typeof score === "number" ? score : null;
}

function matchdayOf(fixture: SportMonksFixture): number {
  const value = fixture.round?.round;
  return typeof value === "number" ? value : 0;
}

export async function getSportMonksPremierLeagueLive(): Promise<
  SportMonksLiveMatch[] | null
> {
  const token = process.env.SPORTMONKS_API_TOKEN;
  if (!token) return null;

  const url = new URL(`${SPORTMONKS_BASE_URL}/livescores/inplay`);
  url.searchParams.set("api_token", token);
  url.searchParams.set("include", "participants;scores;state;round");
  url.searchParams.set("leagues", String(SPORTMONKS_PREMIER_LEAGUE_ID));

  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      next: { revalidate: 30 },
    });
    if (!response.ok) return null;

    const payload = (await response.json()) as SportMonksResponse;
    const now = Date.now();

    return (payload.data ?? [])
      .map((fixture) => {
        const participants = fixture.participants ?? [];
        const home = participant(participants, "home");
        const away = participant(participants, "away");
        if (!fixture.id || !fixture.starting_at || !home?.name || !away?.name)
          return null;

        const kickoffAt = fixture.starting_at;
        return {
          id: `sportmonks-${fixture.id}`,
          kickoffAt,
          status: fixture.state?.short_name ?? fixture.state?.name ?? "LIVE",
          homeTeam: home.name,
          awayTeam: away.name,
          homeCrest: home.image_path ?? null,
          awayCrest: away.image_path ?? null,
          homeScore: scoreFor(fixture.scores ?? [], home.id),
          awayScore: scoreFor(fixture.scores ?? [], away.id),
          matchday: matchdayOf(fixture),
          secondsSinceKickoff: Math.max(
            0,
            Math.floor((now - Date.parse(kickoffAt)) / 1000),
          ),
        } satisfies SportMonksLiveMatch;
      })
      .filter((match): match is SportMonksLiveMatch => match !== null);
  } catch {
    return null;
  }
}
