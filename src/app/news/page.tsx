import { desc } from 'drizzle-orm';
import { redirect } from 'next/navigation';

import { auth } from '@/auth';
import { ArticleBody } from '@/components/article-body';
import { ArticleCard } from '@/components/article-card';
import { EmptyState, LinkButton, PageHeader, PageShell } from '@/components/ui';
import { db } from '@/db/client';
import { articles } from '@/db/schema';

function formatArticleDate(publishedOn: string) {
  return new Intl.DateTimeFormat('th-TH', {
    timeZone: 'UTC',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(`${publishedOn}T00:00:00Z`));
}

function excerptOf(body: string): string {
  const first = body.split(/\n{2,}/)[0]?.replace(/\*\*/g, '').trim() ?? '';
  return first.length > 160 ? `${first.slice(0, 160)}…` : first;
}

export default async function NewsArchivePage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect('/');
  }

  const rows = await db
    .select({
      id: articles.id,
      publishedOn: articles.publishedOn,
      title: articles.title,
      body: articles.body,
      coverImageUrls: articles.coverImageUrls,
    })
    .from(articles)
    .orderBy(desc(articles.publishedOn))
    .limit(60);

  return (
    <PageShell width="xl">
      <PageHeader
        title="บทความย้อนหลัง"
        subtitle="คอลัมน์ประจำวันที่ AI เขียนจากข้อมูลผลการแข่งขันและคะแนนในระบบ"
        actions={
          <LinkButton href="/" variant="secondary">
            กลับหน้าแรก
          </LinkButton>
        }
      />

      {rows.length === 0 ? (
        <EmptyState>ยังไม่มีบทความ</EmptyState>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((a) => (
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
      )}
    </PageShell>
  );
}
