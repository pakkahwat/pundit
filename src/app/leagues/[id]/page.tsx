import { and, eq } from "drizzle-orm";
import { Suspense } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import {
  Badge,
  Card,
  CenteredMessage,
  PageHeader,
  PageShell,
  SectionLabel,
} from "@/components/ui";
import { InviteLink } from "@/components/invite-link";
import { LeagueNav } from "@/components/league-nav";

import { DiscordForm } from "./discord-form";
import { RemoveMemberButton } from "./remove-member-button";
import { ProfileName } from "@/components/profile-name";
import { StandingsTable } from "@/components/standings-table";
import { db } from "@/db/client";
import { aiAgents, leagueMembers, leagues, seasons, users } from "@/db/schema";
import { PlayerAvatar } from "@/components/player-avatar";
import { displayNameSql } from "@/lib/display-name";
import { competitionLabel } from "@/lib/football/competitions";
import { getStandings } from "@/lib/football/standings";
import { pendingPredictionCount } from "@/lib/leagues/pending";
import { getCurrentMatchday } from "@/lib/matches/current-matchday";

export default async function LeaguePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/");
  }
  const userId = session.user.id;

  const [league] = await db
    .select()
    .from(leagues)
    .where(eq(leagues.id, id))
    .limit(1);
  if (!league) {
    return <CenteredMessage title="ไม่พบลีกนี้" />;
  }

  // เช็ค membership ก่อนโชว์อะไรทั้งนั้น — คนที่ไม่ใช่สมาชิกไม่ควรรู้ด้วยซ้ำว่าลีกนี้มีใครอยู่บ้าง
  const [membership] = await db
    .select()
    .from(leagueMembers)
    .where(
      and(eq(leagueMembers.leagueId, id), eq(leagueMembers.userId, userId)),
    )
    .limit(1);
  if (!membership) {
    return <CenteredMessage title="คุณไม่ได้เป็นสมาชิกลีกนี้" />;
  }
  const isOwner = membership.role === "owner";

  const [season] = await db
    .select()
    .from(seasons)
    .where(eq(seasons.id, league.seasonId))
    .limit(1);

  const members = await db
    .select({
      userId: leagueMembers.userId,
      name: displayNameSql,
      displayName: users.displayName,
      googleName: users.name,
      image: users.image,
      email: users.email,
      role: leagueMembers.role,
      playerKind: users.playerKind,
      agentKey: aiAgents.agentKey,
    })
    .from(leagueMembers)
    .innerJoin(users, eq(leagueMembers.userId, users.id))
    // left join เพราะสมาชิกส่วนใหญ่เป็นคน ไม่มีแถวใน ai_agents — เอามาเพื่อรู้ว่า AI ตัวไหน
    // จะได้หยิบไอคอนประจำตัวของมันมาแสดง
    .leftJoin(aiAgents, eq(aiAgents.userId, leagueMembers.userId))
    .where(eq(leagueMembers.leagueId, id));

  const pending = await pendingPredictionCount(
    league.seasonId,
    await getCurrentMatchday(league.seasonId),
    userId,
  );

  // headers() เป็น async เหมือน params ใน Next 16 — ใช้ต่อ origin จริงของ request เพื่อสร้าง
  // ลิงก์เชิญแบบ absolute URL (ใช้ได้ทั้ง localhost ตอน dev และโดเมนจริงตอน deploy โดยไม่ต้อง hardcode)
  const hdrs = await headers();
  const origin = `${hdrs.get("x-forwarded-proto") ?? "http"}://${hdrs.get("host")}`;
  const inviteUrl = `${origin}/join/${league.inviteCode}`;

  const humanCount = members.filter((m) => m.playerKind !== "ai").length;
  const aiCount = members.length - humanCount;

  return (
    <PageShell width="lg">
      <PageHeader
        title={league.name}
        subtitle={`${competitionLabel(season?.competitionCode ?? "", season?.name ?? "")} · ${humanCount} คน · ${aiCount} AI`}
      />

      <LeagueNav leagueId={id} active="overview" pendingCount={pending} />

      <div className="flex flex-col gap-8">
        {/* ถ้ายังมีนัดที่ทายไม่ครบ ให้เห็นเป็นอย่างแรกบนหน้า — เป็นสิ่งเดียวบนหน้านี้ที่มีเส้นตาย */}
        {pending > 0 && (
          <Card className="animate-fade-up border-accent/40 bg-accent-soft/30">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-foreground">
                คุณยังไม่ได้ทาย{" "}
                <span className="font-semibold">{pending} นัด</span>{" "}
                ในแมตช์เดย์นี้
              </p>
              <a
                href={`/leagues/${id}/predict`}
                className="shrink-0 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-fg transition-colors hover:bg-accent-hover"
              >
                ไปทายเลย
              </a>
            </div>
          </Card>
        )}

        <section>
          <SectionLabel>ผู้เล่นในลีก ({members.length})</SectionLabel>
          <Card padded={false}>
            <ul className="divide-y divide-border">
              {members.map((m) => (
                <li
                  key={m.userId}
                  className="flex items-center justify-between gap-3 p-4"
                >
                  <span className="flex min-w-0 items-center gap-2.5">
                    <PlayerAvatar
                      image={m.image}
                      name={m.name}
                      isAi={m.playerKind === "ai"}
                      agentKey={m.agentKey}
                    />
                    {/* กดที่ชื่อ = เปิดการ์ดโปรไฟล์ (สถิติ สตรีค เหรียญตรา และชื่อจริงที่เคยอยู่
                        ใน tooltip เดิม — tooltip ใช้บนมือถือไม่ได้เพราะไม่มีเมาส์ให้ชี้) */}
                    <ProfileName
                      leagueId={id}
                      userId={m.userId}
                      name={m.name ?? "สมาชิก"}
                      isAi={m.playerKind === "ai"}
                      className="text-sm text-foreground"
                    />
                  </span>
                  <span className="flex shrink-0 items-center gap-1.5">
                    {m.playerKind === "ai" && <Badge tone="accent">AI</Badge>}
                    {m.role === "owner" && <Badge>เจ้าของ</Badge>}
                    {/* เตะได้ทุกคนที่ไม่ใช่เจ้าของ (รวม AI) — ฝั่ง server เช็คสิทธิ์ซ้ำอีกชั้น
                        การซ่อนปุ่มเป็นแค่มารยาทของ UI ไม่ใช่แนวป้องกัน */}
                    {isOwner && m.role !== "owner" && (
                      <RemoveMemberButton
                        leagueId={id}
                        memberUserId={m.userId}
                        memberName={m.name ?? "สมาชิกคนนี้"}
                      />
                    )}
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
              fallback={
                <p className="text-sm text-muted">กำลังโหลดตารางคะแนน...</p>
              }
            >
              <LeagueStandings code={season.competitionCode} />
            </Suspense>
          </section>
        )}

        {/* ลิงก์เชิญถูกย้ายมาไว้ล่างสุด — เดิมอยู่บนสุดของหน้า ทั้งที่เป็นของที่ใช้แค่ตอนตั้งลีก
            ครั้งแรก ส่วนตารางคะแนนกับรายชื่อผู้เล่นคือของที่กลับมาดูซ้ำทุกสัปดาห์ */}
        <section>
          <SectionLabel>ชวนเพื่อนเข้าลีก</SectionLabel>
          <InviteLink url={inviteUrl} />
          <p className="mt-2 text-xs text-muted">
            ส่งลิงก์นี้ให้เพื่อน กดเข้ามาแล้วเข้าร่วมได้เลย —
            หรือให้เขาเลือกลีกนี้เองจากหน้า &quot;ลีกของฉัน&quot; ก็ได้
          </p>
        </section>

        {/* ตั้งค่าแจ้งเตือน Discord — เห็นเฉพาะเจ้าของลีก และ URL เดิมไม่ถูกส่งมาแสดงเลย
            (ส่งมาแค่ boolean ว่าเปิดอยู่ไหม) เพราะใครถือลิงก์นั้นก็โพสต์เข้าห้องเขาได้ */}
        {isOwner && (
          <section>
            <SectionLabel>แจ้งเตือนเข้า Discord</SectionLabel>
            <Card>
              <DiscordForm
                leagueId={id}
                enabled={Boolean(league.discordWebhookUrl)}
              />
            </Card>
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
    return (
      <p className="text-sm text-muted">
        ยังไม่มีตารางคะแนน (ฤดูกาลอาจยังไม่เริ่ม)
      </p>
    );
  }
  return <StandingsTable table={table} competitionCode={code} compact />;
}
