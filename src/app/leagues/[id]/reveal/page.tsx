import { and, asc, eq, inArray } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import {
  Badge,
  Card,
  CenteredMessage,
  EmptyState,
  PageHeader,
  PageShell,
} from "@/components/ui";
import { LeagueNav } from "@/components/league-nav";
import { db } from "@/db/client";
import { withUserContext } from "@/db/rls";
import {
  leagueMembers,
  leagues,
  matches,
  predictions,
  seasons,
  teams,
  users,
} from "@/db/schema";
import { displayNameSql } from "@/lib/display-name";
import { formatKickoff, isMatchLocked } from "@/lib/match-time";
import { pendingPredictionCount } from "@/lib/leagues/pending";
import { outcomeLabel } from "@/lib/predictions/outcome";

export default async function RevealPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/");
  }
  const userId = session.user.id;

  const [league] = await db
    .select()
    .from(leagues)
    .where(eq(leagues.id, id))
    .limit(1);
  if (!league) {
    return <CenteredMessage title="ไม่พบลีกนี้" />;
  }

  const [membership] = await db
    .select()
    .from(leagueMembers)
    .where(
      and(eq(leagueMembers.leagueId, id), eq(leagueMembers.userId, userId)),
    )
    .limit(1);
  if (!membership) {
    return <CenteredMessage title="คุณไม่ได้เป็นสมาชิกลีกนี้" />;
  }

  const [season] = await db
    .select()
    .from(seasons)
    .where(eq(seasons.id, league.seasonId))
    .limit(1);
  const currentMatchday = season?.currentMatchday ?? 1;

  const homeTeams = alias(teams, "home_teams");
  const awayTeams = alias(teams, "away_teams");

  const matchRows = await db
    .select({
      id: matches.id,
      kickoffAt: matches.kickoffAt,
      homeTeamName: homeTeams.name,
      awayTeamName: awayTeams.name,
      status: matches.status,
      homeScore: matches.homeScore,
      awayScore: matches.awayScore,
    })
    .from(matches)
    .innerJoin(homeTeams, eq(matches.homeTeamId, homeTeams.id))
    .innerJoin(awayTeams, eq(matches.awayTeamId, awayTeams.id))
    .where(
      and(
        eq(matches.seasonId, league.seasonId),
        eq(matches.matchday, currentMatchday),
      ),
    )
    .orderBy(asc(matches.kickoffAt));

  const lockedMatchIds = matchRows
    .filter((m) => isMatchLocked(m.kickoffAt))
    .map((m) => m.id);

  // ไม่ต้องผ่าน withUserContext ตรงนี้เลย — RLS select policy บน predictions
  // (predictions_select_own_or_locked ใน schema.sql) อนุญาตให้เห็นคำทายของ "ทุกคน" สำหรับแมตช์ที่
  // kickoff ผ่านไปแล้ว โดยไม่สนใจว่า current_setting ถูกตั้งไว้หรือไม่เลย (เงื่อนไข OR ฝั่ง
  // "match locked" เป็นจริงเองโดยไม่ต้องมี user context) เท่ากับหน้านี้เปิดเผยได้อย่างปลอดภัยโดย
  // ธรรมชาติของ policy — ถ้าลองเอา matchId ของแมตช์ที่ยังไม่ล็อกใส่เข้าไปด้วย ก็จะไม่มีแถวอื่น
  // นอกจากของตัวเองกลับมาอยู่ดี (ซึ่งด้านล่างเราก็กรองไม่ query ตั้งแต่ต้นอยู่แล้ว)
  const revealedRows = lockedMatchIds.length
    ? await db
        .select({
          matchId: predictions.matchId,
          userId: predictions.userId,
          userName: displayNameSql,
          playerKind: users.playerKind,
          outcome: predictions.predictedOutcome,
        })
        .from(predictions)
        .innerJoin(users, eq(users.id, predictions.userId))
        .where(inArray(predictions.matchId, lockedMatchIds))
    : [];

  // คำทายเป็น global ต่อ (user, match) ไม่ผูก league (ดูคอมเมนต์ schema.sql ที่ตาราง predictions)
  // คนที่ทายแมตช์เดียวกันแต่อยู่ลีกอื่นก็มีสิทธิ์ติดมาด้วยถ้าไม่กรอง เลยต้องกรองเหลือเฉพาะสมาชิก
  // ลีกนี้อีกชั้นในแอป
  // ดึงชื่อสมาชิกมาด้วย เพราะหน้านี้แสดงทุกคนเป็นแถวเสมอ (ทั้งก่อนและหลังเปิดเผย) — ก่อนล็อกจะ
  // ขึ้นชื่อพร้อมข้อความว่ายังไม่เปิด ไม่ได้บอกว่าใครทายหรือยัง เพราะเรารู้ไม่ได้และไม่ควรรู้
  const memberRows = await db
    .select({
      userId: leagueMembers.userId,
      name: displayNameSql,
      playerKind: users.playerKind,
    })
    .from(leagueMembers)
    .innerJoin(users, eq(users.id, leagueMembers.userId))
    .where(eq(leagueMembers.leagueId, id))
    // เรียงคนจริงขึ้นก่อน AI แล้วค่อยเรียงตามชื่อ ให้ลำดับคงที่ทุกครั้งที่โหลด
    .orderBy(asc(users.playerKind), asc(displayNameSql));
  const memberIds = new Set(memberRows.map((m) => m.userId));

  const predictionsByMatch = new Map<
    string,
    Map<string, (typeof revealedRows)[number]>
  >();
  for (const r of revealedRows) {
    if (!memberIds.has(r.userId)) continue;
    const byUser = predictionsByMatch.get(r.matchId) ?? new Map();
    byUser.set(r.userId, r);
    predictionsByMatch.set(r.matchId, byUser);
  }

  // แมตช์ที่ยังไม่ล็อก: RLS ยอมให้เห็นได้แค่คำทายของตัวเอง (ของคนอื่นถูกกรองทิ้งที่ระดับ database
  // ไม่ใช่แค่ซ่อนใน UI) ต้องรันผ่าน withUserContext ไม่งั้นจะไม่เห็นแม้แต่ของตัวเอง — ใช้เพื่อรู้ว่า
  // ควรแสดงแมตช์นั้นในหน้านี้ไหม โดยไม่ต้องรู้เลยว่าคนอื่นทายอะไรหรือทายกี่คน
  const unlockedMatchIds = matchRows
    .filter((m) => !isMatchLocked(m.kickoffAt))
    .map((m) => m.id);
  const myPendingRows = unlockedMatchIds.length
    ? await withUserContext(userId, (tx) =>
        tx
          .select({
            matchId: predictions.matchId,
            outcome: predictions.predictedOutcome,
          })
          .from(predictions)
          .where(
            and(
              eq(predictions.userId, userId),
              inArray(predictions.matchId, unlockedMatchIds),
            ),
          ),
      )
    : [];
  const myPendingByMatch = new Map(
    myPendingRows.map((r) => [r.matchId, r.outcome]),
  );

  // แสดงเฉพาะแมตช์ที่ "มีคำทาย" ตามที่เห็นได้จริง — ล็อกแล้วต้องมีคนในลีกทายอย่างน้อยหนึ่งคน
  // ส่วนที่ยังไม่ล็อกจะขึ้นก็ต่อเมื่อเราเองทายไว้ (ของคนอื่นเรายังไม่มีสิทธิ์รู้ด้วยซ้ำว่ามีหรือเปล่า)
  // แมตช์ที่ไม่มีใครทายเลยจะถูกซ่อนทั้งใบ ไม่รกหน้าจอ
  const visibleMatches = matchRows.filter((m) =>
    isMatchLocked(m.kickoffAt)
      ? (predictionsByMatch.get(m.id)?.size ?? 0) > 0
      : myPendingByMatch.has(m.id),
  );

  const pending = await pendingPredictionCount(league.seasonId, currentMatchday, userId);

  return (
    <PageShell width="lg">
      <PageHeader
        title={league.name}
        subtitle={`คำทายทุกคน · แมตช์เดย์ ${currentMatchday} — เปิดเผยหลังแมตช์เริ่มเท่านั้น`}
      />

      <LeagueNav leagueId={id} active="reveal" pendingCount={pending} />

      {visibleMatches.length === 0 ? (
        <EmptyState>ยังไม่มีคำทายในแมตช์เดย์นี้</EmptyState>
      ) : (
        <ul className="flex flex-col gap-3">
          {visibleMatches.map((m) => {
            const locked = isMatchLocked(m.kickoffAt);
            const predsByUser = predictionsByMatch.get(m.id);
            const finished =
              m.status === "FINISHED" &&
              m.homeScore != null &&
              m.awayScore != null;
            const actualOutcome = finished
              ? m.homeScore! > m.awayScore!
                ? "HOME"
                : m.homeScore! < m.awayScore!
                  ? "AWAY"
                  : "DRAW"
              : null;

            return (
              <li key={m.id}>
                <Card padded={false}>
                  <div className="flex items-baseline justify-between gap-3 border-b border-border p-4">
                    <span className="font-medium text-foreground">
                      {m.homeTeamName} <span className="text-muted">vs</span>{" "}
                      {m.awayTeamName}
                    </span>
                    <span className="shrink-0 text-xs text-muted">
                      {finished ? (
                        <span className="font-semibold text-foreground">
                          {m.homeScore}-{m.awayScore}
                        </span>
                      ) : (
                        formatKickoff(m.kickoffAt)
                      )}
                    </span>
                  </div>

                  {/* แสดงสมาชิกทุกคนเป็นแถวเสมอ ทั้งก่อนและหลังเปิดเผย เพื่อให้เห็นว่ามีใครลงแข่ง
                      บ้างและผลจะมาโผล่ตรงไหน — ก่อนล็อกค่าทุกช่องเป็น "เผยหลังเริ่มแข่ง" เหมือนกัน
                      หมด ไม่บอกด้วยซ้ำว่าใครทายไปแล้วหรือยัง เพราะ RLS กันไม่ให้เรารู้ตั้งแต่ระดับ
                      database (และไม่ควรรู้ เพราะไม่เกี่ยวกับเรา) */}
                  <ul className="divide-y divide-border">
                    {memberRows.map((member) => {
                      const pred = predsByUser?.get(member.userId);
                      const correct =
                        actualOutcome != null &&
                        pred?.outcome === actualOutcome;

                      return (
                        <li
                          key={member.userId}
                          className="flex items-center gap-3 p-4"
                        >
                          <span className="min-w-0 flex-1 truncate text-sm text-muted">
                            คำทายของ
                            {member.userId === userId
                              ? "คุณ"
                              : " " + member.name}
                            {member.playerKind === "ai" && (
                              <span className="ml-2">
                                <Badge tone="accent">AI</Badge>
                              </span>
                            )}
                          </span>

                          {!locked ? (
                            <span className="shrink-0 text-sm text-muted">
                              เปิดเผยหลังเริ่มแข่ง
                            </span>
                          ) : !pred ? (
                            <span className="shrink-0 text-sm text-muted">
                              ไม่ได้ทาย
                            </span>
                          ) : (
                            <span
                              className={`shrink-0 text-sm ${
                                actualOutcome == null
                                  ? "text-foreground"
                                  : correct
                                    ? "font-medium text-success"
                                    : "text-muted line-through"
                              }`}
                            >
                              {outcomeLabel(
                                pred.outcome,
                                m.homeTeamName,
                                m.awayTeamName,
                              )}
                            </span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </PageShell>
  );
}
