import type { ReactNode } from 'react';

import { LogoMark } from './logo';
import { Badge, Card } from './ui';

// หน้าแรกสำหรับคนที่ยังไม่ล็อกอิน — เดิมมีแค่โลโก้ ข้อความบรรทัดเดียว กับปุ่มล็อกอิน ซึ่งโล่งมาก
// และไม่ได้บอกเลยว่าเว็บนี้ทำอะไร คนที่เพื่อนส่งลิงก์มาให้จึงไม่มีข้อมูลพอจะตัดสินใจกดล็อกอิน
//
// ตัวเลขในแถบสถิติเป็นข้อมูลจริงจาก DB ทั้งหมด ไม่ใช่ตัวเลขตกแต่ง — ถ้าใส่ตัวเลขปลอมไว้
// พอผู้ใช้ล็อกอินเข้าไปแล้วเจอของจริงไม่ตรงกัน ความน่าเชื่อถือจะพังทันที
const STEPS = [
  {
    n: '1',
    title: 'ทายก่อนเตะ',
    body: 'เลือกแพ้ ชนะ หรือเสมอ ของทุกนัดในแมตช์เดย์ ทายไว้ล่วงหน้าได้ตลอดจนถึงเวลาคิกออฟ',
  },
  {
    n: '2',
    title: 'ปิดรับตอนคิกออฟ',
    body: 'พอเสียงนกหวีดดัง ระบบล็อกคำทายทันที แก้ย้อนหลังไม่ได้ บังคับที่ระดับฐานข้อมูลจริง',
  },
  {
    n: '3',
    title: 'เปิดพร้อมกัน',
    body: 'คำทายของทุกคนถูกซ่อนจนกว่าจะเริ่มแข่ง แล้วเปิดพร้อมกันหมด ไม่มีใครแอบดูของใครได้',
  },
] as const;

export function Landing({
  leagueCount,
  matchCount,
  aiPlayerCount,
  loginButton,
}: {
  leagueCount: number;
  matchCount: number;
  aiPlayerCount: number;
  // ปุ่มล็อกอินถูกส่งเข้ามาเป็น ReactNode แทนที่จะสร้างในนี้ เพราะมันคือ <form> ที่ผูกกับ
  // Server Action ซึ่งต้องประกาศในไฟล์ page ที่เป็น async server component เท่านั้น
  loginButton: ReactNode;
}) {
  const stats = [
    { value: leagueCount, label: 'ลีกที่เปิดอยู่' },
    { value: matchCount, label: 'นัดในฤดูกาลนี้' },
    { value: aiPlayerCount, label: 'ผู้เล่น AI' },
  ];

  return (
    <main className="flex-1">
      {/* ── ส่วนหัว ───────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden px-4 pb-12 pt-14 sm:px-6 sm:pb-16 sm:pt-20">
        <div
          aria-hidden
          className="absolute left-1/2 top-0 h-80 w-[40rem] max-w-full -translate-x-1/2 rounded-full bg-accent/15 blur-3xl"
        />

        <div className="relative mx-auto flex max-w-2xl flex-col items-center text-center">
          <LogoMark className="animate-pop-in h-16 w-16" />

          <h1 className="animate-fade-up mt-5 font-display text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
            ทายบอลกับเพื่อน
            <br />
            แล้วดูว่า AI แม่นกว่าคนไหม
          </h1>

          <p className="animate-fade-up mt-4 max-w-lg text-base text-muted">
            Pundit คือลีกทายผลฟุตบอลที่มี <span className="text-foreground">AI ลงแข่งด้วยจริง</span>{' '}
            ภายใต้กติกาและเส้นตายเดียวกับคน ตลอดทั้งฤดูกาล — คำถามคือสุดท้ายแล้วใครจะแม่นกว่ากัน
          </p>

          <div className="animate-fade-up mt-7">{loginButton}</div>

          <p className="mt-3 text-xs text-muted">ใช้บัญชี Google ที่มีอยู่แล้ว ไม่ต้องสมัครใหม่</p>
        </div>

        {/* แถบตัวเลขจริงจากฐานข้อมูล */}
        <div className="relative mx-auto mt-12 grid max-w-2xl grid-cols-3 gap-3">
          {stats.map((s) => (
            <div
              key={s.label}
              className="rounded-xl border border-border bg-surface px-3 py-4 text-center"
            >
              <p className="font-display text-2xl font-semibold tabular-nums text-foreground sm:text-3xl">
                {s.value}
              </p>
              <p className="mt-0.5 text-xs text-muted">{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── วิธีเล่น ──────────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-5xl px-4 py-12 sm:px-6">
        <div className="mb-6 text-center">
          <h2 className="font-display text-2xl font-semibold tracking-tight text-foreground">
            เล่นยังไง
          </h2>
          <p className="mt-1 text-sm text-muted">สามขั้นตอน จบในไม่กี่นาทีต่อสัปดาห์</p>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          {STEPS.map((step) => (
            <Card key={step.n} className="animate-fade-up">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-accent-soft font-display text-sm font-semibold text-accent-soft-fg">
                {step.n}
              </span>
              <h3 className="mt-3 font-display text-base font-semibold text-foreground">
                {step.title}
              </h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">{step.body}</p>
            </Card>
          ))}
        </div>
      </section>

      {/* ── จุดขายหลัก: AI ────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-5xl px-4 pb-16 sm:px-6">
        <Card className="relative overflow-hidden bg-gradient-to-br from-accent/12 via-surface to-surface">
          <div
            aria-hidden
            className="absolute -right-12 -top-12 h-48 w-48 rounded-full bg-accent/20 blur-3xl"
          />
          <div className="relative sm:flex sm:items-center sm:gap-8">
            <div className="min-w-0 flex-1">
              <Badge tone="accent">สิ่งที่ทำให้ Pundit ต่างจากที่อื่น</Badge>
              <h2 className="mt-3 font-display text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
                AI ไม่ได้เปรียบแม้แต่นิดเดียว
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                ผู้เล่น AI เขียนคำทายผ่านฟังก์ชันเดียวกับมนุษย์ทุกตัวอักษร และข้อมูลที่มันเห็น
                ถูกกรองด้วยเวลาคิกออฟของนัดนั้นเสมอ จึงไม่มีทางเห็นอะไรที่เกิดขึ้นหลังเตะไปแล้ว
                — ผลที่ออกมาจึงเทียบกันได้จริง
              </p>
              <p className="mt-3 text-sm leading-relaxed text-muted">
                แถม AI ยังเขียนคอลัมน์ฟุตบอลให้อ่านทุกวัน จากข้อมูลจริงในระบบเท่านั้น
              </p>
            </div>
          </div>
        </Card>
      </section>
    </main>
  );
}
