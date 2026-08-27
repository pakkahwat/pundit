import { and, asc, eq, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import {
  Card,
  EmptyState,
  LinkButton,
  PageHeader,
  PageShell,
} from "@/components/ui";
import { TeamCrest } from "@/components/team-crest";
import { db } from "@/db/client";
import { leagueMembers, leagues, matches, seasons, teams } from "@/db/schema";
import { formatKickoff } from "@/lib/match-time";
import { competitionByCode } from "@/lib/football/competitions";
import { getCurrentMatchday } from "@/lib/matches/current-matchday";

type SearchParams = Promise<{
  competition?: string | string[];
  md?: string | string[];
}>;

export default async function FixturesPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/");

  const params = await searchParams;
  const requestedCode = Array.isArray(params.competition)
    ? params.competition[0]
    : params.competition;
  const seasonsForUser = await db
    .select({
      id: seasons.id,
      name: seasons.name,
      competitionCode: seasons.competitionCode,
    })
    .from(leagueMembers)
    .innerJoin(leagues, eq(leagueMembers.leagueId, leagues.id))
    .innerJoin(seasons, eq(leagues.seasonId, seasons.id))
    .where(eq(leagueMembers.userId, session.user.id))
    .orderBy(asc(seasons.competitionCode));
  const uniqueSeasons = [
    ...new Map(seasonsForUser.map((season) => [season.id, season])).values(),
  ];
  const selectedSeason =
    uniqueSeasons.find((season) => season.competitionCode === requestedCode) ??
    uniqueSeasons[0];

  if (!selectedSeason) {
    return (
      <PageShell width="lg">
        <PageHeader
          title="โปรแกรมแข่ง"
          subtitle="ดูโปรแกรมและผลการแข่งขันของลีกที่คุณอยู่"
        />
        <EmptyState>ยังไม่ได้เข้าร่วมลีกใด</EmptyState>
      </PageShell>
    );
  }

  const currentMatchday = await getCurrentMatchday(selectedSeason.id);
  const [range] = await db
    .select({
      minMd: sql<number>`min(${matches.matchday})`,
      maxMd: sql<number>`max(${matches.matchday})`,
    })
    .from(matches)
    .where(eq(matches.seasonId, selectedSeason.id));
  const minMatchday = range?.minMd ?? currentMatchday;
  const maxMatchday = range?.maxMd ?? currentMatchday;
  const rawMatchday = Number(
    Array.isArray(params.md) ? params.md[0] : params.md,
  );
  const selectedMatchday = Number.isInteger(rawMatchday)
    ? Math.min(Math.max(rawMatchday, minMatchday), maxMatchday)
    : currentMatchday;

  const homeTeams = alias(teams, "fixture_home_teams");
  const awayTeams = alias(teams, "fixture_away_teams");
  const matchRows = await db
    .select({
      id: matches.id,
      kickoffAt: matches.kickoffAt,
      homeTeamName: homeTeams.name,
      awayTeamName: awayTeams.name,
      homeCrest: homeTeams.crestUrl,
      awayCrest: awayTeams.crestUrl,
      status: matches.status,
      homeScore: matches.homeScore,
      awayScore: matches.awayScore,
    })
    .from(matches)
    .innerJoin(homeTeams, eq(matches.homeTeamId, homeTeams.id))
    .innerJoin(awayTeams, eq(matches.awayTeamId, awayTeams.id))
    .where(
      and(
        eq(matches.seasonId, selectedSeason.id),
        eq(matches.matchday, selectedMatchday),
      ),
    )
    .orderBy(asc(matches.kickoffAt));

  const competitionName =
    competitionByCode(selectedSeason.competitionCode)?.shortName ??
    selectedSeason.name;
  const href = (matchday: number) =>
    `/fixtures?competition=${selectedSeason.competitionCode}&md=${matchday}`;

  return (
    <PageShell width="lg">
      <PageHeader
        title="โปรแกรมแข่ง"
        subtitle={`${competitionName} · ดูโปรแกรมและผลการแข่งขัน`}
        actions={
          <LinkButton href="/" variant="secondary">
            กลับหน้าแรก
          </LinkButton>
        }
      />
      <nav className="mb-5 flex flex-wrap gap-2" aria-label="เลือกลีก">
        {uniqueSeasons.map((season) => (
          <Link
            key={season.id}
            href={`/fixtures?competition=${season.competitionCode}`}
            className={`rounded-lg border px-3 py-1.5 text-sm transition-colors ${season.id === selectedSeason.id ? "border-transparent bg-accent text-accent-fg" : "border-border text-muted hover:bg-surface-hover hover:text-foreground"}`}
          >
            {competitionByCode(season.competitionCode)?.shortName ??
              season.name}
          </Link>
        ))}
      </nav>
      <div className="mb-4 flex items-center justify-between gap-3">
        {selectedMatchday > minMatchday ? (
          <Link
            href={href(selectedMatchday - 1)}
            aria-label="แมตช์เดย์ก่อนหน้า"
            className="rounded-lg border border-border px-3 py-2 text-sm text-foreground hover:bg-surface-hover"
          >
            ←
          </Link>
        ) : (
          <span className="w-9" />
        )}
        <div className="text-center">
          <p className="font-display text-lg font-semibold text-foreground">
            แมตช์เดย์ {selectedMatchday}
          </p>
          {selectedMatchday === currentMatchday ? (
            <p className="text-xs text-accent">แมตช์เดย์ปัจจุบัน</p>
          ) : (
            <Link
              href={href(currentMatchday)}
              className="text-xs text-muted hover:text-foreground hover:underline"
            >
              กลับไปแมตช์เดย์ปัจจุบัน
            </Link>
          )}
        </div>
        {selectedMatchday < maxMatchday ? (
          <Link
            href={href(selectedMatchday + 1)}
            aria-label="แมตช์เดย์ถัดไป"
            className="rounded-lg border border-border px-3 py-2 text-sm text-foreground hover:bg-surface-hover"
          >
            →
          </Link>
        ) : (
          <span className="w-9" />
        )}
      </div>
      {matchRows.length === 0 ? (
        <EmptyState>ยังไม่มีโปรแกรมในแมตช์เดย์ {selectedMatchday}</EmptyState>
      ) : (
        <ul className="flex flex-col gap-3">
          {matchRows.map((match) => {
            const finished =
              match.status === "FINISHED" &&
              match.homeScore != null &&
              match.awayScore != null;
            const homeWon = finished && match.homeScore! > match.awayScore!;
            const awayWon = finished && match.homeScore! < match.awayScore!;
            return (
              <li key={match.id}>
                <Card>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-5">
                    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-2 font-medium">
                      <span
                        className={`flex min-w-0 items-center gap-2 ${homeWon ? "font-semibold text-success" : awayWon ? "text-muted" : "text-foreground"}`}
                      >
                        <TeamCrest src={match.homeCrest} size={22} />
                        <span className="break-words">
                          {match.homeTeamName}
                        </span>
                      </span>
                      <span className="shrink-0 rounded bg-surface-hover px-2 py-0.5 text-sm tabular-nums text-foreground">
                        {finished
                          ? `${match.homeScore}-${match.awayScore}`
                          : "vs"}
                      </span>
                      <span
                        className={`flex min-w-0 items-center gap-2 ${awayWon ? "font-semibold text-success" : homeWon ? "text-muted" : "text-foreground"}`}
                      >
                        <TeamCrest src={match.awayCrest} size={22} />
                        <span className="break-words">
                          {match.awayTeamName}
                        </span>
                      </span>
                    </div>
                    <span className="shrink-0 text-xs text-muted sm:text-right">
                      {finished ? "จบแล้ว" : formatKickoff(match.kickoffAt)}
                    </span>
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </PageShell>
  );
}
