import { and, eq, sql } from 'drizzle-orm';
import { redirect } from 'next/navigation';

import { auth } from '@/auth';
import { Badge, Card, CenteredMessage, EmptyState, LinkButton, PageHeader, PageShell } from '@/components/ui';
import { LeagueNav } from '@/components/league-nav';
import { db } from '@/db/client';
import { leagueMembers, leagues, seasons } from '@/db/schema';
import { pendingPredictionCount } from '@/lib/leagues/pending';

type LeaderboardRow = {
  user_id: string;
  name: string | null;
  player_kind: 'human' | 'ai';
  total_points: number;
  scored_matches: number;
};

export default async function LeaderboardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) {
    redirect('/');
  }
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
  const pending = season
    ? await pendingPredictionCount(league.seasonId, season.currentMatchday ?? 1, userId)
    : 0;

  // ใช้ raw SQL (ผ่าน db.execute) แทนประกอบผ่าน Drizzle query builder เพราะเป็น aggregate +
  // subquery join ที่เขียนเป็น SQL ตรง ๆ อ่านง่ายกว่า — ไม่ต้องผ่าน withUserContext เลย เพราะ
  // prediction_scores ไม่มี RLS (ดูคอมเมนต์ schema.sql: จะมีแถวก็ต่อเมื่อแมตช์ FINISHED แล้วเท่านั้น
  // ซึ่งแปลว่าปิดรับทายไปแล้วเสมอ เปิดเผยคะแนนรวมได้อย่างปลอดภัยโดยธรรมชาติของเงื่อนไข)
  const rows = await db.execute<LeaderboardRow>(sql`
    select
      lm.user_id,
      coalesce(u.display_name, u.name) as name,
      u.player_kind,
      coalesce(scores.total_points, 0)::int as total_points,
      coalesce(scores.scored_matches, 0)::int as scored_matches
    from league_members lm
    join users u on u.id = lm.user_id
    left join (
      select p.user_id, sum(ps.points_awarded) as total_points, count(*) as scored_matches
      from prediction_scores ps
      join predictions p on p.id = ps.prediction_id
      where ps.league_id = ${id}::uuid
      group by p.user_id
    ) scores on scores.user_id = lm.user_id
    where lm.league_id = ${id}::uuid
    order by total_points desc, name asc
  `);

  const anyScored = rows.some((r) => r.scored_matches > 0);

  return (
    <PageShell width="lg">
      <PageHeader
        title={league.name}
        subtitle="อันดับคะแนนสะสมของทุกคนในลีกนี้"
        actions={
          <LinkButton href="/vs-ai" variant="secondary" size="sm">
            ดูสถิติคนปะทะ AI →
          </LinkButton>
        }
      />

      <LeagueNav leagueId={id} active="leaderboard" pendingCount={pending} />

      {rows.length === 0 ? (
        <EmptyState>ยังไม่มีผู้เล่นในลีกนี้</EmptyState>
      ) : (
        <>
          {!anyScored && (
            <p className="mb-3 text-sm text-muted">ยังไม่มีนัดไหนจบและคิดคะแนน — ทุกคนเริ่มที่ 0</p>
          )}
          <Card padded={false}>
            <ol className="divide-y divide-border">
              {rows.map((r, i) => (
                <li
                  key={r.user_id}
                  className={`flex items-center gap-3 p-4 ${r.user_id === userId ? 'bg-accent-soft/40' : ''}`}
                >
                  <span className="w-6 shrink-0 text-sm tabular-nums text-muted">{i + 1}</span>
                  <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                    {r.name}
                    {r.player_kind === 'ai' && (
                      <span className="ml-2">
                        <Badge tone="accent">AI</Badge>
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 text-xs text-muted">{r.scored_matches} นัด</span>
                  <span className="w-14 shrink-0 text-right font-semibold tabular-nums text-foreground">
                    {r.total_points}
                  </span>
                </li>
              ))}
            </ol>
          </Card>
        </>
      )}
    </PageShell>
  );
}
