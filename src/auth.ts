import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';
import { DrizzleAdapter } from '@auth/drizzle-adapter';

import { db } from '@/db/client';
import { accounts, sessions, users, verificationTokens } from '@/db/schema';

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  providers: [Google],
  // DrizzleAdapter ผูกกับ session strategy 'database' (แถวจริงใน sessions table)
  // ไม่ใช่ JWT — ตรงกับตารางที่ออกแบบไว้ใน schema.sql
  session: { strategy: 'database' },
});
