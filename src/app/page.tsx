import { and, asc, count, desc, eq, gt, inArray, sql } from 'drizzle-orm';
import Link from 'next/link';

import { auth, signIn } from '@/auth';
import { ArticleBody } from '@/components/article-body';
import { ArticleCard } from '@/components/article-card';
import { Hero } from '@/components/hero';
import { LogoMark } from '@/components/logo';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  LinkButton,
  PageShell,
  Pagination,
  SectionLabel,
} from '@/components/ui';
import { db } from '@/db/client';
import { withUserContext } from '@/db/rls';
import { articles, leagueMembers, leagues, matches, predictions, seasons } from '@/db/schema';

// นี่คือ Server Component (ไม่มี "use client" ด้านบน) — รันบน server เท่านั้น เรียก auth()
// อ่าน session ตรง ๆ ได้เลยโดยไม่ต้องส่ง API call จาก browser แบบที่ Vue/Nuxt SPA เคยทำ
// ฟอร์มด้านล่างใช้ Server Action (ฟังก์ชันที่มี "use server" อยู่ข้างในผูกเป็น action ของ <form>
// โดยตรง) กด submit แล้ว Next.js จะรันฟังก์ชันนั้นบน server ให้เอง

function formatArticleDate(publishedOn: string) {
  // publishedOn เป็น date ล้วน (YYYY-MM-DD) จาก Postgres — ต่อ T00:00:00Z แล้วระบุ timeZone
  // เป็น UTC ตอนแสดงผล เพื่อไม่ให้ JS ตีความเป็นเวลาท้องถิ่นแล้วเลื่อนไปหนึ่งวัน
  return new Intl.DateTimeFormat('th-TH', {
    timeZone: 'UTC',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(`${publishedOn}T00:00:00Z`));
}

// ตัดย่อหน้าแรกมาโชว์บนการ์ด — ลอก markdown ตัวหนาออกก่อนเพื่อไม่ให้เห็น ** ดิบ ๆ
function excerptOf(body: string): string {
  const first = body.split(/\n{2,}/)[0]?.replace(/\*\*/g, '').trim() ?? '';
  return first.length > 160 ? `${first.slice(0, 160)}…` : first;
}

const ARTICLES_PER_PAGE = 6;

export default async function Home(props: PageProps<'/'>) {
  const session = await auth();

  if (!session?.user?.id) {
    return (
      <main className="flex flex-1 items-center justify-center px-4 py-16">
        <div className="flex w-full max-w-sm flex-col items-center gap-6 text-center">
          <div className="flex flex-col items-center">
            <LogoMark className="mb-3 h-14 w-14" />
            <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground">Pundit</h1>
            <p className="mt-2 text-sm text-muted">
              ลีกทายผลพรีเมียร์ลีกกับเพื่อน — แล้วดูว่า AI ทายแม่นกว่าคนจริงไหม
            </p>
          </div>
          <form
            action={async () => {
              'use server';
              await signIn('google');
            }}
          >
            <Button type="submit">เข้าสู่ระบบด้วย Google</Button>
          </form>
        </div>
      </main>
    );
  }

  const userId = session.user.id;

  // อ่านเลขหน้าจาก ?page= — searchParams เป็น Promise ใน Next 16 เหมือน params
  // กันค่าเพี้ยน (page=abc, page=-1, page=999) ด้วยการ clamp ทีหลังเมื่อรู้จำนวนหน้าจริงแล้ว
  const searchParams = await props.searchParams;
  const rawPage = Number(Array.isArray(searchParams.page) ? searchParams.page[0] : searchParams.page);
  const requestedPage = Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1;

  const [myLeagues, [{ total }]] = await Promise.all([
    db
      .select({
        id: leagues.id,
        name: leagues.name,
        seasonId: leagues.seasonId,
        currentMatchday: seasons.currentMatchday,
      })
      .from(leagueMembers)
      .innerJoin(leagues, eq(leagueMembers.leagueId, leagues.id))
      .innerJoin(seasons, eq(seasons.id, leagues.seasonId))
      .where(eq(leagueMembers.userId, userId))
      .orderBy(asc(leagues.name)),
    db.select({ total: count() }).from(articles),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / ARTICLES_PER_PAGE));
  const page = Math.min(requestedPage, totalPages);

  // เรียงตามวันที่ของบทความก่อน แล้วใช้เวลาที่สร้างจริงเป็นตัวตัดสินถ้าวันเดียวกัน (เกิดได้ตอน
  // เขียนทับด้วย --force) — ต้องมีตัวตัดสินที่ไม่ซ้ำ ไม่งั้นลำดับอาจสลับกันเองระหว่างหน้า
  // ทำให้บางบทความโผล่สองหน้าหรือหายไปเลย
  const recentArticles = await db
    .select({
      id: articles.id,
      publishedOn: articles.publishedOn,
      title: articles.title,
      body: articles.body,
      coverImageUrls: articles.coverImageUrls,
    })
    .from(articles)
    .orderBy(desc(articles.publishedOn), desc(articles.createdAt))
    .limit(ARTICLES_PER_PAGE)
    .offset((page - 1) * ARTICLES_PER_PAGE);

  // หา "นัดที่ยังทายได้และเรายังไม่ได้ทาย" ของแต่ละลีก — เป็นข้อมูลสำคัญที่สุดบนหน้าแรก เพราะถ้า
  // ปล่อยจนเลยคิกออฟคือเสียแต้มนัดนั้นถาวร แก้ย้อนหลังไม่ได้เลยตามกติกาที่ตั้งไว้
  // ทำเป็น 2 query รวม (ไม่ใช่ query ต่อลีก) เพื่อไม่ให้จำนวน query โตตามจำนวนลีก
  const openMatches = myLeagues.length
    ? await db
        .select({ id: matches.id, seasonId: matches.seasonId, matchday: matches.matchday })
        .from(matches)
        .where(
          and(
            inArray(
              matches.seasonId,
              myLeagues.map((l) => l.seasonId),
            ),
            gt(matches.kickoffAt, sql`now()`),
          ),
        )
    : [];

  // ต้องผ่าน withUserContext เพราะ RLS บน predictions — ไม่งั้นจะอ่านของตัวเองไม่เห็นเลย
  const myPredictedIds = openMatches.length
    ? new Set(
        (
          await withUserContext(userId, (tx) =>
            tx
              .select({ matchId: predictions.matchId })
              .from(predictions)
              .where(
                and(
                  eq(predictions.userId, userId),
                  inArray(
                    predictions.matchId,
                    openMatches.map((m) => m.id),
                  ),
                ),
              ),
          )
        ).map((p) => p.matchId),
      )
    : new Set<string>();

  const pendingCountByLeague = new Map(
    myLeagues.map((l) => [
      l.id,
      openMatches.filter(
        (m) =>
          m.seasonId === l.seasonId &&
          m.matchday === (l.currentMatchday ?? 1) &&
          !myPredictedIds.has(m.id),
      ).length,
    ]),
  );
  const totalPending = [...pendingCountByLeague.values()].reduce((a, b) => a + b, 0);

  return (
    <PageShell width="xl">
      <div className="flex flex-col gap-10">
        <Hero
          matchday={myLeagues[0]?.currentMatchday ?? null}
          leagueCount={myLeagues.length}
          pendingCount={totalPending}
        />

        {totalPending > 0 && (
          <Card className="animate-fade-up border-accent/40 bg-accent-soft/30">
            <p className="text-sm text-foreground">
              คุณยังไม่ได้ทาย <span className="font-semibold">{totalPending} นัด</span>{' '}
              ที่ยังเปิดรับอยู่ — ทายไม่ทันคิกออฟคือเสียแต้มนัดนั้นถาวร
            </p>
          </Card>
        )}

        <section>
          <div className="mb-3 flex items-center gap-2">
            <SectionLabel>คอลัมน์ประจำวัน</SectionLabel>
            <span className="mb-2">
              <Badge tone="accent">เขียนโดย AI</Badge>
            </span>
          </div>

          {recentArticles.length === 0 ? (
            <EmptyState>
              ยังไม่มีบทความ — รัน <code className="font-mono">npm run db:generate-article</code>{' '}
              เพื่อให้ AI เขียนฉบับแรก
            </EmptyState>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {recentArticles.map((a) => (
                  // เนื้อหาเต็มถูกเรนเดอร์ที่ server แล้วส่งเข้าไปเป็น children ของ client component
                  // — ตัวแปลง markdown จึงไม่ต้องถูกส่งไปรันบน browser เลย
                  <ArticleCard
                    key={a.id}
                    title={a.title}
                    dateLabel={formatArticleDate(a.publishedOn)}
                    coverImageUrls={a.coverImageUrls}
                    excerpt={excerptOf(a.body)}
                  >
                    <ArticleBody body={a.body} />
                  </ArticleCard>
                ))}
              </div>

              <Pagination
                page={page}
                totalPages={totalPages}
                hrefFor={(p) => (p === 1 ? '/' : `/?page=${p}`)}
              />

              <div className="mt-3">
                <LinkButton href="/news" variant="ghost" size="sm">
                  ดูบทความย้อนหลังทั้งหมด →
                </LinkButton>
              </div>
            </>
          )}
        </section>

        <section>
          <div className="mb-3 flex items-center justify-between gap-3">
            <SectionLabel>ลีกของคุณ</SectionLabel>
            <span className="flex gap-2">
              <LinkButton href="/leagues" size="sm">
                เข้าร่วมลีก
              </LinkButton>
              <LinkButton href="/leagues/new" size="sm" variant="secondary">
                สร้างลีกใหม่
              </LinkButton>
            </span>
          </div>

          {myLeagues.length === 0 ? (
            <EmptyState>ยังไม่ได้อยู่ลีกไหน — กด &quot;เข้าร่วมลีก&quot; เพื่อดูลีกทั้งหมดที่เข้าได้เลย</EmptyState>
          ) : (
            <ul className="flex flex-col gap-2">
              {myLeagues.map((l) => {
                const pending = pendingCountByLeague.get(l.id) ?? 0;
                return (
                  <li key={l.id}>
                    <Link href={pending > 0 ? `/leagues/${l.id}/predict` : `/leagues/${l.id}`} className="block">
                      <Card className="flex animate-fade-up items-center justify-between gap-3 transition-all duration-200 hover:-translate-y-0.5 hover:bg-surface-hover">
                        <span className="min-w-0 truncate font-medium text-foreground">
                          {l.name}
                        </span>
                        {pending > 0 ? (
                          <span className="shrink-0">
                            <Badge tone="accent">ยังไม่ทาย {pending} นัด</Badge>
                          </span>
                        ) : (
                          <span className="shrink-0 text-xs text-muted">ทายครบแล้ว</span>
                        )}
                      </Card>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </PageShell>
  );
}
