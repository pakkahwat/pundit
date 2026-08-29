import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { AutoRefresh } from "@/components/auto-refresh";
import { LiveMatches } from "@/components/live-matches";
import { EmptyState, LinkButton, PageHeader, PageShell } from "@/components/ui";
import { getTodayMatches } from "@/lib/matches/today";

// หน้าผลบอลสด — ข้อมูลชุดเดียวกับบล็อก "บอลวันนี้" บนหน้าแรก (นัดพรีเมียร์ลีก -3 ชม. ถึง
// +24 ชม. ทับด้วยสกอร์/นาที/เหตุการณ์สดจาก SportMonks) แต่แยกมาเป็นหน้าของตัวเองเพื่อ
// เปิดค้างไว้ระหว่างดูบอลได้: มี AutoRefresh ดึงข้อมูลใหม่เองทุก 30 วินาที ซึ่งไม่ใส่ใน
// หน้าแรกเพราะหน้านั้นมี query หนักอีกหลายก้อน (ลีก, บทความ, คำทายค้าง) ที่ไม่ควรถูกยิงซ้ำ
// ทุกครึ่งนาทีเพียงเพื่ออัปเดตสกอร์

export const metadata = { title: "ผลบอลสด · Pundit" };

export default async function LivePage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/");

  const matches = await getTodayMatches(session.user.id);

  return (
    <PageShell width="lg">
      <AutoRefresh />
      <PageHeader
        title="ผลบอลสด"
        subtitle="พรีเมียร์ลีก · สกอร์และเหตุการณ์อัปเดตเองทุก 30 วินาที"
        actions={
          <LinkButton href="/fixtures" variant="secondary">
            โปรแกรมแข่งทั้งหมด
          </LinkButton>
        }
      />
      {matches.length === 0 ? (
        <EmptyState>
          ไม่มีนัดพรีเมียร์ลีกในช่วง 24 ชั่วโมงข้างหน้า — ดูโปรแกรมล่วงหน้าได้ที่หน้าโปรแกรมแข่ง
        </EmptyState>
      ) : (
        <LiveMatches matches={matches} />
      )}
    </PageShell>
  );
}
