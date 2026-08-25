import Link from 'next/link';
import { redirect } from 'next/navigation';

import { auth } from '@/auth';
import { StandingsTable } from '@/components/standings-table';
import { EmptyState, LinkButton, PageHeader, PageShell } from '@/components/ui';
import { COMPETITIONS, competitionByCode } from '@/lib/football/competitions';
import { getStandings } from '@/lib/football/standings';
import { LinkPending } from '@/components/link-pending';

export default async function StandingsPage(props: PageProps<'/standings'>) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect('/');
  }

  const searchParams = await props.searchParams;
  const raw = Array.isArray(searchParams.competition)
    ? searchParams.competition[0]
    : searchParams.competition;
  // ถ้าส่งรหัสที่ไม่รู้จักมา (คนแก้ URL เอง) ให้ตกกลับไปลีกแรกแทนที่จะพัง
  const code = competitionByCode(raw ?? '')?.code ?? COMPETITIONS[0].code;

  const { table, competitionName, currentMatchday, stale, fetchedAt } = await getStandings(code);

  return (
    <PageShell width="lg">
      <PageHeader
        title="ตารางคะแนน"
        subtitle={`${competitionName}${currentMatchday ? ` · แมตช์เดย์ ${currentMatchday}` : ''}`}
        actions={
          <LinkButton href="/" variant="secondary">
            กลับหน้าแรก
          </LinkButton>
        }
      />

      {/* สลับลีกด้วยลิงก์ธรรมดา ไม่ใช่ dropdown ที่ต้องใช้ JS — แต่ละลีกมี URL ของตัวเอง
          บุ๊กมาร์กได้ กดปุ่มย้อนกลับของเบราว์เซอร์ได้ตามปกติ */}
      <nav className="mb-4 flex flex-wrap gap-2">
        {COMPETITIONS.map((c) => (
          <Link
            key={c.code}
            href={`/standings?competition=${c.code}`}
            className={`relative rounded-lg border px-3 py-1.5 text-sm transition-colors ${
              c.code === code
                ? 'border-transparent bg-accent text-accent-fg'
                : 'border-border text-muted hover:bg-surface-hover hover:text-foreground'
            }`}
          >
            {c.shortName}
            <LinkPending />
          </Link>
        ))}
      </nav>

      {stale && (
        <p className="mb-3 text-xs text-muted">
          ดึงข้อมูลใหม่ไม่สำเร็จ กำลังแสดงข้อมูลที่บันทึกไว้เมื่อ{' '}
          {new Intl.DateTimeFormat('th-TH', {
            timeZone: 'Asia/Bangkok',
            dateStyle: 'short',
            timeStyle: 'short',
          }).format(fetchedAt)}
        </p>
      )}

      {table.length === 0 ? (
        <EmptyState>ยังไม่มีตารางคะแนนของลีกนี้ (ฤดูกาลอาจยังไม่เริ่ม)</EmptyState>
      ) : (
        <StandingsTable table={table} competitionCode={code} />
      )}
    </PageShell>
  );
}
