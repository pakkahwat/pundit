import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { auth } from '@/auth';
import { Card, CenteredMessage, EmptyState, PageHeader, PageShell } from '@/components/ui';
import { LeagueNav } from '@/components/league-nav';
import { LinkPending } from '@/components/link-pending';
import { db } from '@/db/client';
import { withUserContext } from '@/db/rls';
import { leagueMembers, leagues, matches, predictions, seasons, teams } from '@/db/schema';
import { formatKickoff, isMatchLocked } from '@/lib/match-time';

import { H2hDialog } from '@/components/h2h-dialog';
import { TeamCrest } from '@/components/team-crest';

import { PredictionForm } from './prediction-form';

export default async function PredictPage(props: PageProps<'/leagues/[id]/predict'>) {
  const { id } = await props.params;
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

  // ── เลือกแมตช์เดย์ได้ ────────────────────────────────────────────────────────
  //
  // เดิมหน้านี้ล็อกไว้ที่แมตช์เดย์ปัจจุบันอย่างเดียว ซึ่งเป็นข้อจำกัดที่โหดเกินจำเป็น: โปรแกรมแข่ง
  // ทั้งฤดูกาลประกาศล่วงหน้าอยู่แล้วและอยู่ในฐานข้อมูลเราครบ แต่ผู้เล่นที่รู้ตัวว่าสัปดาห์หน้าไม่ว่าง
  // กลับทายล่วงหน้าไม่ได้ พอทายไม่ทันคิกออฟก็เสียแต้มถาวรแก้ย้อนหลังไม่ได้
  //
  // ไม่ต้องแก้เรื่องความยุติธรรมอะไรเพิ่มเลย เพราะการปิดรับบังคับที่ระดับฐานข้อมูลเป็น "รายนัด"
  // อยู่แล้ว (เทียบ kickoff_at ของนัดนั้น ๆ กับ now() ใน guarded-upsert) ไม่ได้ผูกกับแมตช์เดย์
  const [range] = await db
    .select({
      minMd: sql<number>`min(${matches.matchday})`,
      maxMd: sql<number>`max(${matches.matchday})`,
    })
    .from(matches)
    .where(eq(matches.seasonId, league.seasonId));

  // แมตช์เดย์ปัจจุบัน "เตะครบทุกคู่แล้ว" หรือยัง — นับนัดที่ยังไม่ถึงเวลาคิกออฟ ถ้าเหลือ 0 แปลว่า
  // ทุกคู่ลงสนามกันหมดแล้ว ไม่มีอะไรให้ทายในแมตช์เดย์นี้อีก
  //
  // ใช้ kickoff_at เทียบกับ now() ของ Postgres ไม่ใช่ status = 'FINISHED' เพราะ status ขึ้นกับว่า
  // cron ไปดึงผลมาทันหรือยัง (ช้าได้ถึง 30 นาที) ส่วนเวลาคิกออฟเรารู้แน่นอนตั้งแต่ต้นและตรงกับ
  // เกณฑ์ที่ใช้ปิดรับทายจริง ๆ อยู่แล้ว
  const [currentMd] = await db
    .select({
      notStarted: sql<number>`count(*) filter (where ${matches.kickoffAt} > now())`,
    })
    .from(matches)
    .where(and(eq(matches.seasonId, league.seasonId), eq(matches.matchday, currentMatchday)));

  const currentAllKickedOff = Number(currentMd?.notStarted ?? 0) === 0;

  const minMd = range?.minMd ?? 1;
  const seasonMaxMd = range?.maxMd ?? currentMatchday;
  // เดินหน้าได้แค่ 1 แมตช์เดย์ และต่อเมื่อแมตช์เดย์ปัจจุบันเตะครบแล้วเท่านั้น — ไม่เปิดให้ไล่ทาย
  // ล่วงหน้าทั้งฤดูกาล เพราะโปรแกรมแข่งไกล ๆ ยังเลื่อนได้ และการทายตอนยังไม่รู้ฟอร์มก็ไม่มีความหมาย
  // ส่วนย้อนกลับไปดูของเก่าทำได้ไม่จำกัด
  const maxMd = Math.min(seasonMaxMd, currentAllKickedOff ? currentMatchday + 1 : currentMatchday);
  const searchParams = await props.searchParams;
  const rawMd = Number(Array.isArray(searchParams.md) ? searchParams.md[0] : searchParams.md);
  // ค่าที่ไม่ใช่ตัวเลขหรืออยู่นอกช่วงจะถูกดึงกลับเข้าช่วงเสมอ ไม่ปล่อยให้หน้าว่างเปล่า
  const selectedMd = Number.isInteger(rawMd)
    ? Math.min(Math.max(rawMd, minMd), maxMd)
    : currentMatchday;

  const homeTeams = alias(teams, 'home_teams');
  const awayTeams = alias(teams, 'away_teams');

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
      externalId: matches.externalId,
    })
    .from(matches)
    .innerJoin(homeTeams, eq(matches.homeTeamId, homeTeams.id))
    .innerJoin(awayTeams, eq(matches.awayTeamId, awayTeams.id))
    .where(and(eq(matches.seasonId, league.seasonId), eq(matches.matchday, selectedMd)))
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

  // นับเฉพาะนัดที่ยังเปิดรับ "และ" ยังไม่ได้ทาย — ตัวเลขเดียวกับที่แปะบนแท็บ
  const pending = matchRows.filter(
    (m) => !isMatchLocked(m.kickoffAt) && !predictionByMatchId.has(m.id),
  ).length;

  return (
    <PageShell width="lg">
      <PageHeader
        title={league.name}
        subtitle={
          matchRows.length > 0
            ? `ยังทายได้ ${openCount} จาก ${matchRows.length} นัด`
            : 'ยังไม่มีนัดในแมตช์เดย์นี้'
        }
      />

      <LeagueNav leagueId={id} active="predict" pendingCount={pending} />

      <MatchdayNav
        leagueId={id}
        selected={selectedMd}
        current={currentMatchday}
        min={minMd}
        max={maxMd}
      />

      {matchRows.length === 0 ? (
        <EmptyState>ยังไม่มีนัดในแมตช์เดย์ {selectedMd}</EmptyState>
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
                    <span className="flex min-w-0 items-center gap-2 font-medium">
                      <TeamCrest src={m.homeCrest} size={20} />
                      <span className={`truncate ${teamClass(homeWon, awayWon)}`}>
                        {m.homeTeamName}
                      </span>
                      {finished ? (
                        <span className="shrink-0 rounded bg-surface-hover px-2 py-0.5 text-sm tabular-nums text-foreground">
                          {m.homeScore}-{m.awayScore}
                        </span>
                      ) : (
                        <span className="shrink-0 text-muted">vs</span>
                      )}
                      <TeamCrest src={m.awayCrest} size={20} />
                      <span className={`truncate ${teamClass(awayWon, homeWon)}`}>
                        {m.awayTeamName}
                      </span>
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

// แถบเลื่อนแมตช์เดย์ — ปุ่มก่อนหน้า/ถัดไป พร้อมทางลัดกลับไปแมตช์เดย์ปัจจุบัน
// ใช้ลิงก์ล้วนไม่ใช่ปุ่ม JS เพื่อให้บุ๊กมาร์กและปุ่มย้อนกลับของเบราว์เซอร์ทำงานตามที่ควร
function MatchdayNav({
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
  const href = (md: number) => `/leagues/${leagueId}/predict?md=${md}`;
  const arrow =
    'relative inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border text-sm transition-colors';

  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      {selected > min ? (
        <Link href={href(selected - 1)} aria-label="แมตช์เดย์ก่อนหน้า" className={`${arrow} text-foreground hover:border-accent hover:bg-accent-soft hover:text-accent-soft-fg`}>
          ←
          <LinkPending />
        </Link>
      ) : (
        <span className={`${arrow} cursor-not-allowed text-muted opacity-40`} aria-hidden>
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
          <Link href={href(current)} className="text-xs text-muted hover:text-foreground hover:underline">
            {selected < current ? 'ผ่านไปแล้ว' : 'ล่วงหน้า'} · กลับไปแมตช์เดย์ {current}
          </Link>
        )}
      </span>

      {selected < max ? (
        <Link href={href(selected + 1)} aria-label="แมตช์เดย์ถัดไป" className={`${arrow} text-foreground hover:border-accent hover:bg-accent-soft hover:text-accent-soft-fg`}>
          →
          <LinkPending />
        </Link>
      ) : (
        <span className={`${arrow} cursor-not-allowed text-muted opacity-40`} aria-hidden>
          →
        </span>
      )}
    </div>
  );
}
