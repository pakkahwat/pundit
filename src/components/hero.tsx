import { LinkButton } from './ui';

// แถบบนสุดของหน้าแรกสำหรับคนที่ล็อกอินแล้ว
//
// เดิมแถบนี้เป็นแบนเนอร์การตลาด (พาดหัวใหญ่ + คำโปรย "ทายผลแข่งกับเพื่อน...") ซึ่งเหมาะกับคนที่
// เพิ่งเข้าเว็บครั้งแรก แต่คนที่ล็อกอินแล้วรู้อยู่แล้วว่าเว็บนี้คืออะไร เห็นซ้ำทุกครั้งก็เปลืองพื้นที่
// จอเปล่า ๆ ตอนนี้คำโปรยพวกนั้นย้ายไปอยู่หน้า landing ของคนที่ยังไม่ล็อกอินแทน
//
// แถบนี้จึงเหลือหน้าที่เดียว: บอกว่า "ตอนนี้ต้องทำอะไร" — ถ้ามีนัดที่ยังไม่ได้ทายก็ดันให้เด่น
// ที่สุดบนหน้า เพราะทายไม่ทันคิกออฟคือเสียแต้มนัดนั้นถาวร แก้ย้อนหลังไม่ได้
export function Hero({
  userName,
  matchday,
  leagueCount,
  pendingCount,
}: {
  userName: string;
  matchday: number | null;
  leagueCount: number;
  pendingCount: number;
}) {
  const urgent = pendingCount > 0;

  return (
    <section
      className={`animate-fade-up relative overflow-hidden rounded-2xl border p-6 sm:p-7 ${
        urgent
          ? 'border-accent/40 bg-gradient-to-br from-accent/20 via-surface to-surface'
          : 'border-border bg-surface'
      }`}
    >
      {urgent && (
        <div
          aria-hidden
          className="absolute -right-16 -top-16 h-56 w-56 rounded-full bg-accent/20 blur-3xl"
        />
      )}

      <div className="relative sm:flex sm:items-center sm:justify-between sm:gap-6">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-accent">
            {matchday ? `แมตช์เดย์ ${matchday}` : 'ยินดีต้อนรับ'}
          </p>

          {urgent ? (
            <>
              <h1 className="mt-1.5 font-display text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
                คุณยังไม่ได้ทาย {pendingCount} นัด
              </h1>
              <p className="mt-1.5 text-sm text-muted">
                ทายไม่ทันคิกออฟคือเสียแต้มนัดนั้นถาวร — แก้ย้อนหลังไม่ได้
              </p>
            </>
          ) : (
            <>
              <h1 className="mt-1.5 font-display text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
                สวัสดี {userName || 'อีกครั้ง'}
              </h1>
              <p className="mt-1.5 text-sm text-muted">
                {leagueCount > 0
                  ? 'ทายครบทุกนัดที่เปิดรับแล้ว — รอผลแข่งได้เลย'
                  : 'ยังไม่ได้อยู่ลีกไหน เข้าร่วมลีกแล้วเริ่มทายได้เลย'}
              </p>
            </>
          )}
        </div>

        <div className="mt-5 flex shrink-0 flex-wrap items-center gap-2 sm:mt-0">
          {urgent ? (
            <LinkButton href="/leagues">ไปทายเลย</LinkButton>
          ) : (
            <LinkButton href="/leagues" variant={leagueCount > 0 ? 'secondary' : 'primary'}>
              {leagueCount > 0 ? 'ดูลีกทั้งหมด' : 'เข้าร่วมลีก'}
            </LinkButton>
          )}
          <LinkButton href="/standings" variant="secondary">
            ตารางคะแนน
          </LinkButton>
        </div>
      </div>
    </section>
  );
}
