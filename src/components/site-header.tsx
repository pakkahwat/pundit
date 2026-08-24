import { eq } from 'drizzle-orm';
import Link from 'next/link';

import { auth, signOut } from '@/auth';
import { db } from '@/db/client';
import { users } from '@/db/schema';
import { displayNameSql } from '@/lib/display-name';

import { Logo } from './logo';
import { Button } from './ui';

// session ของ Auth.js เก็บชื่อจาก Google ไว้ ไม่รู้จัก display_name ที่ผู้ใช้ตั้งเอง เลยต้องอ่าน
// จาก DB ตรง ๆ — ทำที่นี่ที่เดียวเพราะแถบหัวเว็บอยู่ใน layout จึงเรนเดอร์ทุกหน้าอยู่แล้ว
async function currentDisplayName(userId: string) {
  const [row] = await db
    .select({ name: displayNameSql })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return row?.name ?? '';
}

// แถบหัวเว็บที่อยู่ทุกหน้า — เป็น async Server Component เรียก auth() เองได้เลย ไม่ต้องให้แต่ละหน้า
// ส่ง session ลงมาเป็น prop (วางไว้ใน layout.tsx ทำให้ทุกหน้าได้ chrome ชุดเดียวกันอัตโนมัติ)
export async function SiteHeader() {
  const session = await auth();

  return (
    <header className="sticky top-0 z-10 border-b border-border bg-background/80 backdrop-blur">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <Link href="/" className="transition-opacity hover:opacity-80">
          <Logo />
        </Link>

        {session?.user?.id && (
          <nav className="ml-auto flex items-center gap-4 text-sm">
            <Link href="/standings" className="text-muted transition-colors hover:text-foreground">
              ตารางคะแนน
            </Link>
            <Link href="/leagues" className="text-muted transition-colors hover:text-foreground">
              ลีก
            </Link>
          </nav>
        )}

        {session?.user?.id && (
          <div className="flex items-center gap-3">
            <Link
              href="/settings"
              className="hidden text-sm text-muted transition-colors hover:text-foreground sm:inline"
            >
              {await currentDisplayName(session.user.id)}
            </Link>
            <form
              action={async () => {
                'use server';
                await signOut();
              }}
            >
              <Button type="submit" variant="ghost" size="sm">
                ออกจากระบบ
              </Button>
            </form>
          </div>
        )}
      </div>
    </header>
  );
}
