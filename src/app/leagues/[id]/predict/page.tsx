import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { redirect } from 'next/navigation';

import { auth } from '@/auth';
import {
  Card,
  CenteredMessage,
  EmptyState,
  LinkButton,
  PageHeader,
  PageShell,
} from '@/components/ui';
import { db } from '@/db/client';
import { withUserContext } from '@/db/rls';
import { leagueMembers, leagues, matches, predictions, seasons, teams } from '@/db/schema';
import { formatKickoff, isMatchLocked } from '@/lib/match-time';

import { H2hDialog } from '@/components/h2h-dialog';

import { PredictionForm } from './prediction-form';

export default async function PredictPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) {
    redirect('/');
  }
  // ดึงออกมาเป็นตัวแปรเดี่ยว ๆ เพราะ TS narrowing ของ session?.user?.id ด้านบนไม่ไหลเข้าไปใน
  // closure ของ withUserContext ด้านล่าง (จำกัดของ TS เอง ไม่ใช่บั๊ก)
  const userId = session.user.id;

  const [league] = await db.select().from(leagues).where(eq(leagues.id, id)).limit(1);
  if (!league) {
    return <CenteredMessage title="ไม่พบลีกนี้" />;
  }

  const [membership] = await db
    .select()
    .from(leagueMembers)
    .where(and(eq(leagueMembers.leagueId, id), eq(leagueMembers.userId, userId)))
    .limit(1);
  if (!membership) {
    return <CenteredMessage title="คุณไม่ได้เป็นสมาชิกลีกนี้" />;
  }

  const [season] = await db.select().from(seasons).where(eq(seasons.id, league.seasonId)).limit(1);
  const currentMatchday = season?.currentMatchday ?? 1;

  const homeTeams = alias(teams, 'home_teams');
  const awayTeams = alias(teams, 'away_teams');

  const matchRows = await db
    .select({
      id: matches.id,
      kickoffAt: matches.kickoffAt,
      homeTeamName: homeTeams.name,
      awayTeamName: awayTeams.name,
      status: matches.status,
      homeScore: matches.homeScore,
      awayScore: matches.awayScore,
      externalId: matches.externalId,
    })
    .from(matches)
    .innerJoin(homeTeams, eq(matches.homeTeamId, homeTeams.id))
    .innerJoin(awayTeams, eq(matches.awayTeamId, awayTeams.id))
    .where(and(eq(matches.seasonId, league.seasonId), eq(matches.matchday, currentMatchday)))
    // เรียงให้นัดที่ยังทายได้อยู่บนสุดเสมอ แล้วค่อยตามด้วยนัดที่ปิดรับไปแล้ว ภายในแต่ละกลุ่ม
    // เรียงตามเวลาแข่งจากใกล้ไปไกล — ทำใน SQL ไม่ใช่ sort ใน JS เพราะเงื่อนไข "ปิดรับหรือยัง"
    // ต้องเทียบกับ now() ของ Postgres ตัวเดียวกับที่ใช้บังคับเวลาปิดรับตอนบันทึกคำทาย
    // (ถ้าเทียบด้วยนาฬิกาของ Node แยกต่างหาก มีโอกาสไม่ตรงกันจนลำดับเพี้ยนช่วงคาบเกี่ยว)
    .orderBy(sql`(${matches.kickoffAt} <= now()) asc`, asc(matches.kickoffAt));

  const matchIds = matchRows.map((m) => m.id);
  const myPredictions = matchIds.length
    ? await withUserContext(userId, (tx) =>
        tx
          .select()
          .from(predictions)
          .where(and(eq(predictions.userId, userId), inArray(predictions.matchId, matchIds))),
      )
    : [];
  const predictionByMatchId = new Map(myPredictions.map((p) => [p.matchId, p]));

  const openCount = matchRows.filter((m) => !isMatchLocked(m.kickoffAt)).length;

  return (
    <PageShell>
      <PageHeader
        title={`แมตช์เดย์ ${currentMatchday}`}
        subtitle={
          matchRows.length > 0
            ? `${league.name} · ยังทายได้ ${openCount} จาก ${matchRows.length} นัด`
            : league.name
        }
        actions={
          <LinkButton href={`/leagues/${id}`} variant="secondary">
            กลับหน้าลีก
          </LinkButton>
        }
      />

      {matchRows.length === 0 ? (
        <EmptyState>ยังไม่มีนัดในแมตช์เดย์นี้ (ลองรัน sync fixtures ใหม่)</EmptyState>
      ) : (
        <ul className="flex flex-col gap-3">
          {matchRows.map((m) => {
            const existing = predictionByMatchId.get(m.id);
            const locked = isMatchLocked(m.kickoffAt);
            const finished = m.status === 'FINISHED' && m.homeScore != null && m.awayScore != null;
            // ไฮไลต์เฉพาะตอนแข่งจบแล้วเท่านั้น ระหว่างแข่งอยู่ยังไม่ชี้ว่าใครชนะ เพราะสกอร์เปลี่ยนได้
            const homeWon = finished && m.homeScore! > m.awayScore!;
            const awayWon = finished && m.homeScore! < m.awayScore!;
            const teamClass = (won: boolean, lost: boolean) =>
              won ? 'font-semibold text-success' : lost ? 'text-muted' : 'text-foreground';

            return (
              <li key={m.id}>
                <Card className={locked && !finished ? 'opacity-60' : undefined}>
                  <div className="mb-3 flex items-baseline justify-between gap-3">
                    <span className="font-medium">
                      <span className={teamClass(homeWon, awayWon)}>{m.homeTeamName}</span>{' '}
                      {finished ? (
                        <span className="mx-1 rounded bg-surface-hover px-2 py-0.5 text-sm tabular-nums text-foreground">
                          {m.homeScore}-{m.awayScore}
                        </span>
                      ) : (
                        <span className="text-muted">vs</span>
                      )}{' '}
                      <span className={teamClass(awayWon, homeWon)}>{m.awayTeamName}</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-3">
                      <H2hDialog
                        matchExternalId={m.externalId}
                        homeTeam={m.homeTeamName}
                        awayTeam={m.awayTeamName}
                      />
                      <span className="text-xs text-muted">
                        {finished ? 'จบแล้ว' : formatKickoff(m.kickoffAt)}
                      </span>
                    </span>
                  </div>
                  <PredictionForm
                    matchId={m.id}
                    homeTeam={m.homeTeamName}
                    awayTeam={m.awayTeamName}
                    defaultOutcome={existing?.predictedOutcome}
                    locked={locked}
                  />
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </PageShell>
  );
}
