import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import Link from "next/link";
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
import { RevealList } from "@/components/reveal-list";
import { PlayerAvatar } from "@/components/player-avatar";
import { TeamCrest } from "@/components/team-crest";
import { db } from "@/db/client";
import { withUserContext } from "@/db/rls";
import {
  aiAgents,
  leagueMembers,
  leagues,
  matches,
  predictions,
  teams,
  users,
} from "@/db/schema";
import { displayNameSql, realNameHint } from "@/lib/display-name";
import { formatKickoff, isMatchLocked } from "@/lib/match-time";
import { pendingPredictionCount } from "@/lib/leagues/pending";
import { outcomeLabel } from "@/lib/predictions/outcome";
import { getCurrentMatchday } from "@/lib/matches/current-matchday";

export default async function RevealPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ md?: string | string[] }>;
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

  const currentMatchday = await getCurrentMatchday(league.seasonId);
  const [range] = await db
    .select({
      minMd: sql<number>`min(${matches.matchday})`,
      maxMd: sql<number>`max(${matches.matchday})`,
    })
    .from(matches)
    .where(eq(matches.seasonId, league.seasonId));
  const minMatchday = range?.minMd ?? currentMatchday;
  const maxMatchday = Math.min(
    range?.maxMd ?? currentMatchday,
    currentMatchday,
  );
  const searchParamsValue = await searchParams;
  const rawMatchday = Number(
    Array.isArray(searchParamsValue.md)
      ? searchParamsValue.md[0]
      : searchParamsValue.md,
  );
  const selectedMatchday = Number.isInteger(rawMatchday)
    ? Math.min(Math.max(rawMatchday, minMatchday), maxMatchday)
    : currentMatchday;

  const homeTeams = alias(teams, "home_teams");
  const awayTeams = alias(teams, "away_teams");

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
        eq(matches.seasonId, league.seasonId),
        eq(matches.matchday, selectedMatchday),
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
          reasoning: sql<string | null>`(
            select apl.reasoning
            from ai_prediction_logs apl
            join ai_agents aa on aa.id = apl.ai_agent_id
            where apl.match_id = predictions.match_id
              and aa.user_id = predictions.user_id
              and apl.parse_succeeded = true
            order by apl.created_at desc
            limit 1
          )`,
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
      displayName: users.displayName,
      googleName: users.name,
      image: users.image,
      playerKind: users.playerKind,
      agentKey: aiAgents.agentKey,
    })
    .from(leagueMembers)
    .innerJoin(users, eq(users.id, leagueMembers.userId))
    // left join เพราะสมาชิกส่วนใหญ่เป็นคน ไม่มีแถวใน ai_agents — เอามาเพื่อรู้ว่าเป็น AI ตัวไหน
    // จะได้หยิบไอคอนประจำตัวของมันมาแสดงแทนวงกลมตัวอักษร
    .leftJoin(aiAgents, eq(aiAgents.userId, leagueMembers.userId))
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

  const pending = await pendingPredictionCount(
    league.seasonId,
    currentMatchday,
    userId,
  );

  // แมตช์เดย์ที่มีไม่กี่คู่ (ต้นฤดูกาล หรือเหลือนัดตกค้าง) กางไว้เลยจะอ่านง่ายกว่า ไม่ต้องกดเพิ่ม
  // พอเกิน 3 คู่ค่อยหุบทั้งหมด เพราะจุดประสงค์ของการหุบคือให้เห็นทั้งแมตช์เดย์ในจอเดียว
  const defaultOpen = visibleMatches.length <= 3;

  return (
    <PageShell width="lg">
      <PageHeader
        title={league.name}
        subtitle={`คำทายทุกคน · แมตช์เดย์ ${selectedMatchday} — เปิดเผยหลังแมตช์เริ่มเท่านั้น`}
      />

      <LeagueNav leagueId={id} active="reveal" pendingCount={pending} />

      <RevealMatchdayNav
        leagueId={id}
        selected={selectedMatchday}
        current={currentMatchday}
        min={minMatchday}
        max={maxMatchday}
      />

      {visibleMatches.length === 0 ? (
        <EmptyState>ยังไม่มีคำทายในแมตช์เดย์นี้</EmptyState>
      ) : (
        <RevealList>
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

            // สรุปที่เห็นตอนหุบ — ตั้งใจให้ตอบคำถามที่คนเปิดหน้านี้มาถามบ่อยที่สุดได้เลย
            // โดยไม่ต้องกาง: "ของเราถูกไหม" และ "คนอื่นถูกกันกี่คน"
            const revealed = locked
              ? Array.from(predsByUser?.values() ?? [])
              : [];
            const correctCount =
              actualOutcome == null
                ? 0
                : revealed.filter((p) => p.outcome === actualOutcome).length;
            const myOutcome = locked
              ? predsByUser?.get(userId)?.outcome
              : myPendingByMatch.get(m.id);
            const myLabel = myOutcome
              ? outcomeLabel(myOutcome, m.homeTeamName, m.awayTeamName)
              : null;

            return (
              <li key={m.id}>
                <Card padded={false}>
                  {/* หุบ/กางด้วย <details> ของเบราว์เซอร์เอง ไม่ใช่ state ใน React — แมตช์เดย์หนึ่ง
                      มีได้ถึง 10 คู่ คูณจำนวนผู้เล่นแล้วยาวเป็นร้อยแถว การหุบไว้ก่อนทำให้เห็น
                      ทั้งแมตช์เดย์ในจอเดียว ที่เลือก <details> เพราะได้ปุ่มที่กดด้วยคีย์บอร์ดได้
                      และ screen reader อ่านสถานะกาง/หุบถูกต้องมาให้ฟรี ไม่ต้องเขียน aria เอง
                      และไม่ต้องส่ง JS ไปฝั่ง browser เลย */}
                  <details className="group" open={defaultOpen}>
                    <summary className="flex cursor-pointer list-none items-start gap-3 px-4 py-3 transition-colors hover:bg-surface-hover group-open:border-b group-open:border-border [&::-webkit-details-marker]:hidden">
                      <span className="flex min-w-0 flex-1 flex-col gap-1">
                        <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 font-medium text-foreground">
                          <span className="flex min-w-0 items-center gap-2">
                            <TeamCrest src={m.homeCrest} size={20} />
                            <span>{m.homeTeamName}</span>
                          </span>
                          <span className="shrink-0 text-muted">vs</span>
                          <span className="flex min-w-0 items-center gap-2">
                            <TeamCrest src={m.awayCrest} size={20} />
                            <span>{m.awayTeamName}</span>
                          </span>
                        </span>

                        {/* บรรทัดสรุปตอนหุบ — ตั้งใจให้ตอบคำถามที่คนเปิดหน้านี้มาถามบ่อยที่สุด
                            ได้เลยโดยไม่ต้องกาง: "ของเราถูกไหม" กับ "คนอื่นถูกกันกี่คน"
                            ถ้าไม่มีบรรทัดนี้ การหุบจะกลายเป็นแค่การซ่อนของ ต้องกดกางทุกใบอยู่ดี */}
                        <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                          {finished ? (
                            <span className="font-semibold text-foreground">
                              {m.homeScore}-{m.awayScore}
                            </span>
                          ) : (
                            <span>{formatKickoff(m.kickoffAt)}</span>
                          )}
                          <span aria-hidden>·</span>
                          {!locked ? (
                            <span>
                              คุณทาย:{" "}
                              <span className="text-foreground">{myLabel}</span>{" "}
                              · เปิดเผยหลังเริ่มแข่ง
                            </span>
                          ) : (
                            <>
                              {myOutcome == null ? (
                                <span>คุณไม่ได้ทาย</span>
                              ) : actualOutcome == null ? (
                                <span>
                                  คุณทาย:{" "}
                                  <span className="text-foreground">
                                    {myLabel}
                                  </span>
                                </span>
                              ) : myOutcome === actualOutcome ? (
                                <span className="font-medium text-success">
                                  คุณทายถูก
                                </span>
                              ) : (
                                <span className="font-medium text-danger">
                                  คุณทายผิด
                                </span>
                              )}
                              <span aria-hidden>·</span>
                              <span>
                                {actualOutcome == null
                                  ? `ทายไว้ ${revealed.length} คน`
                                  : `ถูก ${correctCount} จาก ${revealed.length}`}
                              </span>
                            </>
                          )}
                        </span>
                      </span>

                      {/* ลูกศรบอกทิศ กางแล้วชี้ขึ้น — ไม่ใช้สามเหลี่ยมเริ่มต้นของเบราว์เซอร์
                          เพราะหน้าตาต่างกันคนละแบบในแต่ละเบราว์เซอร์ */}
                      <svg
                        viewBox="0 0 16 16"
                        aria-hidden
                        className="mt-1 h-4 w-4 shrink-0 text-muted transition-transform group-open:rotate-180"
                      >
                        <path
                          d="M4 6l4 4 4-4"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.75"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </summary>

                    {/* แสดงสมาชิกทุกคนเป็นแถวเสมอ ทั้งก่อนและหลังเปิดเผย เพื่อให้เห็นว่ามีใครลงแข่ง
                      บ้างและผลจะมาโผล่ตรงไหน — ก่อนล็อกค่าทุกช่องเป็น "เผยหลังเริ่มแข่ง" เหมือนกัน
                      หมด ไม่บอกด้วยซ้ำว่าใครทายไปแล้วหรือยัง เพราะ RLS กันไม่ให้เรารู้ตั้งแต่ระดับ
                      database (และไม่ควรรู้ เพราะไม่เกี่ยวกับเรา) */}
                    {/* กันเข้าใจผิด: แถวพวกนี้คือ "รายชื่อสมาชิกลีก" ไม่ใช่ "คนที่ทายแล้ว" — ก่อนคิกออฟ
                      เราไม่รู้ด้วยซ้ำว่าใครทายไปแล้วบ้าง เพราะ RLS ปิดไว้ที่ระดับฐานข้อมูล
                      (ตั้งใจให้เป็นแบบนี้ จะได้ไม่มีใครแอบดูของใครได้เลย) ถ้าไม่เขียนบอกไว้
                      คนอ่านจะนึกว่าทุกคนในลิสต์ทายมาแล้วทั้งหมด */}
                    {!locked && (
                      <p className="border-b border-border px-4 py-2.5 text-xs text-muted">
                        นี่คือรายชื่อสมาชิกทั้งลีก ยังไม่ได้แปลว่าทุกคนทายแล้ว —
                        ก่อนคิกออฟระบบยังไม่รู้ว่าใครทายไปแล้วบ้าง
                      </p>
                    )}

                    <ul className="divide-y divide-border">
                      {memberRows.map((member) => {
                        const pred = predsByUser?.get(member.userId);
                        const correct =
                          actualOutcome != null &&
                          pred?.outcome === actualOutcome;

                        return (
                          <li
                            key={member.userId}
                            className="flex flex-col gap-2 p-4"
                          >
                            {/* หัวแถวกับเหตุผลของ AI ต้องอยู่คนละบรรทัดกัน ไม่ใช่คนละคอลัมน์
                              เดิมเหตุผลถูกวางไว้ในคอลัมน์ขวาของ flex แถวเดียวกัน พอบนมือถือที่กว้าง
                              ~360px ข้อความยาว ๆ จะกินพื้นที่จนคอลัมน์ชื่อเหลือความกว้างระดับตัวอักษรเดียว
                              แล้วชื่อไทยที่ไม่มีช่องว่างก็ถูกหักบรรทัดทีละตัวอักษรลงมาเป็นแถวยาว */}
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                            <PlayerAvatar
                              image={member.image}
                              name={member.name}
                              isAi={member.playerKind === "ai"}
                              agentKey={member.agentKey}
                              size={24}
                            />
                            <span
                              title={
                                member.userId === userId
                                  ? undefined
                                  : realNameHint(
                                      member.displayName,
                                      member.googleName,
                                    )
                              }
                              className={`min-w-[9rem] flex-1 break-words text-sm text-muted ${
                                member.userId !== userId &&
                                realNameHint(
                                  member.displayName,
                                  member.googleName,
                                )
                                  ? "cursor-help"
                                  : ""
                              }`}
                            >
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
                              <span className="ml-auto shrink-0 text-sm text-muted">
                                เปิดเผยหลังเริ่มแข่ง
                              </span>
                            ) : !pred ? (
                              <span className="ml-auto shrink-0 text-sm text-muted">
                                ไม่ได้ทาย
                              </span>
                            ) : (
                              <span
                                className={`ml-auto shrink-0 text-right text-sm ${
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
                            </div>

                            {locked &&
                              pred?.reasoning &&
                              member.playerKind === "ai" && (
                                <p className="border-l-2 border-border pl-3 text-xs leading-relaxed text-muted">
                                  {pred.reasoning}
                                </p>
                              )}
                          </li>
                        );
                      })}
                    </ul>
                  </details>
                </Card>
              </li>
            );
          })}
        </RevealList>
      )}
    </PageShell>
  );
}

function RevealMatchdayNav({
  leagueId,
  selected,
  current,
  min,
  max,
}: {
  leagueId: string;
  selected: number;
  current: number;
  min: number;
  max: number;
}) {
  const href = (matchday: number) =>
    `/leagues/${leagueId}/reveal?md=${matchday}`;
  const arrowClass =
    "relative inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border text-sm transition-colors";

  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      {selected > min ? (
        <Link
          href={href(selected - 1)}
          aria-label="แมตช์เดย์ก่อนหน้า"
          className={`${arrowClass} text-foreground hover:border-accent hover:bg-accent-soft hover:text-accent-soft-fg`}
        >
          ←
        </Link>
      ) : (
        <span
          className={`${arrowClass} cursor-not-allowed text-muted opacity-40`}
          aria-hidden
        >
          ←
        </span>
      )}

      <span className="min-w-0 text-center">
        <span className="block font-display text-lg font-semibold text-foreground">
          แมตช์เดย์ {selected}
        </span>
        {selected === current ? (
          <span className="text-xs text-accent">แมตช์เดย์ปัจจุบัน</span>
        ) : (
          <Link
            href={href(current)}
            className="text-xs text-muted hover:text-foreground hover:underline"
          >
            ผ่านไปแล้ว · กลับไปแมตช์เดย์ {current}
          </Link>
        )}
      </span>

      {selected < max ? (
        <Link
          href={href(selected + 1)}
          aria-label="แมตช์เดย์ถัดไป"
          className={`${arrowClass} text-foreground hover:border-accent hover:bg-accent-soft hover:text-accent-soft-fg`}
        >
          →
        </Link>
      ) : (
        <span
          className={`${arrowClass} cursor-not-allowed text-muted opacity-40`}
          aria-hidden
        >
          →
        </span>
      )}
    </div>
  );
}
