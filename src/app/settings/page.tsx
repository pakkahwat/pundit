import { eq } from 'drizzle-orm';
import { redirect } from 'next/navigation';

import { auth } from '@/auth';
import { Card, LinkButton, PageHeader, PageShell } from '@/components/ui';
import { db } from '@/db/client';
import { users } from '@/db/schema';

import { DisplayNameForm } from './display-name-form';

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect('/');
  }

  const [me] = await db
    .select({ name: users.name, displayName: users.displayName, email: users.email })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);

  return (
    <PageShell width="sm">
      <PageHeader
        title="ตั้งค่า"
        subtitle={me?.email ?? undefined}
        actions={
          <LinkButton href="/" variant="secondary">
            กลับหน้าแรก
          </LinkButton>
        }
      />
      <Card>
        <DisplayNameForm
          currentDisplayName={me?.displayName ?? null}
          googleName={me?.name ?? null}
        />
      </Card>
    </PageShell>
  );
}
