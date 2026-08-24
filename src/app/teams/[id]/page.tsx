import Image from 'next/image';
import { redirect } from 'next/navigation';

import { auth } from '@/auth';
import { Card, CenteredMessage, LinkButton, PageHeader, PageShell, SectionLabel } from '@/components/ui';
import { getTeamWithMatches, type TeamMatch } from '@/lib/football/team';

function formatMatchDate(utcDate: string) {
  return new Intl.DateTimeFormat('th-TH', {
    timeZone: 'Asia/Bangkok',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(utcDate));
}

function MatchRow({ m, teamId }: { m: TeamMatch; teamId: number }) {
  const finished = m.status === 'FINISHED' && m.score.fullTime.home != null;
  const isHome = m.homeTeam.id === teamId;
  const myScore = isHome ? m.score.fullTime.home : m.score.fullTime.away;
  const theirScore = isHome ? m.score.fullTime.away : m.score.fullTime.home;
  const result = !finished ? null : myScore! > theirScore! ? 'W' : myScore! < theirScore! ? 'L' : 'D';

  const resultTone = {
    W: 'bg-success/20 text-success',
    D: 'bg-muted/25 text-muted',
    L: 'bg-danger/20 text-danger',
  } as const;

  return (
    <li className="flex items-center gap-3 p-4">
      {result ? (
        <span
          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded text-xs font-semibold ${resultTone[result]}`}
        >
          {result}
        </span>
      ) : (
        <span className="h-6 w-6 shrink-0" />
      )}

      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2 text-sm">
          <span className={isHome ? 'font-medium text-foreground' : 'text-muted'}>
            {m.homeTeam.shortName ?? m.homeTeam.name}
          </span>
          {finished ? (
            <span className="rounded bg-surface-hover px-1.5 py-0.5 text-xs tabular-nums text-foreground">
              {m.score.fullTime.home}-{m.score.fullTime.away}
            </span>
          ) : (
            <span className="text-xs text-muted">พบ</span>
          )}
          <span className={!isHome ? 'font-medium text-foreground' : 'text-muted'}>
            {m.awayTeam.shortName ?? m.awayTeam.name}
          </span>
        </span>
        <span className="mt-0.5 block text-xs text-muted">
          {m.competition.name}
          {m.matchday ? ` · นัดที่ ${m.matchday}` : ''}
        </span>
      </span>

      <span className="shrink-0 text-xs text-muted">{formatMatchDate(m.utcDate)}</span>
    </li>
  );
}

export default async function TeamPage(props: PageProps<'/teams/[id]'>) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect('/');
  }

  const { id } = await props.params;
  const teamId = Number(id);
  if (!Number.isInteger(teamId)) {
    return <CenteredMessage title="ไม่พบทีมนี้" />;
  }

  const searchParams = await props.searchParams;
  const backTo = Array.isArray(searchParams.competition)
    ? searchParams.competition[0]
    : searchParams.competition;

  const { team, upcoming, finished } = await getTeamWithMatches(teamId);

  return (
    <PageShell width="lg">
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            {team.crest && (
              <Image
                src={team.crest}
                alt=""
                width={36}
                height={36}
                className="h-9 w-9 object-contain"
                unoptimized
              />
            )}
            {team.name}
          </span>
        }
        subtitle={[team.venue, team.founded ? `ก่อตั้ง ${team.founded}` : null]
          .filter(Boolean)
          .join(' · ')}
        actions={
          <LinkButton
            href={backTo ? `/standings?competition=${backTo}` : '/standings'}
            variant="secondary"
          >
            กลับตารางคะแนน
          </LinkButton>
        }
      />

      <div className="flex flex-col gap-8">
        <section>
          <SectionLabel>โปรแกรมแข่งถัดไป</SectionLabel>
          {upcoming.length === 0 ? (
            <Card>
              <p className="text-sm text-muted">ยังไม่มีโปรแกรมแข่งถัดไป</p>
            </Card>
          ) : (
            <Card padded={false}>
              <ul className="divide-y divide-border">
                {upcoming.slice(0, 10).map((m) => (
                  <MatchRow key={m.id} m={m} teamId={teamId} />
                ))}
              </ul>
            </Card>
          )}
        </section>

        <section>
          <SectionLabel>ผลการแข่งขันล่าสุด</SectionLabel>
          {finished.length === 0 ? (
            <Card>
              <p className="text-sm text-muted">ยังไม่มีนัดที่แข่งจบ</p>
            </Card>
          ) : (
            <Card padded={false}>
              <ul className="divide-y divide-border">
                {finished.slice(0, 10).map((m) => (
                  <MatchRow key={m.id} m={m} teamId={teamId} />
                ))}
              </ul>
            </Card>
          )}
        </section>
      </div>
    </PageShell>
  );
}
