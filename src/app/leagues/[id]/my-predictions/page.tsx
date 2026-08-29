import { and, desc, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { LeagueNav } from "@/components/league-nav";
import { TeamCrest } from "@/components/team-crest";
import {
  Card,
  CenteredMessage,
  EmptyState,
  PageHeader,
  PageShell,
  SectionLabel,
} from "@/components/ui";
import { db } from "@/db/client";
import { withUserContext } from "@/db/rls";
import {
  leagueMembers,
  leagues,
  matches,
  predictionScores,
  predictions,
  teams,
} from "@/db/schema";
import { formatKickoff } from "@/lib/match-time";
import { pendingPredictionCount } from "@/lib/leagues/pending";
import { getCurrentMatchday } from "@/lib/matches/current-matchday";
import {
  outcomeLabel,
  type PredictionOutcome,
} from "@/lib/predictions/outcome";

// "คำทายของฉัน" — ประวัติการทายทั้งหมดของผู้ใช้คนนี้ในลีกนี้ ที่เดียวจบ
//
// ต่างจากหน้า reveal ตรงเจตนา: reveal คือ "ดูของทุกคนหลังล็อกแล้ว" ส่วนหน้านี้คือ "ของฉันล้วน ๆ
// รวมนัดที่ยังไม่เตะ" — RLS อนุญาตให้เจ้าของอ่านคำทายตัวเองได้เสมอไม่ต้องรอคิกออฟ
// (policy predictions_select_own_or_locked) จึงโชว์คำทายล่วงหน้าของตัวเองได้โดยไม่รั่วของใคร
// โครงสร้างระดับฐานข้อมูลรับประกันอยู่แล้วว่าต่อให้ query เขียนพลาด ก็ไม่มีทางเห็นของคนอื่น
//
// คะแนนอ่านจาก prediction_scores ของ "ลีกนี้" เท่านั้น — คำทายหนึ่งอันถูกคิดคะแนนแยกทุกลีก
// ที่ผู้ใช้อยู่ (คนเดียวอยู่หลายลีกได้) เอาลีกอื่นมาปนตัวเลขจะไม่ตรงกับหน้าอันดับของลีกนี้

type MyPredictionRow = {
  matchId: string;
  matchday: number;
  kickoffAt: Date;
  status: string;
  homeTeam: string;
  awayTeam: string;
  homeCrest: string | null;
  awayCrest: string | null;
  homeScore: number | null;
  awayScore: number | null;
  predicted: PredictionOutcome;
  pointsAwarded: number | null;
};

function actualOutcomeOf(row: MyPredictionRow): PredictionOutcome | null {
  if (row.status !== "FINISHED" || row.homeScore == null || row.awayScore == null)
    return null;
  if (row.homeScore > row.awayScore) return "HOME";
  if (row.homeScore < row.awayScore) return "AWAY";
  return "DRAW";
}

export default async function MyPredictionsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) redirect("/");
  const userId = session.user.id;

  const [league] = await db
    .select()
    .from(leagues)
    .where(eq(leagues.id, id))
    .limit(1);
  if (!league) return <CenteredMessage title="ไม่พบลีกนี้" />;

  // เช็ค membership ก่อนโชว์อะไรทั้งนั้น — แนวเดียวกับทุกหน้าในลีก
  const [membership] = await db
    .select()
    .from(leagueMembers)
    .where(
      and(eq(leagueMembers.leagueId, id), eq(leagueMembers.userId, userId)),
    )
    .limit(1);
  if (!membership) return <CenteredMessage title="คุณไม่ได้เป็นสมาชิกลีกนี้" />;

  const currentMatchday = await getCurrentMatchday(league.seasonId);
  const pendingCount = await pendingPredictionCount(
    league.seasonId,
    currentMatchday,
    userId,
  );

  const homeTeams = alias(teams, "my_pred_home");
  const awayTeams = alias(teams, "my_pred_away");

  // ต้องผ่าน withUserContext — RLS บน predictions ซ่อนคำทายของนัดที่ยังไม่คิกออฟจากคนอื่น
  // แม้จะเป็นของตัวเองก็ต้องประกาศตัวก่อนถึงจะอ่านเห็น
  const rows: MyPredictionRow[] = await withUserContext(userId, (tx) =>
    tx
      .select({
        matchId: matches.id,
        matchday: matches.matchday,
        kickoffAt: matches.kickoffAt,
        status: matches.status,
        homeTeam: homeTeams.name,
        awayTeam: awayTeams.name,
        homeCrest: homeTeams.crestUrl,
        awayCrest: awayTeams.crestUrl,
        homeScore: matches.homeScore,
        awayScore: matches.awayScore,
        predicted: predictions.predictedOutcome,
        pointsAwarded: predictionScores.pointsAwarded,
      })
      .from(predictions)
      .innerJoin(matches, eq(matches.id, predictions.matchId))
      .innerJoin(homeTeams, eq(homeTeams.id, matches.homeTeamId))
      .innerJoin(awayTeams, eq(awayTeams.id, matches.awayTeamId))
      .leftJoin(
        predictionScores,
        and(
          eq(predictionScores.predictionId, predictions.id),
          eq(predictionScores.leagueId, id),
        ),
      )
      .where(
        and(
          eq(predictions.userId, userId),
          eq(matches.seasonId, league.seasonId),
        ),
      )
      .orderBy(desc(matches.matchday), matches.kickoffAt),
  );

  // สรุปหัวหน้า — นับเฉพาะนัดที่จบและคิดคะแนนได้จริง ความแม่นจึงตรงกับหน้าอันดับเสมอ
  const finished = rows.filter((row) => actualOutcomeOf(row) !== null);
  const correct = finished.filter(
    (row) => actualOutcomeOf(row) === row.predicted,
  );
  const totalPoints = rows.reduce(
    (sum, row) => sum + (row.pointsAwarded ?? 0),
    0,
  );

  // จัดกลุ่มตามแมตช์เดย์ (ล่าสุดก่อน — เรียงมาแล้วจาก query)
  const byMatchday = new Map<number, MyPredictionRow[]>();
  for (const row of rows) {
    const group = byMatchday.get(row.matchday) ?? [];
    group.push(row);
    byMatchday.set(row.matchday, group);
  }

  return (
    <PageShell width="lg">
      <PageHeader
        title={league.name}
        subtitle="คำทายของฉัน — เห็นเฉพาะของตัวเอง รวมนัดที่ยังไม่เตะ"
      />
      <LeagueNav leagueId={id} active="mine" pendingCount={pendingCount} />

      {rows.length === 0 ? (
        <EmptyState>
          ยังไม่เคยทายผลในลีกนี้เลย — เริ่มที่แท็บ "ทายผล" ได้เลย
        </EmptyState>
      ) : (
        <>
          <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label="ทายไปแล้ว" value={`${rows.length} นัด`} />
            <StatCard
              label="ทายถูก"
              value={`${correct.length}/${finished.length} นัด`}
            />
            <StatCard
              label="ความแม่น"
              value={
                finished.length > 0
                  ? `${Math.round((correct.length / finished.length) * 100)}%`
                  : "—"
              }
            />
            <StatCard label="แต้มรวมในลีกนี้" value={`${totalPoints} แต้ม`} />
          </div>

          <div className="flex flex-col gap-6">
            {[...byMatchday.entries()].map(([matchday, group]) => (
              <section key={matchday}>
                <SectionLabel>
                  แมตช์เดย์ {matchday}
                  {matchday === currentMatchday && " · ปัจจุบัน"}
                </SectionLabel>
                <Card padded={false} className="divide-y divide-border">
                  {group.map((row) => (
                    <PredictionRow key={row.matchId} row={row} />
                  ))}
                </Card>
              </section>
            ))}
          </div>
        </>
      )}
    </PageShell>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <Card className="flex flex-col gap-1">
      <span className="text-xs text-muted">{label}</span>
      <span className="font-display text-lg font-semibold text-foreground">
        {value}
      </span>
    </Card>
  );
}

function PredictionRow({ row }: { row: MyPredictionRow }) {
  const actual = actualOutcomeOf(row);
  const correct = actual !== null && actual === row.predicted;
  const played = actual !== null;

  return (
    <div className="flex flex-col gap-2 p-4">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="flex min-w-0 items-center gap-1.5 text-sm text-foreground">
          <TeamCrest src={row.homeCrest} size={18} />
          <span className="max-w-40 truncate">{row.homeTeam}</span>
        </span>
        <span className="shrink-0 rounded bg-surface-hover px-1.5 py-0.5 text-xs tabular-nums text-foreground">
          {played ? `${row.homeScore}-${row.awayScore}` : "vs"}
        </span>
        <span className="flex min-w-0 items-center gap-1.5 text-sm text-foreground">
          <TeamCrest src={row.awayCrest} size={18} />
          <span className="max-w-40 truncate">{row.awayTeam}</span>
        </span>
        <span className="ml-auto shrink-0 text-xs text-muted">
          {played ? "จบแล้ว" : formatKickoff(row.kickoffAt)}
        </span>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-muted">
          ทายไว้:{" "}
          <span className={played && !correct ? "line-through" : "text-foreground"}>
            {outcomeLabel(row.predicted, row.homeTeam, row.awayTeam)}
          </span>
        </span>

        {!played ? (
          <span className="text-xs text-muted">รอเตะ</span>
        ) : row.pointsAwarded == null ? (
          <span className="text-xs text-muted">รอคิดคะแนน</span>
        ) : correct ? (
          <span className="rounded-full bg-success/15 px-2 py-0.5 text-xs font-medium text-success">
            ถูก +{row.pointsAwarded}
          </span>
        ) : (
          <span className="text-xs text-muted">ผิด</span>
        )}
      </div>
    </div>
  );
}
