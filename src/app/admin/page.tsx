import { redirect } from "next/navigation";

import { auth } from "@/auth";
import {
  Badge,
  Card,
  EmptyState,
  PageHeader,
  PageShell,
  SectionLabel,
} from "@/components/ui";
import { sqlClient } from "@/db/client";
import { hasApiKey } from "@/lib/ai/llm";

// ── หน้าสุขภาพระบบ (/admin) ─────────────────────────────────────────────────────
//
// ทุกอย่างในหน้านี้คือปัญหาที่เคย "พังเงียบ" มาแล้วจริง: cron โดน auto-disable, token มีขยะติดมา,
// AI โดนข้ามเพราะไม่มี key, sync ไม่เดิน — ข้อมูลบันทึกอยู่ใน DB ครบถ้วน (cron_runs,
// ai_prediction_logs) แต่ต้องเปิดฐานข้อมูลดูเอง หน้านี้เอามาแบให้เห็นในที่เดียว
//
// สิทธิ์: อีเมลใน ADMIN_EMAILS (คั่นด้วย ,) เท่านั้น — ไม่ได้ตั้ง = ไม่มีใครเข้าได้เลย
// (ปลอดภัยโดย default) และหน้านี้อ่านอย่างเดียว ไม่มีปุ่มสั่งอะไรทั้งนั้น

export const dynamic = "force-dynamic";
export const metadata = { title: "สุขภาพระบบ · Pundit" };

function isAdmin(email: string | null | undefined): boolean {
  if (!email) return false;
  const allowed = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  return allowed.includes(email.toLowerCase());
}

// เดาสาเหตุจากข้อความ error ล่าสุด — ตอบคำถาม "token หมด/ผิดหรือเปล่า" โดยไม่ต้องยิงทดสอบ
// (การยิงทดสอบจริงเปลืองโควตา LLM และหน้า admin ถูกเปิดบ่อย)
function classifyError(error: string | null): string | null {
  if (!error) return null;
  if (/401|unauthorized|invalid[_ ]?api[_ ]?key|expired/i.test(error))
    return "token มีปัญหา (401/หมดอายุ)";
  if (/429|rate.?limit|quota|exhausted/i.test(error))
    return "ชนโควตา (429)";
  if (/timeout|abort/i.test(error)) return "ช้าจนหมดเวลา";
  return "error อื่น (ดูข้อความเต็ม)";
}

function timeAgo(iso: string | null): string {
  if (!iso) return "ไม่เคยรัน";
  const minutes = Math.floor((Date.now() - Date.parse(iso)) / 60_000);
  if (minutes < 1) return "เมื่อครู่";
  if (minutes < 60) return `${minutes} นาทีก่อน`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} ชม.ก่อน`;
  return `${Math.floor(hours / 24)} วันก่อน`;
}

export default async function AdminPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/");
  if (!isAdmin(session.user.email)) redirect("/");

  const [cronRuns, agents, articles] = await Promise.all([
    // รอบล่าสุดของแต่ละ job — distinct on คือท่าประจำของ "แถวล่าสุดต่อกลุ่ม" ใน Postgres
    sqlClient<
      {
        job_name: string;
        status: string;
        processed_count: number | null;
        error: string | null;
        started_at: string;
        finished_at: string | null;
      }[]
    >`
      select distinct on (job_name)
        job_name, status, processed_count, error,
        started_at::text as started_at, finished_at::text as finished_at
      from cron_runs
      order by job_name, started_at desc
    `,
    // สถานะ AI รายตัว: คำทายล่าสุด + error ล่าสุด + อัตราพังใน 7 วัน
    sqlClient<
      {
        agent_key: string;
        provider: string | null;
        model_id: string | null;
        is_active: boolean;
        last_ok: string | null;
        last_error_at: string | null;
        last_error: string | null;
        fails_7d: number;
        ok_7d: number;
      }[]
    >`
      select a.agent_key, a.provider, a.model_id, a.is_active,
        max(l.created_at) filter (where l.parse_succeeded)::text as last_ok,
        max(l.created_at) filter (where l.error is not null)::text as last_error_at,
        (array_agg(l.error order by l.created_at desc)
          filter (where l.error is not null))[1] as last_error,
        count(*) filter (where l.error is not null
          and l.created_at > now() - interval '7 days')::int as fails_7d,
        count(*) filter (where l.parse_succeeded
          and l.created_at > now() - interval '7 days')::int as ok_7d
      from ai_agents a
      left join ai_prediction_logs l on l.ai_agent_id = a.id
      group by a.id, a.agent_key, a.provider, a.model_id, a.is_active
      order by a.agent_key
    `,
    sqlClient<{ season: string; latest: string | null }[]>`
      select s.name as season, max(a.created_at)::text as latest
      from seasons s
      left join articles a on a.season_id = s.id
      where s.is_active = true
      group by s.name order by s.name
    `,
  ]);

  return (
    <PageShell width="lg">
      <PageHeader
        title="สุขภาพระบบ"
        subtitle="งานอัตโนมัติ · สถานะ AI · ความสดของข้อมูล — อ่านอย่างเดียว"
      />

      <section className="mb-8">
        <SectionLabel>งาน cron (รอบล่าสุดของแต่ละงาน)</SectionLabel>
        {cronRuns.length === 0 ? (
          <EmptyState>ยังไม่มีบันทึกการรันเลย — cron ไม่เคยยิงถึงเลยสักครั้ง</EmptyState>
        ) : (
          <Card padded={false} className="divide-y divide-border">
            {cronRuns.map((run) => {
              // sync ควรเดินถี่ ถ้ารอบล่าสุดเก่าเกินชั่วโมงในช่วงบอล = cron อาจโดนปิด
              const staleMin = run.finished_at
                ? (Date.now() - Date.parse(run.finished_at)) / 60_000
                : Infinity;
              return (
                <div key={run.job_name} className="flex flex-wrap items-center gap-x-3 gap-y-1 p-4">
                  <span className="min-w-32 font-mono text-sm">{run.job_name}</span>
                  {run.status === "success" ? (
                    <Badge tone="accent">สำเร็จ</Badge>
                  ) : run.status === "running" ? (
                    <Badge>กำลังรัน/ค้าง</Badge>
                  ) : (
                    <span className="rounded-full bg-danger/15 px-2 py-0.5 text-xs font-medium text-danger">
                      พัง
                    </span>
                  )}
                  <span className="text-xs text-muted">
                    {timeAgo(run.finished_at ?? run.started_at)}
                    {run.processed_count !== null && ` · ${run.processed_count} รายการ`}
                    {run.job_name.startsWith("sync") && staleMin > 60 && " · ⚠️ นานผิดปกติ — เช็คว่า cron โดนปิดไหม"}
                  </span>
                  {run.error && (
                    <span className="w-full break-all text-xs text-danger">{run.error.slice(0, 300)}</span>
                  )}
                </div>
              );
            })}
          </Card>
        )}
      </section>

      <section className="mb-8">
        <SectionLabel>ผู้เล่น AI รายตัว</SectionLabel>
        <Card padded={false} className="divide-y divide-border">
          {agents.map((agent) => {
            const keyMissing = agent.provider !== null && !hasApiKey(agent.provider);
            const diagnosis = classifyError(agent.last_error);
            const lastErrorNewer =
              agent.last_error_at &&
              (!agent.last_ok || agent.last_error_at > agent.last_ok);
            const healthy = !keyMissing && !lastErrorNewer && agent.is_active;
            return (
              <div key={agent.agent_key} className="flex flex-col gap-1 p-4">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="min-w-40 font-mono text-sm">{agent.agent_key}</span>
                  {!agent.is_active ? (
                    <Badge>ปิดใช้งาน</Badge>
                  ) : keyMissing ? (
                    <span className="rounded-full bg-danger/15 px-2 py-0.5 text-xs font-medium text-danger">
                      ไม่มี API key ของ {agent.provider} — โดนข้ามทุกรอบ
                    </span>
                  ) : healthy ? (
                    <Badge tone="accent">ปกติ</Badge>
                  ) : (
                    <span className="rounded-full bg-danger/15 px-2 py-0.5 text-xs font-medium text-danger">
                      {diagnosis ?? "มีปัญหา"}
                    </span>
                  )}
                  <span className="text-xs text-muted">
                    ทายสำเร็จล่าสุด {timeAgo(agent.last_ok)} · 7 วัน: สำเร็จ {agent.ok_7d} / พัง {agent.fails_7d}
                  </span>
                </div>
                {lastErrorNewer && agent.last_error && (
                  <p className="break-all text-xs text-danger">
                    ล่าสุด ({timeAgo(agent.last_error_at)}): {agent.last_error.slice(0, 250)}
                  </p>
                )}
              </div>
            );
          })}
        </Card>
        <p className="mt-2 text-xs text-muted">
          การวินิจฉัย token อ่านจากข้อความ error ล่าสุดของแต่ละตัว (401/หมดอายุ, 429/โควตา) —
          ไม่ได้ยิงทดสอบสด เพื่อไม่เผาโควตา LLM ทุกครั้งที่เปิดหน้านี้
        </p>
      </section>

      <section>
        <SectionLabel>บทความรายวัน</SectionLabel>
        <Card padded={false} className="divide-y divide-border">
          {articles.map((row) => (
            <div key={row.season} className="flex items-center justify-between gap-3 p-4 text-sm">
              <span>{row.season}</span>
              <span className="text-xs text-muted">ฉบับล่าสุด {timeAgo(row.latest)}</span>
            </div>
          ))}
        </Card>
      </section>
    </PageShell>
  );
}
