import { asc, eq, sql } from 'drizzle-orm';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { auth } from '@/auth';
import { Badge, Card, EmptyState, LinkButton, PageHeader, PageShell, SectionLabel } from '@/components/ui';
import { db } from '@/db/client';
import { leagues, seasons } from '@/db/schema';
import { competitionLabel } from '@/lib/football/competitions';

import { joinLeagueById } from './actions';
import { SubmitButton } from '@/components/submit-button';

// หน้ารวมลีกทั้งหมดที่เปิดให้เข้าร่วมได้เลย ไม่ต้องมีลิงก์เชิญ — ลดขั้นตอนจาก
// "ขอลิงก์จากเพื่อน -> เปิดลิงก์ -> กดเข้าร่วม" เหลือ "เลือกลีก -> เริ่มทาย"
// ลิงก์เชิญยังใช้ได้เหมือนเดิม เอาไว้ชวนคนที่ยังไม่เคยเข้าเว็บโดยตรง
//
// แยกเป็นสองกลุ่มชัดเจน (ลีกที่อยู่แล้ว / ลีกอื่นที่เข้าได้) เพราะเดิมปนกันในรายการเดียว
// ผู้ใช้ที่เข้ามาเพื่อ "ไปทายในลีกตัวเอง" ต้องกวาดตาหาว่าอันไหนมีป้าย "เข้าร่วมแล้ว"
export default async function LeaguesPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect('/');
  }
  const userId = session.user.id;

  const rows = await db
    .select({
      id: leagues.id,
      name: leagues.name,
      seasonName: seasons.name,
      competitionCode: seasons.competitionCode,
      currentMatchday: seasons.currentMatchday,
      memberCount: sql<number>`(
        select count(*)::int from league_members lm where lm.league_id = ${leagues.id}
      )`,
      isMember: sql<boolean>`exists (
        select 1 from league_members lm
        where lm.league_id = ${leagues.id} and lm.user_id = ${userId}::uuid
      )`,
    })
    .from(leagues)
    .innerJoin(seasons, eq(seasons.id, leagues.seasonId))
    .orderBy(asc(leagues.name));

  const mine = rows.filter((l) => l.isMember);
  const others = rows.filter((l) => !l.isMember);

  return (
    <PageShell width="lg">
      <PageHeader
        title="ลีกของฉัน"
        subtitle="ลีกที่คุณอยู่ และลีกอื่นที่เข้าร่วมได้ทันทีโดยไม่ต้องมีลิงก์เชิญ"
        actions={
          <LinkButton href="/leagues/new">สร้างลีกใหม่</LinkButton>
        }
      />

      <div className="flex flex-col gap-8">
        <section>
          <SectionLabel>ลีกที่คุณอยู่ ({mine.length})</SectionLabel>

          {mine.length === 0 ? (
            <EmptyState>
              ยังไม่ได้อยู่ลีกไหน — เลือกจากรายการข้างล่าง หรือสร้างลีกใหม่ชวนเพื่อนมาแข่ง
            </EmptyState>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2">
              {mine.map((l) => (
                <li key={l.id}>
                  <Link href={`/leagues/${l.id}`} className="block h-full">
                    <Card className="flex h-full animate-fade-up flex-col justify-between gap-3 transition-all duration-200 hover:-translate-y-0.5 hover:border-accent/50 hover:bg-surface-hover">
                      <div className="min-w-0">
                        <p className="truncate font-display text-base font-semibold text-foreground">
                          {l.name}
                        </p>
                        <p className="mt-0.5 text-xs text-muted">
                          {competitionLabel(l.competitionCode, l.seasonName)} · {l.memberCount} ผู้เล่น
                          {l.currentMatchday ? ` · แมตช์เดย์ ${l.currentMatchday}` : ''}
                        </p>
                      </div>
                      <span className="flex items-center justify-between gap-2">
                        <Badge tone="accent">เข้าร่วมแล้ว</Badge>
                        <span className="text-xs font-medium text-accent">เปิดลีก →</span>
                      </span>
                    </Card>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <SectionLabel>ลีกอื่นที่เข้าร่วมได้ ({others.length})</SectionLabel>

          {others.length === 0 ? (
            <EmptyState>
              {rows.length === 0
                ? 'ยังไม่มีลีกในระบบ — สร้างลีกแรกเลย'
                : 'คุณอยู่ครบทุกลีกที่มีในระบบแล้ว'}
            </EmptyState>
          ) : (
            <ul className="flex flex-col gap-2">
              {others.map((l) => (
                <li key={l.id}>
                  <Card className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-foreground">{l.name}</p>
                      <p className="mt-0.5 text-xs text-muted">
                        {competitionLabel(l.competitionCode, l.seasonName)} · {l.memberCount} ผู้เล่น
                      </p>
                    </div>

                    {/* .bind ผูก leagueId เข้าไปกับ Server Action ล่วงหน้า ทำให้ฟอร์มนี้ไม่ต้องมี
                        hidden input ที่ผู้ใช้แก้ค่าเองได้จาก devtools */}
                    <form action={joinLeagueById.bind(null, l.id)} className="shrink-0">
                      <SubmitButton size="sm">เข้าร่วมแล้วทายเลย</SubmitButton>
                    </form>
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </PageShell>
  );
}
