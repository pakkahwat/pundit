import { eq } from 'drizzle-orm';
import { redirect } from 'next/navigation';

import { auth } from '@/auth';
import { ArticleBody } from '@/components/article-body';
import { Badge, Card, CenteredMessage, LinkButton, PageShell } from '@/components/ui';
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

export default async function ArticlePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) {
    redirect('/');
  }

  const [article] = await db.select().from(articles).where(eq(articles.id, id)).limit(1);
  if (!article) {
    return <CenteredMessage title="ไม่พบบทความนี้" />;
  }

  return (
    <PageShell>
      <div className="mb-4">
        <LinkButton href="/" variant="secondary" size="sm">
          กลับหน้าแรก
        </LinkButton>
      </div>

      <Card>
        <div className="flex items-center gap-2">
          <p className="text-xs text-muted">{formatArticleDate(article.publishedOn)}</p>
          <Badge tone="accent">เขียนโดย AI</Badge>
        </div>
        <h1 className="mt-1 mb-4 font-display text-2xl font-semibold tracking-tight text-foreground">
          {article.title}
        </h1>
        <ArticleBody body={article.body} />
        {article.modelId && (
          <p className="mt-6 border-t border-border pt-4 text-xs text-muted">
            เขียนโดยโมเดล {article.modelId} จากข้อมูลผลการแข่งขันและคะแนนในระบบ ณ วันที่เผยแพร่
          </p>
        )}
      </Card>
    </PageShell>
  );
}
