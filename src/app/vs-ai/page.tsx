import { asc, eq } from 'drizzle-orm';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { auth } from '@/auth';
import { AccuracyChart, type ChartPoint } from '@/components/accuracy-chart';
import { LinkPending } from '@/components/link-pending';
import { TeamCrest } from '@/components/team-crest';
import { Badge, Card, EmptyState, PageHeader, PageShell, SectionLabel } from '@/components/ui';
import {
  accuracyPct,
  getAccuracyByMatchday,
  getBiggestSplits,
  getPlayerAccuracy,
  getVsAiSummary,
  toCumulativePoints,
  type SplitMatch,
} from '@/lib/stats/vs-ai';
import { db } from '@/db/client';
import { leagueMembers, leagues } from '@/db/schema';

// หน้าที่ตอบคำถามหลักของทั้งโปรเจกต์: AI ทายแม่นกว่าคนไหม
//
// leaderboard ตอบไม่ได้เพราะมันวัด "แต้ม" ซึ่งผันตามกติกาของแต่ละลีกและปนคนกับ AI อยู่ในตาราง
// เดียวกัน หน้านี้วัด "ความแม่น" (ทายถูกกี่ % ของที่ทายทั้งหมด) ซึ่งเทียบข้ามกลุ่มได้ตรง ๆ

export default async function VsAiPage(props: PageProps<'/vs-ai'>) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect('/');
  }

  const myLeagues = await db
    .select({ id: leagues.id, name: leagues.name })
    .from(leagueMembers)
    .innerJoin(leagues, eq(leagueMembers.leagueId, leagues.id))
    .where(eq(leagueMembers.userId, session.user.id))
    .orderBy(asc(leagues.name));

  // อ่านลีกที่เลือกจาก ?league= แล้วตรวจกับรายชื่อลีกที่ผู้ใช้เป็นสมาชิกจริง — ไม่เชื่อค่าใน URL
  // ตรง ๆ ไม่งั้นแก้ค่าเองแล้วดูสถิติของลีกที่ตัวเองไม่ได้อยู่ได้
  const searchParams = await props.searchParams;
  const raw = Array.isArray(searchParams.league) ? searchParams.league[0] : searchParams.league;
  const selectedLeague = myLeagues.find((l) => l.id === raw);
  const leagueId = selectedLeague?.id;

  const [summary, byMatchday, players, splits] = await Promise.all([
    getVsAiSummary(leagueId),
    getAccuracyByMatchday(leagueId),
    getPlayerAccuracy(leagueId),
    getBiggestSplits(leagueId),
  ]);

  const humanPct = accuracyPct(summary.human);
  const aiPct = accuracyPct(summary.ai);
  const hasData = summary.human.total > 0 || summary.ai.total > 0;

  const chartPoints: ChartPoint[] = toCumulativePoints(byMatchday);

  return (
    <PageShell width="lg">
      <PageHeader
        title="คนปะทะ AI"
        subtitle={
          selectedLeague
            ? `เฉพาะผู้เล่นในลีก "${selectedLeague.name}" — วัดจากความแม่น ไม่ใช่แต้ม`
            : 'ภาพรวมทุกลีกในระบบ — วัดจากความแม่น ไม่ใช่แต้ม จึงเทียบกันได้ตรง ๆ'
        }
      />

      {/* ตัวสลับลีก — ใช้ลิงก์ล้วนไม่ใช่ dropdown แบบ JS เพื่อให้บุ๊กมาร์กหน้า "สถิติลีกเรา"
          ไว้ได้และปุ่มย้อนกลับของเบราว์เซอร์ทำงานถูกต้อง (แนวเดียวกับตัวสลับลีกในหน้าตารางคะแนน) */}
      {myLeagues.length > 0 && (
        <div className="mb-6 -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <div className="inline-flex min-w-full gap-1 rounded-xl border border-border bg-surface p-1">
            <LeagueTab href="/vs-ai" label="ทุกลีก" active={!leagueId} />
            {myLeagues.map((l) => (
              <LeagueTab
                key={l.id}
                href={`/vs-ai?league=${l.id}`}
                label={l.name}
                active={leagueId === l.id}
              />
            ))}
          </div>
        </div>
      )}

      {!hasData ? (
        <EmptyState>
          {selectedLeague
            ? `ยังไม่มีนัดไหนในลีก "${selectedLeague.name}" ที่จบพร้อมคำทาย`
            : 'ยังไม่มีนัดไหนจบพร้อมคำทาย — ตัวเลขจะเริ่มขึ้นเองหลังแมตช์เดย์แรกจบและระบบคิดคะแนนแล้ว'}
        </EmptyState>
      ) : (
        <div className="flex flex-col gap-10">
          <ScoreboardCard
            humanPct={humanPct}
            aiPct={aiPct}
            humanTotal={summary.human.total}
            aiTotal={summary.ai.total}
            matchesCovered={summary.matchesCovered}
          />

          {chartPoints.length >= 2 && (
            <section>
              <SectionLabel>ความแม่นสะสมตลอดฤดูกาล</SectionLabel>
              <Card>
                <AccuracyChart points={chartPoints} />
              </Card>
            </section>
          )}

          <section>
            <SectionLabel>ความแม่นรายคน</SectionLabel>
            <Card padded={false}>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs text-muted">
                      <th className="px-4 py-3 font-medium">ผู้เล่น</th>
                      <th className="px-4 py-3 text-right font-medium">ทายถูก</th>
                      <th className="px-4 py-3 text-right font-medium">ทายไป</th>
                      <th className="px-4 py-3 text-right font-medium">ความแม่น</th>
                    </tr>
                  </thead>
                  <tbody>
                    {players.map((p) => {
                      const pct = accuracyPct(p);
                      return (
                        <tr key={p.userId} className="border-b border-border last:border-0">
                          <td className="px-4 py-3">
                            <span className="flex items-center gap-2">
                              <span
                                aria-hidden
                                className="h-2 w-2 shrink-0 rounded-full"
                                style={{
                                  background:
                                    p.playerKind === 'ai'
                                      ? 'var(--series-ai)'
                                      : 'var(--series-human)',
                                }}
                              />
                              <span className="truncate text-foreground">{p.name}</span>
                              {p.playerKind === 'ai' && <Badge tone="accent">AI</Badge>}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums text-muted">
                            {p.correct}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums text-muted">
                            {p.total}
                          </td>
                          <td className="px-4 py-3 text-right font-semibold tabular-nums text-foreground">
                            {pct === null ? '—' : `${pct.toFixed(0)}%`}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          </section>

          {(splits.aiWon.length > 0 || splits.humansWon.length > 0) && (
            <section>
              <SectionLabel>นัดที่เห็นต่างกันมากที่สุด</SectionLabel>
              <div className="grid gap-3 sm:grid-cols-2">
                <SplitList
                  title="นัดที่ AI อ่านขาดกว่าคน"
                  emptyText="ยังไม่มีนัดที่ AI ชนะคนแบบชัดเจน"
                  matches={splits.aiWon}
                />
                <SplitList
                  title="นัดที่คนอ่านขาดกว่า AI"
                  emptyText="ยังไม่มีนัดที่คนชนะ AI แบบชัดเจน"
                  matches={splits.humansWon}
                />
              </div>
            </section>
          )}
        </div>
      )}
    </PageShell>
  );
}

// การ์ดสรุปหลัก — ตัวเลขเดียวที่คนเข้ามาหน้านี้เพื่อดู จึงให้ใหญ่ที่สุดบนหน้าและไม่มีอะไรแย่งซีน
// ใช้ font-sans ไม่ใช่ font-display เพราะตัวเลขขนาดใหญ่ในฟอนต์หัวข้ออ่านเหมือนของตกแต่ง
// และไม่ใส่ tabular-nums เพราะตัวเลขขนาดใหญ่ที่บังคับความกว้างเท่ากันจะดูห่างผิดปกติ
function ScoreboardCard({
  humanPct,
  aiPct,
  humanTotal,
  aiTotal,
  matchesCovered,
}: {
  humanPct: number | null;
  aiPct: number | null;
  humanTotal: number;
  aiTotal: number;
  matchesCovered: number;
}) {
  const verdict = (() => {
    if (humanPct === null || aiPct === null) return 'ยังเทียบไม่ได้ — ต้องมีคำทายจากทั้งสองฝั่งก่อน';
    const diff = aiPct - humanPct;
    if (Math.abs(diff) < 1) return 'ตอนนี้สูสีกันมาก แทบไม่ต่างกันเลย';
    return diff > 0
      ? `ตอนนี้ AI นำอยู่ ${diff.toFixed(1)} จุด`
      : `ตอนนี้คนนำอยู่ ${Math.abs(diff).toFixed(1)} จุด`;
  })();

  return (
    <Card className="animate-fade-up">
      <div className="grid grid-cols-2 gap-4">
        <Side
          label="คน"
          pct={humanPct}
          total={humanTotal}
          color="var(--series-human)"
          leading={humanPct !== null && aiPct !== null && humanPct > aiPct}
        />
        <Side
          label="AI"
          pct={aiPct}
          total={aiTotal}
          color="var(--series-ai)"
          leading={humanPct !== null && aiPct !== null && aiPct > humanPct}
        />
      </div>

      <p className="mt-5 border-t border-border pt-4 text-center text-sm text-foreground">
        {verdict}
        <span className="mt-0.5 block text-xs text-muted">
          จาก {matchesCovered} นัดที่จบแล้วและมีคนทาย
        </span>
      </p>
    </Card>
  );
}

function Side({
  label,
  pct,
  total,
  color,
  leading,
}: {
  label: string;
  pct: number | null;
  total: number;
  color: string;
  leading: boolean;
}) {
  return (
    <div className="text-center">
      <p className="flex items-center justify-center gap-2 text-sm font-medium text-foreground">
        <span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
        {label}
      </p>
      <p className="mt-2 font-sans text-5xl font-semibold text-foreground">
        {pct === null ? '—' : `${pct.toFixed(0)}%`}
      </p>
      <p className="mt-1 text-xs text-muted">
        ทายไป {total} ครั้ง
        {/* ป้าย "นำอยู่" เป็นตัวหนังสือ ไม่ได้บอกด้วยสีอย่างเดียว คนที่แยกสีไม่ออกก็ยังรู้ */}
        {leading && <span className="ml-1 font-medium text-foreground">· นำอยู่</span>}
      </p>
    </div>
  );
}

function SplitList({
  title,
  emptyText,
  matches,
}: {
  title: string;
  emptyText: string;
  matches: SplitMatch[];
}) {
  return (
    <Card padded={false}>
      <p className="border-b border-border px-4 py-3 text-sm font-medium text-foreground">{title}</p>
      {matches.length === 0 ? (
        <p className="px-4 py-4 text-sm text-muted">{emptyText}</p>
      ) : (
        <ul className="divide-y divide-border">
          {matches.map((m) => (
            <li key={m.matchId} className="px-4 py-3">
              <p className="flex items-center gap-1.5 text-sm text-foreground">
                <TeamCrest src={m.homeCrest} size={16} />
                <span className="truncate">{m.homeTeam}</span>
                <span className="mx-0.5 shrink-0 rounded bg-surface-hover px-1.5 py-0.5 text-xs tabular-nums">
                  {m.homeScore}-{m.awayScore}
                </span>
                <TeamCrest src={m.awayCrest} size={16} />
                <span className="truncate">{m.awayTeam}</span>
              </p>
              <p className="mt-1 text-xs text-muted">
                คน {m.humanCorrect}/{m.humanTotal} · AI {m.aiCorrect}/{m.aiTotal}
              </p>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

// ปุ่มแท็บเลือกลีก — หน้าตาเดียวกับแท็บในหน้าลีกเพื่อให้ผู้ใช้จำรูปแบบได้
function LeagueTab({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={`relative flex-1 whitespace-nowrap rounded-lg px-3 py-2 text-center text-sm font-medium transition-colors ${
        active
          ? 'bg-accent text-accent-fg'
          : 'text-muted hover:bg-surface-hover hover:text-foreground'
      }`}
    >
      {label}
      <LinkPending />
    </Link>
  );
}
