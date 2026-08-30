import { and, desc, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { LeagueNav } from "@/components/league-nav";
import {
  Card,
  CenteredMessage,
  EmptyState,
  PageHeader,
  PageShell,
  SectionLabel,
} from "@/components/ui";
import { db } from "@/db/client";
import { BadgeChip } from "@/components/profile-name";
import {
  actualOutcomeOf,
  PredictionRow,
  StatCard,
  type HistoryRow,
} from "@/components/prediction-history";
import { withUserContext } from "@/db/rls";
import {
  leagueMembers,
  leagues,
  matches,
  predictionScores,
  predictions,
  teams,
  userBadges,
  users,
} from "@/db/schema";
import { BADGES, isBadgeKey } from "@/lib/stats/badges";
import { pendingPredictionCount } from "@/lib/leagues/pending";
import { getCurrentMatchday } from "@/lib/matches/current-matchday";

// "คำทายของฉัน" — ประวัติการทายทั้งหมดของผู้ใช้คนนี้ในลีกนี้ ที่เดียวจบ
//
// ต่างจากหน้า reveal ตรงเจตนา: reveal คือ "ดูของทุกคนหลังล็อกแล้ว" ส่วนหน้านี้คือ "ของฉันล้วน ๆ
// รวมนัดที่ยังไม่เตะ" — RLS อนุญาตให้เจ้าของอ่านคำทายตัวเองได้เสมอไม่ต้องรอคิกออฟ
// (policy predictions_select_own_or_locked) จึงโชว์คำทายล่วงหน้าของตัวเองได้โดยไม่รั่วของใคร
// โครงสร้างระดับฐานข้อมูลรับประกันอยู่แล้วว่าต่อให้ query เขียนพลาด ก็ไม่มีทางเห็นของคนอื่น
//
// คะแนนอ่านจาก prediction_scores ของ "ลีกนี้" เท่านั้น — คำทายหนึ่งอันถูกคิดคะแนนแยกทุกลีก
// ที่ผู้ใช้อยู่ (คนเดียวอยู่หลายลีกได้) เอาลีกอื่นมาปนตัวเลขจะไม่ตรงกับหน้าอันดับของลีกนี้

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
  const rows: HistoryRow[] = await withUserContext(userId, (tx) =>
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

  // สตรีคสูงสุด (สถิติถาวร) + เหรียญที่เก็บไว้บนโปรไฟล์ — โชว์ตรงนี้เลยไม่ต้องกดอะไร
  // เพราะหน้านี้คือที่แรกที่คนมาดูสถิติตัวเอง (การ์ดโปรไฟล์มีไว้ดู "คนอื่น" เป็นหลัก)
  const [[me], myBadges] = await Promise.all([
    db
      .select({ bestStreak: users.bestStreak })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1),
    db
      .select({ badgeKey: userBadges.badgeKey })
      .from(userBadges)
      .where(eq(userBadges.userId, userId))
      .orderBy(userBadges.earnedAt),
  ]);
  const badges = myBadges
    .map((row) => row.badgeKey)
    .filter(isBadgeKey)
    .map((key) => ({ key, ...BADGES[key] }));

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
  const byMatchday = new Map<number, HistoryRow[]>();
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
          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <StatCard
              label="สตรีคสูงสุด"
              value={
                (me?.bestStreak ?? 0) > 0 ? `${me!.bestStreak} นัดติด` : "—"
              }
            />
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

          <div className="mb-6">
            <SectionLabel>เหรียญตราของฉัน ({badges.length}/21)</SectionLabel>
            {badges.length === 0 ? (
              <p className="text-xs text-muted">
                ยังไม่มีเหรียญ — เหรียญแรก ⚽ &quot;ประเดิมสนาม&quot;
                มาทันทีที่คำทายนัดแรกออกผล
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {badges.map((badge) => (
                  <BadgeChip
                    key={badge.key}
                    badgeKey={badge.key}
                    label={badge.label}
                    description={badge.description}
                    emoji={badge.emoji}
                  />
                ))}
              </div>
            )}
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
