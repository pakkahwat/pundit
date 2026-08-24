import { and, eq } from 'drizzle-orm';
import { Suspense } from 'react';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

import { auth } from '@/auth';
import {
  Badge,
  Card,
  CenteredMessage,
  LinkButton,
  PageHeader,
  PageShell,
  SectionLabel,
} from '@/components/ui';
import { StandingsTable } from '@/components/standings-table';
import { db } from '@/db/client';
import { leagueMembers, leagues, seasons, users } from '@/db/schema';
import { displayNameSql } from '@/lib/display-name';
import { competitionLabel } from '@/lib/football/competitions';
import { getStandings } from '@/lib/football/standings';

export default async function LeaguePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) {
    redirect('/');
  }

  const [league] = await db.select().from(leagues).where(eq(leagues.id, id)).limit(1);
  if (!league) {
    return <CenteredMessage title="ไม่พบลีกนี้" />;
  }

  // เช็ค membership ก่อนโชว์อะไรทั้งนั้น — คนที่ไม่ใช่สมาชิกไม่ควรรู้ด้วยซ้ำว่าลีกนี้มีใครอยู่บ้าง
  const [membership] = await db
    .select()
    .from(leagueMembers)
    .where(and(eq(leagueMembers.leagueId, id), eq(leagueMembers.userId, session.user.id)))
    .limit(1);
  if (!membership) {
    return <CenteredMessage title="คุณไม่ได้เป็นสมาชิกลีกนี้" />;
  }

  const [season] = await db
    .select()
    .from(seasons)
    .where(eq(seasons.id, league.seasonId))
    .limit(1);

  const members = await db
    .select({
      name: displayNameSql,
      email: users.email,
      role: leagueMembers.role,
      playerKind: users.playerKind,
    })
    .from(leagueMembers)
    .innerJoin(users, eq(leagueMembers.userId, users.id))
    .where(eq(leagueMembers.leagueId, id));

  // headers() เป็น async เหมือน params ใน Next 16 — ใช้ต่อ origin จริงของ request เพื่อสร้าง
  // ลิงก์เชิญแบบ absolute URL (ใช้ได้ทั้ง localhost ตอน dev และโดเมนจริงตอน deploy โดยไม่ต้อง hardcode)
  const hdrs = await headers();
  const origin = `${hdrs.get('x-forwarded-proto') ?? 'http'}://${hdrs.get('host')}`;
  const inviteUrl = `${origin}/join/${league.inviteCode}`;

  return (
    <PageShell>
      <PageHeader
        title={league.name}
        subtitle={`${competitionLabel(season?.competitionCode ?? '', season?.name ?? '')} · ${members.length} ผู้เล่น`}
        actions={
          <>
            <LinkButton href={`/leagues/${id}/predict`}>ทายผล</LinkButton>
            <LinkButton href={`/leagues/${id}/leaderboard`} variant="secondary">
              ตารางคะแนน
            </LinkButton>
            <LinkButton href={`/leagues/${id}/reveal`} variant="secondary">
              คำทายทุกคน
            </LinkButton>
          </>
        }
      />

      <div className="flex flex-col gap-6">
        <section>
          <SectionLabel>ลิงก์เชิญเพื่อน</SectionLabel>
          <Card padded={false}>
            <code className="block break-all p-4 font-mono text-sm text-muted">{inviteUrl}</code>
          </Card>
        </section>

        <section>
          <SectionLabel>ผู้เล่น</SectionLabel>
          <Card padded={false}>
            <ul className="divide-y divide-border">
              {members.map((m) => (
                <li key={m.email ?? m.name} className="flex items-center justify-between gap-3 p-4">
                  <span className="truncate text-sm text-foreground">{m.name}</span>
                  <span className="flex shrink-0 gap-1.5">
                    {m.playerKind === 'ai' && <Badge tone="accent">AI</Badge>}
                    {m.role === 'owner' && <Badge>เจ้าของ</Badge>}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </section>

        {/* ตารางคะแนนของลีกฟุตบอลที่กลุ่มนี้เลือกทาย — ดึงสดจาก API ผ่านแคช 30 นาที
            ห่อด้วย Suspense เพราะเป็น fetch ออกเน็ตซึ่งช้ากว่า query DB มาก ถ้าไม่ห่อ
            ทั้งหน้าจะรอตารางคะแนนก่อนถึงจะแสดงอะไรได้เลย ทั้งที่ส่วนอื่นพร้อมแล้ว */}
        {season && (
          <section>
            <SectionLabel>
              ตารางคะแนน{competitionLabel(season.competitionCode, season.name)}
            </SectionLabel>
            <Suspense
              fallback={<p className="text-sm text-muted">กำลังโหลดตารางคะแนน...</p>}
            >
              <LeagueStandings code={season.competitionCode} />
            </Suspense>
          </section>
        )}
      </div>
    </PageShell>
  );
}

// แยกออกมาเป็น component ต่างหากเพื่อให้ Suspense ข้างบนกั้นเฉพาะส่วนนี้ได้จริง
// (Suspense กั้นได้เฉพาะ component ที่ await อยู่ข้างใน ไม่ใช่ค่าที่ await มาแล้วจากข้างนอก)
async function LeagueStandings({ code }: { code: string }) {
  const { table } = await getStandings(code);
  if (table.length === 0) {
    return <p className="text-sm text-muted">ยังไม่มีตารางคะแนน (ฤดูกาลอาจยังไม่เริ่ม)</p>;
  }
  return <StandingsTable table={table} competitionCode={code} compact />;
}
