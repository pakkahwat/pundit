import { asc, eq, sql } from 'drizzle-orm';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { auth } from '@/auth';
import { Badge, Button, Card, EmptyState, LinkButton, PageHeader, PageShell } from '@/components/ui';
import { db } from '@/db/client';
import { leagues, seasons } from '@/db/schema';

import { joinLeagueById } from './actions';

// หน้ารวมลีกทั้งหมดที่เปิดให้เข้าร่วมได้เลย ไม่ต้องมีลิงก์เชิญ — ลดขั้นตอนจาก
// "ขอลิงก์จากเพื่อน -> เปิดลิงก์ -> กดเข้าร่วม" เหลือ "เลือกลีก -> เริ่มทาย"
// ลิงก์เชิญยังใช้ได้เหมือนเดิม เอาไว้ชวนคนที่ยังไม่เคยเข้าเว็บโดยตรง
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

  return (
    <PageShell>
      <PageHeader
        title="ลีกทั้งหมด"
        subtitle="เลือกลีกแล้วเริ่มทายได้เลย ไม่ต้องมีลิงก์เชิญ"
        actions={
          <>
            <LinkButton href="/leagues/new" variant="secondary">
              สร้างลีกใหม่
            </LinkButton>
            <LinkButton href="/" variant="secondary">
              กลับหน้าแรก
            </LinkButton>
          </>
        }
      />

      {rows.length === 0 ? (
        <EmptyState>ยังไม่มีลีกในระบบ — สร้างลีกแรกเลย</EmptyState>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((l) => (
            <li key={l.id}>
              <Card className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-medium text-foreground">{l.name}</p>
                  <p className="mt-0.5 text-xs text-muted">
                    {l.seasonName} · {l.memberCount} ผู้เล่น
                  </p>
                </div>

                {l.isMember ? (
                  <span className="flex shrink-0 items-center gap-2">
                    <Badge tone="accent">เข้าร่วมแล้ว</Badge>
                    <Link
                      href={`/leagues/${l.id}/predict`}
                      className="text-sm text-accent hover:underline"
                    >
                      ไปทายผล
                    </Link>
                  </span>
                ) : (
                  // .bind ผูก leagueId เข้าไปกับ Server Action ล่วงหน้า ทำให้ฟอร์มนี้ไม่ต้องมี
                  // hidden input ที่ผู้ใช้แก้ค่าเองได้จาก devtools
                  <form action={joinLeagueById.bind(null, l.id)} className="shrink-0">
                    <Button type="submit" size="sm">
                      เข้าร่วมแล้วทายเลย
                    </Button>
                  </form>
                )}
              </Card>
            </li>
          ))}
        </ul>
      )}
    </PageShell>
  );
}
