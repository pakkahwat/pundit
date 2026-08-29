import Link from 'next/link';

import { LinkPending } from './link-pending';

// แถบแท็บของหน้าลีก — ปัญหาเดิมคือแต่ละหน้าย่อย (ทายผล/อันดับ/คำทายทุกคน) มีแค่ปุ่ม
// "กลับหน้าลีก" ผู้ใช้จึงต้องเด้งกลับหน้าลีกทุกครั้งที่อยากสลับไปดูอีกหน้า และไม่มีอะไรบอกว่า
// ตอนนี้อยู่หน้าไหน แท็บชุดนี้แก้ทั้งสองอย่าง: สลับหน้าไหนก็ได้ในคลิกเดียว และเห็นตำแหน่งตัวเอง
//
// รับ active มาเป็น prop แทนที่จะอ่าน usePathname() เพราะแบบนั้นต้องทำเป็น client component
// ซึ่งจะส่ง JS ไปฝั่ง browser โดยไม่จำเป็น — แท็บนี้เป็นแค่ลิงก์ ไม่มี state อะไรเลย
const TABS = [
  { key: 'overview', label: 'ภาพรวม', path: '' },
  { key: 'predict', label: 'ทายผล', path: '/predict' },
  { key: 'mine', label: 'คำทายของฉัน', path: '/my-predictions' },
  { key: 'leaderboard', label: 'อันดับ', path: '/leaderboard' },
  { key: 'reveal', label: 'คำทายทุกคน', path: '/reveal' },
] as const;

export type LeagueTab = (typeof TABS)[number]['key'];

export function LeagueNav({
  leagueId,
  active,
  pendingCount = 0,
}: {
  leagueId: string;
  active: LeagueTab;
  pendingCount?: number;
}) {
  return (
    // overflow-x-auto กัน แท็บล้นจอมือถือแล้วดันหน้าเว็บให้เลื่อนแนวนอนทั้งหน้า
    <nav className="mb-6 -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0" aria-label="เมนูลีก">
      <div className="inline-flex min-w-full gap-1 rounded-xl border border-border bg-surface p-1">
        {TABS.map((tab) => {
          const isActive = tab.key === active;
          return (
            <Link
              key={tab.key}
              href={`/leagues/${leagueId}${tab.path}`}
              aria-current={isActive ? 'page' : undefined}
              className={`relative flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-accent text-accent-fg'
                  : 'text-muted hover:bg-surface-hover hover:text-foreground'
              }`}
            >
              {tab.label}
              {/* ตัวเลขนัดที่ยังไม่ได้ทายเกาะอยู่บนแท็บ "ทายผล" ตลอด — เป็นข้อมูลที่มีผลถาวร
                  (ทายไม่ทันคิกออฟคือเสียแต้มนัดนั้นเลย) จึงควรเห็นได้จากทุกหน้าในลีก */}
              {tab.key === 'predict' && pendingCount > 0 && (
                <span
                  className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-semibold tabular-nums ${
                    isActive ? 'bg-accent-fg/20 text-accent-fg' : 'bg-accent text-accent-fg'
                  }`}
                >
                  {pendingCount}
                </span>
              )}
              <LinkPending />
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
