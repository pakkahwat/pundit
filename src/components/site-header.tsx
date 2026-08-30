import { eq } from "drizzle-orm";
import Link from "next/link";

import { auth, signOut } from "@/auth";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { displayNameSql } from "@/lib/display-name";
import { isAdminEmail } from "@/lib/admin";

import { Logo } from "./logo";
import { NavLink } from "./nav-link";
import { SubmitButton } from "@/components/submit-button";

// session ของ Auth.js เก็บชื่อจาก Google ไว้ ไม่รู้จัก display_name ที่ผู้ใช้ตั้งเอง เลยต้องอ่าน
// จาก DB ตรง ๆ — ทำที่นี่ที่เดียวเพราะแถบหัวเว็บอยู่ใน layout จึงเรนเดอร์ทุกหน้าอยู่แล้ว
async function currentDisplayName(userId: string) {
  const [row] = await db
    .select({ name: displayNameSql })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return row?.name ?? "";
}

// แถบหัวเว็บที่อยู่ทุกหน้า — เป็น async Server Component เรียก auth() เองได้เลย ไม่ต้องให้แต่ละหน้า
// ส่ง session ลงมาเป็น prop (วางไว้ใน layout.tsx ทำให้ทุกหน้าได้ chrome ชุดเดียวกันอัตโนมัติ)
//
// เมนูหลักถูกแยกเป็นสองแถวบนจอแคบ (แถวบน = โลโก้ + บัญชี, แถวล่าง = เมนู) เพราะถ้ายัดทุกอย่าง
// ไว้แถวเดียว ชื่อลิงก์จะถูกบีบจนอ่านไม่ออก
//
// จุดสลับขยับจาก md (768px) เป็น lg (1024px) ตอนเพิ่มเมนู "ผลบอลสด" เป็นอันที่ 7 —
// เกณฑ์เดิมวัดไว้ว่าเมนู 5 อันต้องการราว 720px พอบวกอีกสองอัน (~160px) แถวเดียวต้องการ
// เกิน 850px ซึ่งทะลุ md ไปแล้ว ถ้าฝืนไว้ที่ md ช่วง 768-880px จะล้นจนหน้าเลื่อนซ้ายขวาได้
export async function SiteHeader() {
  const session = await auth();
  const signedIn = Boolean(session?.user?.id);
  const admin = isAdminEmail(session?.user?.email);

  return (
    <header className="sticky top-0 z-10 border-b border-border bg-background/80 backdrop-blur">
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
        <div className="flex items-center justify-between gap-4 py-3">
          <Link
            href="/"
            className="shrink-0 transition-opacity hover:opacity-80"
          >
            <Logo />
          </Link>

          {signedIn && (
            <nav
              className="hidden items-center gap-1 lg:flex"
              aria-label="เมนูหลัก"
            >
              <NavLink href="/">หน้าแรก</NavLink>
              <NavLink href="/leagues">ลีกของฉัน</NavLink>
              <NavLink href="/live">ผลบอลสด</NavLink>
              <NavLink href="/vs-ai">คนปะทะ AI</NavLink>
              <NavLink href="/standings">ตารางคะแนน</NavLink>
              <NavLink href="/fixtures">โปรแกรมแข่ง</NavLink>
              <NavLink href="/news">คอลัมน์</NavLink>
              {admin && <NavLink href="/admin">ระบบ</NavLink>}
            </nav>
          )}

          {signedIn && session?.user?.id && (
            <div className="flex shrink-0 items-center gap-2">
              <Link
                href="/settings"
                className="hidden rounded-lg px-2.5 py-1.5 text-sm text-muted transition-colors hover:bg-surface-hover hover:text-foreground lg:inline"
              >
                {await currentDisplayName(session.user.id)}
              </Link>
              <form
                action={async () => {
                  "use server";
                  await signOut();
                }}
              >
                <SubmitButton variant="ghost" size="sm">
                  ออกจากระบบ
                </SubmitButton>
              </form>
            </div>
          )}
        </div>

        {/* เมนูแถวที่สองสำหรับจอมือถือ — เลื่อนแนวนอนได้ถ้าเมนูยาวเกินจอ */}
        {signedIn && (
          <nav
            className="-mx-4 flex items-center gap-1 overflow-x-auto px-4 pb-2 lg:hidden"
            aria-label="เมนูหลัก (มือถือ)"
          >
            <NavLink href="/">หน้าแรก</NavLink>
            <NavLink href="/leagues">ลีกของฉัน</NavLink>
            <NavLink href="/live">ผลบอลสด</NavLink>
            <NavLink href="/vs-ai">คนปะทะ AI</NavLink>
            <NavLink href="/standings">ตารางคะแนน</NavLink>
            <NavLink href="/fixtures">โปรแกรมแข่ง</NavLink>
            <NavLink href="/news">คอลัมน์</NavLink>
            {admin && <NavLink href="/admin">ระบบ</NavLink>}
          </nav>
        )}
      </div>
    </header>
  );
}
