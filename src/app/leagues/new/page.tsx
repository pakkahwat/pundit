import { asc, eq } from 'drizzle-orm';
import { redirect } from 'next/navigation';

import { auth } from '@/auth';
import { Card, EmptyState, PageHeader, PageShell } from '@/components/ui';
import { db } from '@/db/client';
import { seasons } from '@/db/schema';
import { competitionLabel } from '@/lib/football/competitions';

import { CreateLeagueForm } from './create-league-form';

export default async function NewLeaguePage() {
  const session = await auth();
  if (!session?.user) {
    redirect('/');
  }

  // ให้เลือกเฉพาะลีกที่ sync ข้อมูลเข้ามาแล้วจริง ๆ ไม่ใช่ทุกลีกที่ตั้งไว้ในไฟล์ config —
  // ไม่งั้นผู้ใช้จะเลือกลีกที่ยังไม่มีโปรแกรมแข่งแล้วเจอหน้าทายผลว่างเปล่า
  const rows = await db
    .select({ code: seasons.competitionCode, name: seasons.name })
    .from(seasons)
    .where(eq(seasons.isActive, true))
    .orderBy(asc(seasons.competitionCode));

  const competitions = rows.map((r) => ({ code: r.code, name: competitionLabel(r.code, r.name) }));

  return (
    <PageShell width="sm">
      <PageHeader title="สร้างลีกใหม่" subtitle="แล้วส่งลิงก์เชิญให้เพื่อนเข้ามาทายด้วยกัน" />
      <Card>
        {competitions.length === 0 ? (
          <EmptyState>
            ยังไม่มีข้อมูลลีกในระบบ — รัน{' '}
            <code className="font-mono">npm run db:sync-fixtures</code> ก่อน
          </EmptyState>
        ) : (
          <CreateLeagueForm competitions={competitions} />
        )}
      </Card>
    </PageShell>
  );
}
