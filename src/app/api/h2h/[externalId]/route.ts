import { NextResponse } from 'next/server';

import { auth } from '@/auth';
import { getHeadToHead } from '@/lib/football/h2h';

// H2H โหลดตอนผู้ใช้กดเปิด dialog เท่านั้น ไม่ได้ดึงมาพร้อมหน้าทายผล — เพราะหนึ่งแมตช์เดย์มี 10 นัด
// ถ้าดึงล่วงหน้าทุกนัดคือ 10 requests ต่อการเปิดหน้าหนึ่งครั้ง ซึ่งชน rate limit ของแผนฟรี
// (10/นาที) ทันทีที่มีคนเปิดพร้อมกันสองคน — ส่วนใหญ่ผู้ใช้ก็ไม่ได้กดดูทุกนัดอยู่แล้ว
export const dynamic = 'force-dynamic';

export async function GET(_request: Request, ctx: RouteContext<'/api/h2h/[externalId]'>) {
  // ต้องล็อกอินก่อน ไม่งั้น endpoint นี้จะกลายเป็น proxy ให้ใครก็ได้ยิง API ผ่านโควตาของเรา
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const { externalId } = await ctx.params;
  const id = Number(externalId);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: 'invalid match id' }, { status: 400 });
  }

  try {
    const data = await getHeadToHead(id);
    return NextResponse.json(data);
  } catch (err) {
    console.error(`ดึง h2h ของแมตช์ ${id} ล้มเหลว:`, err);
    return NextResponse.json({ error: 'ดึงข้อมูลไม่สำเร็จ' }, { status: 502 });
  }
}
