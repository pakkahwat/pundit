import Image from 'next/image';
import Link from 'next/link';

import type { StandingRow } from '@/lib/football/standings';

import { Card } from './ui';

// แถบฟอร์ม 5 นัดหลังสุด — API ส่งมาเป็นสตริง "W,D,L,W,W" (เก่าสุดไปใหม่สุด)
export function FormPills({ form }: { form: string | null }) {
  if (!form) return <span className="text-xs text-muted">—</span>;

  const tone: Record<string, string> = {
    W: 'bg-success/20 text-success',
    D: 'bg-muted/25 text-muted',
    L: 'bg-danger/20 text-danger',
  };
  const label: Record<string, string> = { W: 'ชนะ', D: 'เสมอ', L: 'แพ้' };

  return (
    <span className="flex gap-1">
      {form
        .split(',')
        .slice(-5)
        .map((raw, i) => {
          const r = raw.trim().toUpperCase();
          return (
            <span
              key={i}
              title={label[r] ?? r}
              className={`flex h-5 w-5 items-center justify-center rounded text-[10px] font-semibold ${
                tone[r] ?? 'bg-muted/25 text-muted'
              }`}
            >
              {r}
            </span>
          );
        })}
    </span>
  );
}

export function StandingsTable({
  table,
  competitionCode,
  compact = false,
}: {
  table: StandingRow[];
  competitionCode: string;
  compact?: boolean;
}) {
  return (
    <>
      {/* จอมือถือกว้างไม่พอสำหรับทุกคอลัมน์ — แทนที่จะปล่อยให้เลื่อนแล้ว "แต้ม" ซึ่งเป็นตัวเลข
          ที่คนเปิดตารางคะแนนมาดูเป็นอย่างแรกไปหลบอยู่นอกจอ เลือกซ่อนคอลัมน์รองแทน
          (ชนะ/เสมอ/แพ้ ซ้ำกับ "แข่ง" อยู่แล้ว, ฟอร์ม 5 นัดเป็นของแถม) แล้วค่อยโผล่กลับมาเมื่อจอกว้างพอ
          overflow-x-auto ยังคงไว้เผื่อชื่อทีมยาวผิดคาด — ให้เลื่อนในกรอบตัวเอง ไม่ใช่ทั้งหน้า */}
      <Card padded={false} className="overflow-x-auto">
        <table className="w-full text-sm md:min-w-[38rem]">
          <thead>
            <tr className="border-b border-border text-xs text-muted">
              <th className="px-3 py-3 text-left font-medium">#</th>
              <th className="py-3 pr-3 text-left font-medium">ทีม</th>
              <th className="px-2 py-3 text-center font-medium">แข่ง</th>
              {!compact && (
                <>
                  <th className="hidden px-2 py-3 text-center font-medium md:table-cell">ชนะ</th>
                  <th className="hidden px-2 py-3 text-center font-medium md:table-cell">เสมอ</th>
                  <th className="hidden px-2 py-3 text-center font-medium md:table-cell">แพ้</th>
                </>
              )}
              <th className="px-2 py-3 text-center font-medium">
                <span className="hidden md:inline">ได้-เสีย</span>
                <span className="md:hidden">+/-</span>
              </th>
              <th className="hidden px-2 py-3 text-center font-medium lg:table-cell">5 นัดหลัง</th>
              <th className="px-3 py-3 text-right font-medium">แต้ม</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {table.map((r) => (
              <tr key={r.team.id} className="transition-colors hover:bg-surface-hover">
                {/* แถบสีซ้ายบอกโซน: 1-4 ไปแชมเปียนส์ลีก, 3 อันดับท้ายตกชั้น — เป็นสิ่งแรกที่คนดู
                    ตารางมองหา และเป็นข้อมูลที่ API ไม่ได้บอกมา ต้องรู้กติกาลีกเอง */}
                <td className="px-3 py-3">
                  <span className="flex items-center gap-2">
                    <span
                      aria-hidden
                      className={`h-6 w-0.5 rounded-full ${
                        r.position <= 4
                          ? 'bg-accent'
                          : r.position >= table.length - 2
                            ? 'bg-danger'
                            : 'bg-transparent'
                      }`}
                    />
                    <span className="tabular-nums text-muted">{r.position}</span>
                  </span>
                </td>
                <td className="py-3 pr-3">
                  <Link
                    href={`/teams/${r.team.id}?competition=${competitionCode}`}
                    className="flex items-center gap-2 transition-colors hover:text-accent"
                  >
                    <Image
                      src={r.team.crest}
                      alt=""
                      width={20}
                      height={20}
                      className="h-5 w-5 shrink-0 object-contain"
                      unoptimized
                    />
                    <span className="truncate text-foreground">
                      {r.team.shortName ?? r.team.name}
                    </span>
                  </Link>
                </td>
                <td className="px-2 py-3 text-center tabular-nums text-muted">{r.playedGames}</td>
                {!compact && (
                  <>
                    <td className="hidden px-2 py-3 text-center tabular-nums text-muted md:table-cell">
                      {r.won}
                    </td>
                    <td className="hidden px-2 py-3 text-center tabular-nums text-muted md:table-cell">
                      {r.draw}
                    </td>
                    <td className="hidden px-2 py-3 text-center tabular-nums text-muted md:table-cell">
                      {r.lost}
                    </td>
                  </>
                )}
                <td className="whitespace-nowrap px-2 py-3 text-center tabular-nums text-muted">
                  <span className="hidden md:inline">
                    {r.goalsFor}-{r.goalsAgainst}
                  </span>
                  <span className="text-xs md:ml-1">
                    <span className="hidden md:inline">(</span>
                    {r.goalDifference > 0 ? '+' : ''}
                    {r.goalDifference}
                    <span className="hidden md:inline">)</span>
                  </span>
                </td>
                <td className="hidden px-2 py-3 lg:table-cell">
                  <span className="flex justify-center">
                    <FormPills form={r.form} />
                  </span>
                </td>
                <td className="px-3 py-3 text-right font-semibold tabular-nums text-foreground">
                  {r.points}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <p className="mt-3 flex flex-wrap gap-4 text-xs text-muted">
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="h-3 w-0.5 rounded-full bg-accent" /> แชมเปียนส์ลีก
        </span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="h-3 w-0.5 rounded-full bg-danger" /> ตกชั้น
        </span>
        <span>กดชื่อทีมเพื่อดูโปรแกรมแข่ง · ข้อมูลจาก football-data.org</span>
      </p>
    </>
  );
}
