import { eq } from "drizzle-orm";
import Link from "next/link";

import { auth, signOut } from "@/auth";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { displayNameSql } from "@/lib/display-name";

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
// จุดสลับเป็น md (768px) ไม่ใช่ sm (640px) เพราะวัดจริงแล้วแถวเดียว (โลโก้ + เมนู 5 อัน + ชื่อ +
// ปุ่มออกจากระบบ) ต้องการราว 720px — ถ้าสลับที่ 640px ช่วง 640-719px จะดันหน้าเว็บล้นออกไป 80px
// จนเลื่อนซ้ายขวาได้ทั้งหน้า ซึ่งเป็นความกว้างของแท็บเล็ตแนวตั้งและหน้าต่างเบราว์เซอร์แบบครึ่งจอ
export async function SiteHeader() {
  const session = await auth();
  const signedIn = Boolean(session?.user?.id);

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
              className="hidden items-center gap-1 md:flex"
              aria-label="เมนูหลัก"
            >
              <NavLink href="/">หน้าแรก</NavLink>
              <NavLink href="/leagues">ลีกของฉัน</NavLink>
              <NavLink href="/vs-ai">คนปะทะ AI</NavLink>
              <NavLink href="/standings">ตารางคะแนน</NavLink>
              <NavLink href="/fixtures">โปรแกรมแข่ง</NavLink>
              <NavLink href="/news">คอลัมน์</NavLink>
            </nav>
          )}

          {signedIn && session?.user?.id && (
            <div className="flex shrink-0 items-center gap-2">
              <Link
                href="/settings"
                className="hidden rounded-lg px-2.5 py-1.5 text-sm text-muted transition-colors hover:bg-surface-hover hover:text-foreground md:inline"
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
            className="-mx-4 flex items-center gap-1 overflow-x-auto px-4 pb-2 md:hidden"
            aria-label="เมนูหลัก (มือถือ)"
          >
            <NavLink href="/">หน้าแรก</NavLink>
            <NavLink href="/leagues">ลีกของฉัน</NavLink>
            <NavLink href="/vs-ai">คนปะทะ AI</NavLink>
            <NavLink href="/standings">ตารางคะแนน</NavLink>
            <NavLink href="/fixtures">โปรแกรมแข่ง</NavLink>
            <NavLink href="/news">คอลัมน์</NavLink>
          </nav>
        )}
      </div>
    </header>
  );
}
