import Link from 'next/link';
import type {
  ComponentProps,
  ComponentPropsWithoutRef,
  ReactNode,
} from 'react';

import { LinkPending } from './link-pending';

// UI primitive ที่ใช้ร่วมกันทั้งแอป — ทั้งหมดเป็น Server Component ธรรมดา (ไม่มี 'use client')
// เพราะเป็นแค่การจัดวาง/สไตล์ ไม่มี state หรือ event handler เลย ทำให้ไม่ต้องส่ง JS ไปฝั่ง browser

// ความกว้างสูงสุดของเนื้อหาในแต่ละหน้า — เลือกตามชนิดเนื้อหา ไม่ใช่ตามขนาดจอ
//   sm  ฟอร์มสั้น ๆ (สร้างลีก, ตั้งค่า)
//   md  รายการที่อ่านเรียงลงมา (ทายผล, ตารางคะแนน) — แคบไว้อ่านง่ายกว่า
//   lg  หน้าที่มีกริด 2-3 คอลัมน์
//   xl  หน้าแรก/หน้ารวมที่มีกริดและอยากใช้พื้นที่จอกว้าง ๆ ให้คุ้ม
const WIDTHS = {
  sm: 'max-w-md',
  md: 'max-w-2xl',
  lg: 'max-w-4xl',
  xl: 'max-w-6xl',
} as const;

export function PageShell({
  children,
  width = 'md',
}: {
  children: ReactNode;
  width?: keyof typeof WIDTHS;
}) {
  return (
    <main className={`mx-auto w-full ${WIDTHS[width]} flex-1 px-4 py-8 sm:px-6 sm:py-10`}>
      {children}
    </main>
  );
}

// หน้าจอกลาง ๆ สำหรับข้อความสถานะ (ไม่พบลีก / ไม่ใช่สมาชิก / ลิงก์ผิด)
export function CenteredMessage({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="flex w-full max-w-sm flex-col items-center gap-4 text-center">
        <p className="text-lg font-medium text-foreground">{title}</p>
        {children}
      </div>
    </main>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
          {title}
        </h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

export function Card({
  children,
  className = '',
  padded = true,
  ...rest
}: {
  children: ReactNode;
  className?: string;
  padded?: boolean;
} & ComponentPropsWithoutRef<'div'>) {
  return (
    <div
      {...rest}
      className={`rounded-xl border border-border bg-surface ${padded ? 'p-5' : ''} ${className}`}
    >
      {children}
    </div>
  );
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">{children}</h2>
  );
}

const BUTTON_VARIANTS = {
  primary: 'bg-accent text-accent-fg hover:bg-accent-hover',
  secondary: 'border border-border bg-surface text-foreground hover:bg-surface-hover',
  ghost: 'text-muted hover:text-foreground',
} as const;

const BUTTON_SIZES = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-4 py-2 text-sm',
} as const;

function buttonClass(
  variant: keyof typeof BUTTON_VARIANTS = 'primary',
  size: keyof typeof BUTTON_SIZES = 'md',
) {
  return `inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-all duration-150 active:scale-95 disabled:opacity-50 ${BUTTON_VARIANTS[variant]} ${BUTTON_SIZES[size]}`;
}

export function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  ...props
}: ComponentProps<'button'> & {
  variant?: keyof typeof BUTTON_VARIANTS;
  size?: keyof typeof BUTTON_SIZES;
}) {
  return <button className={`${buttonClass(variant, size)} ${className}`} {...props} />;
}

// ปุ่มที่พาไปหน้าอื่น — แสดงตัวหมุนทับตัวเองระหว่างที่หน้าปลายทางยังโหลดไม่เสร็จ
//
// จำเป็นเพราะหน้าส่วนใหญ่ในแอปนี้ดึงข้อมูลจาก DB (บางหน้าจาก API ภายนอกด้วย) การกดแล้วเงียบ
// ไปครึ่งวินาทีทำให้คนกดซ้ำ — ตัว loading เต็มหน้าจาก loading.tsx ตอบโจทย์คนละจังหวะกัน
// (อันนั้นขึ้นตอนหน้าเปลี่ยนแล้ว อันนี้ขึ้นตั้งแต่วินาทีที่กด)
export function LinkButton({
  variant = 'primary',
  size = 'md',
  className = '',
  children,
  ...props
}: ComponentProps<typeof Link> & {
  variant?: keyof typeof BUTTON_VARIANTS;
  size?: keyof typeof BUTTON_SIZES;
}) {
  return (
    <Link className={`relative ${buttonClass(variant, size)} ${className}`} {...props}>
      {children}
      <LinkPending />
    </Link>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <Card className="text-center">
      <p className="text-sm text-muted">{children}</p>
    </Card>
  );
}

// แถบเปลี่ยนหน้าแบบลิงก์ล้วน (ไม่ใช่ปุ่ม JS) — ทำงานได้แม้ JS ยังโหลดไม่เสร็จ และผู้ใช้กด
// เปิดแท็บใหม่ / บุ๊กมาร์กหน้าที่ N ได้ ซึ่ง pagination ที่ทำด้วย state ฝั่ง client ทำไม่ได้
export function Pagination({
  page,
  totalPages,
  hrefFor,
}: {
  page: number;
  totalPages: number;
  hrefFor: (page: number) => string;
}) {
  if (totalPages <= 1) return null;

  return (
    <nav className="mt-4 flex items-center justify-between gap-3" aria-label="เปลี่ยนหน้า">
      {page > 1 ? (
        <LinkButton href={hrefFor(page - 1)} variant="secondary" size="sm">
          ← ใหม่กว่า
        </LinkButton>
      ) : (
        // ช่องว่างแทนปุ่มที่ยังกดไม่ได้ เพื่อให้ปุ่มอีกฝั่งไม่ขยับตำแหน่งเวลาเปลี่ยนหน้า
        <span />
      )}

      <span className="text-xs text-muted">
        หน้า {page} จาก {totalPages}
      </span>

      {page < totalPages ? (
        <LinkButton href={hrefFor(page + 1)} variant="secondary" size="sm">
          เก่ากว่า →
        </LinkButton>
      ) : (
        <span />
      )}
    </nav>
  );
}

export function Badge({
  children,
  tone = 'neutral',
}: {
  children: ReactNode;
  tone?: 'neutral' | 'accent';
}) {
  const tones = {
    neutral: 'border-border text-muted',
    accent: 'border-transparent bg-accent-soft text-accent-soft-fg',
  } as const;
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${tones[tone]}`}
    >
      {children}
    </span>
  );
}
