import { eq } from 'drizzle-orm';

import { auth, signIn } from '@/auth';
import { CenteredMessage } from '@/components/ui';
import { db } from '@/db/client';
import { leagues } from '@/db/schema';

import { joinLeague } from './actions';
import { SubmitButton } from '@/components/submit-button';

export default async function JoinPage({ params }: { params: Promise<{ inviteCode: string }> }) {
  const { inviteCode } = await params;
  const session = await auth();

  const [league] = await db
    .select()
    .from(leagues)
    .where(eq(leagues.inviteCode, inviteCode))
    .limit(1);

  if (!league) {
    return <CenteredMessage title="ลิงก์เชิญนี้ไม่ถูกต้อง" />;
  }

  if (!session?.user) {
    return (
      <CenteredMessage title={`เข้าร่วมลีก "${league.name}"`}>
        <p className="text-sm text-muted">ต้องเข้าสู่ระบบก่อน</p>
        <form
          action={async () => {
            'use server';
            // redirectTo ทำให้หลัง login เสร็จ Auth.js เด้งกลับมาหน้า join เดิมแทนหน้าแรก
            await signIn('google', { redirectTo: `/join/${inviteCode}` });
          }}
        >
          <SubmitButton>เข้าสู่ระบบด้วย Google</SubmitButton>
        </form>
      </CenteredMessage>
    );
  }

  const joinThisLeague = joinLeague.bind(null, league.id);

  return (
    <CenteredMessage title={`เข้าร่วมลีก "${league.name}"?`}>
      <form action={joinThisLeague}>
        <SubmitButton>เข้าร่วม</SubmitButton>
      </form>
    </CenteredMessage>
  );
}
