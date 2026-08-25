import { and, asc, count, desc, eq, gt, inArray, sql } from 'drizzle-orm';
import Link from 'next/link';

import { auth, signIn } from '@/auth';
import { ArticleBody } from '@/components/article-body';
import { ArticleCard } from '@/components/article-card';
import { Hero } from '@/components/hero';
import { Landing } from '@/components/landing';
import { LiveMatches, LiveNotice } from '@/components/live-matches';
import {
  Badge,
  Card,
  EmptyState,
  LinkButton,
  PageShell,
  Pagination,
  SectionLabel,
} from '@/components/ui';
import { db } from '@/db/client';
import { withUserContext } from '@/db/rls';
import {
  articles,
  leagueMembers,
  leagues,
  matches,
  predictions,
  seasons,
  users,
} from '@/db/schema';
import { displayNameSql } from '@/lib/display-name';
import { getTodayMatches } from '@/lib/matches/today';
import { SubmitButton } from '@/components/submit-button';

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
    // ตัวเลขบนหน้า landing ต้องเป็นของจริง ไม่ใช่ตัวเลขตกแต่ง — ยิงสามอันพร้อมกันด้วย
    // Promise.all เพราะไม่มีอันไหนต้องรอผลของอีกอัน
    const [[{ leagueCount }], [{ matchCount }], [{ aiPlayerCount }]] = await Promise.all([
      db.select({ leagueCount: count() }).from(leagues),
      db
        .select({ matchCount: count() })
        .from(matches)
        .innerJoin(seasons, eq(seasons.id, matches.seasonId))
        .where(eq(seasons.isActive, true)),
      db.select({ aiPlayerCount: count() }).from(users).where(eq(users.playerKind, 'ai')),
    ]);

    return (
      <Landing
        leagueCount={leagueCount}
        matchCount={matchCount}
        aiPlayerCount={aiPlayerCount}
        loginButton={
          <form
            action={async () => {
              'use server';
              await signIn('google');
            }}
          >
            <SubmitButton className="px-6 py-2.5 text-base">
              เข้าสู่ระบบด้วย Google
            </SubmitButton>
          </form>
        }
      />
    );
  }

  const userId = session.user.id;

  // อ่านเลขหน้าจาก ?page= — searchParams เป็น Promise ใน Next 16 เหมือน params
  // กันค่าเพี้ยน (page=abc, page=-1, page=999) ด้วยการ clamp ทีหลังเมื่อรู้จำนวนหน้าจริงแล้ว
  const searchParams = await props.searchParams;
  const rawPage = Number(Array.isArray(searchParams.page) ? searchParams.page[0] : searchParams.page);
  const requestedPage = Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1;

  const [myLeagues, [{ total }], [me], todayMatches] = await Promise.all([
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
    db.select({ name: displayNameSql }).from(users).where(eq(users.id, userId)).limit(1),
    getTodayMatches(userId),
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
          userName={me?.name ?? ''}
          matchday={myLeagues[0]?.currentMatchday ?? null}
          leagueCount={myLeagues.length}
          pendingCount={totalPending}
        />

        {/* บอลวันนี้ — วางไว้ใต้ Hero เพราะเป็นสิ่งที่เปลี่ยนบ่อยที่สุดบนหน้าและเป็นเหตุผลหลัก
            ที่คนเปิดเว็บซ้ำระหว่างวัน ("คืนนี้มีบอลอะไร ทายครบยัง") */}
        {todayMatches.length > 0 && (
          <section>
            <SectionLabel>บอลวันนี้</SectionLabel>
            <LiveMatches matches={todayMatches} />
            <LiveNotice />
          </section>
        )}

        {/* "ลีกของคุณ" ถูกย้ายขึ้นมาก่อนคอลัมน์ข่าว — เดิมอยู่ล่างสุด ผู้ใช้ที่เข้ามาเพื่อ "ไปทาย"
            (ซึ่งเป็นเหตุผลหลักที่เข้าเว็บ) ต้องเลื่อนผ่านบทความหกใบก่อนถึงจะเจอ ของที่กดบ่อยที่สุด
            ควรอยู่ใกล้บนสุด ส่วนบทความเป็นของอ่านเล่น วางไว้ล่างได้ */}
        <section>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <SectionLabel>ลีกของคุณ</SectionLabel>
            <span className="mb-2 flex gap-2">
              <LinkButton href="/leagues" size="sm" variant="secondary">
                เข้าร่วมลีกอื่น
              </LinkButton>
              <LinkButton href="/leagues/new" size="sm" variant="secondary">
                สร้างลีกใหม่
              </LinkButton>
            </span>
          </div>

          {myLeagues.length === 0 ? (
            <Card className="text-center">
              <p className="text-sm text-foreground">ยังไม่ได้อยู่ลีกไหนเลย</p>
              <p className="mt-1 text-sm text-muted">
                เข้าร่วมลีกที่มีอยู่แล้ว หรือสร้างลีกใหม่ชวนเพื่อนมาแข่งกัน
              </p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                <LinkButton href="/leagues">ดูลีกที่เข้าได้</LinkButton>
                <LinkButton href="/leagues/new" variant="secondary">
                  สร้างลีกใหม่
                </LinkButton>
              </div>
            </Card>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {myLeagues.map((l) => {
                const pending = pendingCountByLeague.get(l.id) ?? 0;
                return (
                  <li key={l.id}>
                    <Link
                      href={pending > 0 ? `/leagues/${l.id}/predict` : `/leagues/${l.id}`}
                      className="block h-full"
                    >
                      <Card
                        className={`flex h-full animate-fade-up flex-col justify-between gap-3 transition-all duration-200 hover:-translate-y-0.5 hover:border-accent/50 hover:bg-surface-hover ${
                          pending > 0 ? 'border-accent/40' : ''
                        }`}
                      >
                        <div className="min-w-0">
                          <p className="truncate font-display text-base font-semibold text-foreground">
                            {l.name}
                          </p>
                          <p className="mt-0.5 text-xs text-muted">
                            {l.currentMatchday ? `แมตช์เดย์ ${l.currentMatchday}` : 'ยังไม่เริ่ม'}
                          </p>
                        </div>

                        {pending > 0 ? (
                          <span className="flex items-center justify-between gap-2">
                            <Badge tone="accent">ยังไม่ทาย {pending} นัด</Badge>
                            <span className="text-xs font-medium text-accent">ทายเลย →</span>
                          </span>
                        ) : (
                          <span className="flex items-center justify-between gap-2">
                            <span className="text-xs text-muted">ทายครบแล้ว</span>
                            <span className="text-xs text-muted">ดูลีก →</span>
                          </span>
                        )}
                      </Card>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <span className="flex items-center gap-2">
              <SectionLabel>คอลัมน์ประจำวัน</SectionLabel>
              <span className="mb-2">
                <Badge tone="accent">เขียนโดย AI</Badge>
              </span>
            </span>
            <span className="mb-2">
              <LinkButton href="/news" variant="ghost" size="sm">
                ดูย้อนหลังทั้งหมด →
              </LinkButton>
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
            </>
          )}
        </section>
      </div>
    </PageShell>
  );
}
