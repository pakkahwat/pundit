import { LinkButton } from './ui';

// แบนเนอร์บนสุดของหน้าแรก — ตัวเลขทั้งหมดเป็นข้อมูลจริงจาก DB ไม่ใช่ตัวเลขตกแต่ง
// เพราะแบนเนอร์ที่มีแต่สโลแกนสวย ๆ แต่ไม่บอกอะไรเลย สุดท้ายผู้ใช้ก็เลื่อนผ่านทุกครั้ง
export function Hero({
  matchday,
  leagueCount,
  pendingCount,
}: {
  matchday: number | null;
  leagueCount: number;
  pendingCount: number;
}) {
  return (
    <section className="animate-fade-up relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-accent/15 via-surface to-surface p-6 sm:p-8">
      {/* วงกลมเรืองแสงมุมขวา ทำให้การ์ดไม่ดูเป็นสี่เหลี่ยมแบน ๆ — ซ่อนส่วนที่ล้นด้วย
          overflow-hidden ของ section */}
      <div
        aria-hidden
        className="absolute -right-16 -top-16 h-56 w-56 rounded-full bg-accent/20 blur-3xl"
      />

      <div className="relative">
        <p className="text-xs font-semibold uppercase tracking-wider text-accent">
          พรีเมียร์ลีก {matchday ? `· แมตช์เดย์ ${matchday}` : ''}
        </p>

        <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          ทายผลแข่งกับเพื่อน
          <br className="hidden sm:block" /> แล้วดูว่า AI แม่นกว่าคนไหม
        </h1>

        <p className="mt-3 max-w-lg text-sm text-muted">
          ทุกคนทายผลแพ้ชนะเสมอก่อนเตะ ปิดรับตอนคิกออฟ แล้วเปิดพร้อมกัน — มี AI ลงแข่งด้วยจริง
          ภายใต้กติกาและเส้นตายเดียวกันกับคน
        </p>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          {pendingCount > 0 ? (
            <LinkButton href="/leagues">ทายเลย ({pendingCount} นัดรออยู่)</LinkButton>
          ) : (
            <LinkButton href="/leagues">{leagueCount > 0 ? 'ดูลีกทั้งหมด' : 'เข้าร่วมลีก'}</LinkButton>
          )}
          <LinkButton href="/standings" variant="secondary">
            ตารางคะแนนพรีเมียร์ลีก
          </LinkButton>
        </div>
      </div>
    </section>
  );
}
