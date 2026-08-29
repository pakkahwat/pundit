import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { db, sqlClient } from "@/db/client";
import { aiAgents, leagueMembers, users } from "@/db/schema";
import { displayNameSql, realNameHint } from "@/lib/display-name";
import { getLeagueProfile } from "@/lib/stats/profile";

// โปรไฟล์ของสมาชิกลีก — โหลดตอนกดเปิด card เท่านั้น (แนวเดียวกับ h2h)
//
// กติกาความเป็นส่วนตัว: ดูได้เฉพาะ "สมาชิกลีกเดียวกัน" ทั้งคนดูและคนถูกดู — โปรไฟล์รวมสถิติ
// ข้ามลีกก็จริง แต่ทางเข้าเดียวคือผ่านลีกที่อยู่ร่วมกัน คนนอกลีกไม่มีทางไล่ดูสถิติใครได้
export const dynamic = "force-dynamic";

// ไม่ใช้ RouteContext<...> เพราะ type นั้น generate ตอน next dev/build — route ใหม่ยังไม่มีในลิสต์
export async function GET(
  _request: Request,
  ctx: { params: Promise<{ leagueId: string; userId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { leagueId, userId } = await ctx.params;

  // ทั้งคนดูและเป้าหมายต้องเป็นสมาชิกลีกนี้
  const memberships = await db
    .select({ userId: leagueMembers.userId })
    .from(leagueMembers)
    .where(eq(leagueMembers.leagueId, leagueId));
  const memberIds = new Set(memberships.map((m) => m.userId));
  if (!memberIds.has(session.user.id) || !memberIds.has(userId)) {
    return NextResponse.json({ error: "not a league member" }, { status: 403 });
  }

  const [target] = await db
    .select({
      name: displayNameSql,
      displayName: users.displayName,
      googleName: users.name,
      image: users.image,
      playerKind: users.playerKind,
      createdAt: users.createdAt,
      agentKey: aiAgents.agentKey,
      modelId: aiAgents.modelId,
    })
    .from(users)
    .leftJoin(aiAgents, eq(aiAgents.userId, users.id))
    .where(and(eq(users.id, userId)))
    .limit(1);
  if (!target) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  try {
    const profile = await getLeagueProfile(sqlClient, leagueId, userId);
    return NextResponse.json({
      name: target.name,
      // ชื่อจริงที่เคยอยู่ใน tooltip ย้ายมาอยู่ใน card — คนดูเป็นสมาชิกลีกเดียวกันซึ่งเห็นได้อยู่แล้ว
      realName:
        userId === session.user.id
          ? null
          : realNameHint(target.displayName, target.googleName),
      image: target.image,
      isAi: target.playerKind === "ai",
      agentKey: target.agentKey,
      modelId: target.modelId,
      memberSince: target.createdAt,
      ...profile,
    });
  } catch (err) {
    console.error(`ดึงโปรไฟล์ ${userId} ล้มเหลว:`, err);
    return NextResponse.json({ error: "ดึงข้อมูลไม่สำเร็จ" }, { status: 500 });
  }
}
