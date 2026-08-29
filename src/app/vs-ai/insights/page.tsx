import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { PlayerAvatar } from "@/components/player-avatar";
import {
  Badge,
  Card,
  EmptyState,
  LinkButton,
  PageHeader,
  PageShell,
  SectionLabel,
} from "@/components/ui";
import {
  getConditionBreakdown,
  getUpsetMatches,
} from "@/lib/stats/ai-insights";
import { competitionByCode } from "@/lib/football/competitions";

// ── เจาะลึก AI: ใครแม่นตรงไหน และนัดไหนหักปากกาทั้งลีก ───────────────────────────
//
// หน้า /vs-ai ตอบว่า "ใครแม่นกว่า" — หน้านี้ตอบต่อว่า "แม่นแบบไหน": AI บางตัวกล้าทายเสมอ
// บางตัวเทเหย้าอย่างเดียว บางตัวแม่นทีมเยือนผิดปกติ ทั้งหมดอ่านจากคำทายที่ออกผลแล้วล้วน ๆ

export const metadata = { title: "เจาะลึก AI · Pundit" };

function pct(correct: number, total: number): string {
  if (total === 0) return "—";
  return `${Math.round((correct / total) * 100)}%`;
}

export default async function AiInsightsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/");

  const [breakdown, upsets] = await Promise.all([
    getConditionBreakdown(),
    getUpsetMatches(),
  ]);

  return (
    <PageShell width="lg">
      <PageHeader
        title="เจาะลึกการทาย"
        subtitle="ความแม่นแยกตามเงื่อนไข และนัดที่หักปากกาทั้งลีก — นับทุกลีกรวมกัน"
        actions={
          <LinkButton href="/vs-ai" variant="secondary">
            กลับหน้าคนปะทะ AI
          </LinkButton>
        }
      />

      <section className="mb-8">
        <SectionLabel>ความแม่นแยกตามชนิดผลที่ทาย</SectionLabel>
        {breakdown.length === 0 ? (
          <EmptyState>ยังไม่มีคำทายที่ออกผล</EmptyState>
        ) : (
          <Card padded={false} className="overflow-x-auto">
            <table className="w-full min-w-[42rem] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted">
                  <th className="p-3 font-medium">ผู้ทาย</th>
                  <th className="p-3 font-medium">รวม</th>
                  <th className="p-3 font-medium">ทายเหย้า</th>
                  <th className="p-3 font-medium">ทายเยือน</th>
                  <th className="p-3 font-medium" title="สัดส่วนที่กล้าทายเสมอ และแม่นแค่ไหน">
                    กล้าทายเสมอ
                  </th>
                  <th className="p-3 font-medium">ตอบเฉลี่ย</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {breakdown.map((row) => (
                  <tr key={`${row.name}-${row.agentKey}`}>
                    <td className="p-3">
                      <span className="flex items-center gap-2">
                        <PlayerAvatar
                          image={null}
                          name={row.name}
                          isAi={row.isAi}
                          agentKey={row.agentKey}
                          size={22}
                        />
                        <span className="max-w-40 truncate">{row.name}</span>
                        {row.isAi && <Badge tone="accent">AI</Badge>}
                      </span>
                    </td>
                    <td className="p-3 tabular-nums">
                      <span className="font-medium text-foreground">
                        {pct(row.correct, row.total)}
                      </span>
                      <span className="text-xs text-muted"> ({row.total})</span>
                    </td>
                    <td className="p-3 tabular-nums">
                      {pct(row.homeCorrect, row.homeTotal)}
                      <span className="text-xs text-muted"> ({row.homeTotal})</span>
                    </td>
                    <td className="p-3 tabular-nums">
                      {pct(row.awayCorrect, row.awayTotal)}
                      <span className="text-xs text-muted"> ({row.awayTotal})</span>
                    </td>
                    <td className="p-3 tabular-nums">
                      {/* เสมอคือผลที่กล้าทายยากสุด — โชว์ทั้ง "กล้าแค่ไหน" (สัดส่วนครั้ง) และแม่นไหม */}
                      {row.drawPredicted > 0
                        ? `${Math.round((row.drawPredicted / row.total) * 100)}% · ถูก ${pct(row.drawCorrect, row.drawPredicted)}`
                        : "ไม่เคยทาย"}
                    </td>
                    <td className="p-3 tabular-nums text-xs text-muted">
                      {row.avgLatencyMs !== null
                        ? `${(row.avgLatencyMs / 1000).toFixed(1)} วิ`
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
        <p className="mt-2 text-xs text-muted">
          ตัวเลขในวงเล็บ = จำนวนนัด · "กล้าทายเสมอ" สำคัญเพราะเสมอเกิดจริงราว 1 ใน 4
          แต่ผู้ทายส่วนใหญ่แทบไม่กล้าเลือก — ใครเลี่ยงเสมอตลอดจะเสียแต้มกลุ่มนี้ทั้งก้อน
        </p>
      </section>

      <section>
        <SectionLabel>นัดหักปากกา — คนถูกน้อยที่สุดเทียบจำนวนผู้ทาย</SectionLabel>
        {upsets.length === 0 ? (
          <EmptyState>ยังไม่มีนัดที่มีผู้ทายมากพอ</EmptyState>
        ) : (
          <ul className="flex flex-col gap-2">
            {upsets.map((match, index) => (
              <li key={index}>
                <Card className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="text-sm text-foreground">
                    {match.homeTeam}{" "}
                    <span className="rounded bg-surface-hover px-1.5 py-0.5 text-xs tabular-nums">
                      {match.homeScore}-{match.awayScore}
                    </span>{" "}
                    {match.awayTeam}
                  </span>
                  <span className="text-xs text-muted">
                    {competitionByCode(match.competitionCode)?.shortName ??
                      match.competitionCode}{" "}
                    · แมตช์เดย์ {match.matchday}
                  </span>
                  <span
                    className={`ml-auto shrink-0 text-xs font-medium ${match.correctCount === 0 ? "text-danger" : "text-muted"}`}
                  >
                    ถูกแค่ {match.correctCount}/{match.predictors} คน
                    {match.correctCount === 0 && " — ไม่มีใครเห็นมาก่อนเลย"}
                  </span>
                </Card>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-xs text-muted">
          นัดพวกนี้คือวัตถุดิบชั้นดีของ <Link href="/news" className="text-accent hover:underline">คอลัมน์ประจำวัน</Link> — 
          ถ้าทั้งคนและ AI พลาดพร้อมกัน แปลว่าข้อมูลฟอร์มก่อนเกมไม่มีสัญญาณอะไรเลย
        </p>
      </section>
    </PageShell>
  );
}
