import { asc, eq, sql as sqlTag } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { BadgeChip } from "@/components/profile-name";
import {
  actualOutcomeOf,
  PredictionRow,
  StatCard,
  type HistoryRow,
} from "@/components/prediction-history";
import {
  Card,
  EmptyState,
  LinkButton,
  PageHeader,
  PageShell,
  SectionLabel,
} from "@/components/ui";
import { db } from "@/db/client";
import { withUserContext } from "@/db/rls";
import { leagueMembers, leagues, userBadges, users } from "@/db/schema";
import { competitionByCode } from "@/lib/football/competitions";
import { BADGES, isBadgeKey } from "@/lib/stats/badges";

import { DisplayNameForm } from "./display-name-form";

// ── หน้าโปรไฟล์ของฉัน (/settings) ────────────────────────────────────────────────
//
// เดิมหน้านี้มีแค่ฟอร์มตั้งชื่อ — ยกระดับเป็นหน้าโปรไฟล์เต็ม: สถิติ เหรียญ และประวัติคำทาย
// ทั้งหมดของตัวเอง พร้อมตัวกรอง "ทั้งหมด / รายลีก" (กดจากชื่อตัวเองบนแถบเมนูมาถึงที่นี่)
//
// ต่างจากแท็บ "คำทายของฉัน" ในลีกตรง scope: แท็บนั้นเห็นเฉพาะลีกเดียว หน้านี้เห็นข้ามทุกลีก
// โดยใช้ชิ้นส่วนแสดงผลชุดเดียวกัน (components/prediction-history.tsx) หน้าตาจึงตรงกันเสมอ

export const metadata = { title: "โปรไฟล์ของฉัน · Pundit" };

type ProfileRow = HistoryRow & { competitionCode: string };

export default async function SettingsPage(props: {
  searchParams: Promise<{ league?: string | string[] }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/");
  const userId = session.user.id;

  const [me] = await db
    .select({
      name: users.name,
      displayName: users.displayName,
      email: users.email,
      bestStreak: users.bestStreak,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const myLeagues = await db
    .select({ id: leagues.id, name: leagues.name, seasonId: leagues.seasonId })
    .from(leagueMembers)
    .innerJoin(leagues, eq(leagueMembers.leagueId, leagues.id))
    .where(eq(leagueMembers.userId, userId))
    .orderBy(asc(leagues.name));

  const params = await props.searchParams;
  const requested = Array.isArray(params.league)
    ? params.league[0]
    : params.league;
  // ตรวจค่าใน URL กับลีกที่เป็นสมาชิกจริงเสมอ — ค่ามั่ว/ลีกคนอื่นตกไปเป็น "ทั้งหมด"
  const selectedLeague = myLeagues.find((l) => l.id === requested) ?? null;
  const leagueIds = selectedLeague
    ? [selectedLeague.id]
    : myLeagues.map((l) => l.id);

  // ประวัติคำทาย — ผ่าน withUserContext เพราะ RLS ซ่อนคำทายนัดที่ยังไม่เตะจากคนที่ไม่ประกาศตัว
  // แต้มต่อแถว: โหมดรายลีก = แต้มของลีกนั้น, โหมดทั้งหมด = ผลรวมทุกลีกที่อยู่ (คำทายเดียว
  // ถูกคิดคะแนนแยกทุกลีก คนอยู่สองลีกทายถูกหนึ่งนัดจึงได้ +3 สองก้อน = โชว์ +6 ตามจริง)
  const rows = leagueIds.length
    ? await withUserContext(userId, (tx) =>
        tx.execute<
          Omit<ProfileRow, "kickoffAt"> & { kickoffAt: string }
        >(sqlTag`
          select
            m.id as "matchId",
            m.matchday,
            m.kickoff_at as "kickoffAt",
            m.status::text as status,
            ht.name as "homeTeam",
            at.name as "awayTeam",
            ht.crest_url as "homeCrest",
            at.crest_url as "awayCrest",
            m.home_score as "homeScore",
            m.away_score as "awayScore",
            p.predicted_outcome as predicted,
            s.competition_code as "competitionCode",
            (
              select sum(ps.points_awarded)::int from prediction_scores ps
              where ps.prediction_id = p.id
                and ps.league_id = any(${leagueIds}::uuid[])
            ) as "pointsAwarded"
          from predictions p
          join matches m on m.id = p.match_id
          join seasons s on s.id = m.season_id
          join teams ht on ht.id = m.home_team_id
          join teams at on at.id = m.away_team_id
          where p.user_id = ${userId}::uuid
            ${
              selectedLeague
                ? sqlTag`and m.season_id = ${selectedLeague.seasonId}::uuid`
                : sqlTag``
            }
          order by m.kickoff_at desc
        `),
      )
    : [];

  const myBadges = await db
    .select({ badgeKey: userBadges.badgeKey })
    .from(userBadges)
    .where(eq(userBadges.userId, userId))
    .orderBy(userBadges.earnedAt);
  const badges = myBadges
    .map((row) => row.badgeKey)
    .filter(isBadgeKey)
    .map((key) => ({ key, ...BADGES[key] }));

  const finished = rows.filter((row) => actualOutcomeOf(row) !== null);
  const correct = finished.filter(
    (row) => actualOutcomeOf(row) === row.predicted,
  );
  const totalPoints = rows.reduce(
    (sum, row) => sum + (row.pointsAwarded ?? 0),
    0,
  );

  // จัดกลุ่ม "ลีก · แมตช์เดย์"— โหมดทั้งหมดมีสองฤดูกาลปนกัน เลขแมตช์เดย์เฉย ๆ ชนกันได้
  // แถวเรียง kickoff ใหม่→เก่ามาแล้ว กลุ่มจึงเรียงตามเวลาเองโดยธรรมชาติ ในกลุ่มกลับเป็นเก่า→ใหม่
  const groups = new Map<string, ProfileRow[]>();
  for (const row of rows) {
    const label = `${competitionByCode(row.competitionCode)?.shortName ?? row.competitionCode} · แมตช์เดย์ ${row.matchday}`;
    const group = groups.get(label) ?? [];
    group.push(row);
    groups.set(label, group);
  }

  const filterHref = (leagueId: string | null) =>
    leagueId ? `/settings?league=${leagueId}` : "/settings";

  return (
    <PageShell width="lg">
      <PageHeader
        title="โปรไฟล์ของฉัน"
        subtitle={me?.email ?? undefined}
        actions={
          <LinkButton href="/" variant="secondary">
            กลับหน้าแรก
          </LinkButton>
        }
      />

      <section className="mb-8">
        <SectionLabel>ชื่อที่แสดงในลีก</SectionLabel>
        <Card>
          <DisplayNameForm
            currentDisplayName={me?.displayName ?? null}
            googleName={me?.name ?? null}
          />
        </Card>
      </section>

      <section className="mb-4">
        <SectionLabel>สถิติการทาย</SectionLabel>
        {/* ตัวกรองเป็นลิงก์ล้วน (แนวเดียวกับตัวสลับลีกหน้า vs-ai) — บุ๊กมาร์กได้ ปุ่ม back ทำงาน */}
        <nav className="mb-4 flex flex-wrap gap-2" aria-label="กรองตามลีก">
          <FilterPill href={filterHref(null)} active={!selectedLeague}>
            ทั้งหมด
          </FilterPill>
          {myLeagues.map((league) => (
            <FilterPill
              key={league.id}
              href={filterHref(league.id)}
              active={selectedLeague?.id === league.id}
            >
              {league.name}
            </FilterPill>
          ))}
        </nav>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
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
          <StatCard
            label={selectedLeague ? "แต้มในลีกนี้" : "แต้มรวมทุกลีก"}
            value={`${totalPoints} แต้ม`}
          />
        </div>
        {!selectedLeague && myLeagues.length > 1 && (
          <p className="mt-2 text-xs text-muted">
            โหมดทั้งหมดนับแต้มรวมทุกลีก — คำทายเดียวกันถูกคิดคะแนนแยกในแต่ละลีกที่คุณอยู่
          </p>
        )}
      </section>

      <section className="mb-8">
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
      </section>

      <section className="flex flex-col gap-6">
        {rows.length === 0 ? (
          <EmptyState>
            ยังไม่มีคำทาย{selectedLeague ? "ในลีกนี้" : ""} — ไปที่{" "}
            <Link href="/leagues" className="text-accent hover:underline">
              ลีกของฉัน
            </Link>{" "}
            แล้วเริ่มทายได้เลย
          </EmptyState>
        ) : (
          [...groups.entries()].map(([label, group]) => (
            <section key={label}>
              <SectionLabel>{label}</SectionLabel>
              <Card padded={false} className="divide-y divide-border">
                {[...group].reverse().map((row) => (
                  <PredictionRow key={row.matchId} row={row} />
                ))}
              </Card>
            </section>
          ))
        )}
      </section>
    </PageShell>
  );
}

function FilterPill({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`rounded-lg border px-3 py-1.5 text-sm transition-colors ${
        active
          ? "border-transparent bg-accent text-accent-fg"
          : "border-border text-muted hover:bg-surface-hover hover:text-foreground"
      }`}
    >
      {children}
    </Link>
  );
}
