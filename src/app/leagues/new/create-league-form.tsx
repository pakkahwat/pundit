'use client';

import { useActionState } from 'react';


import { createLeague, type CreateLeagueState } from './actions';
import { SubmitButton } from '@/components/submit-button';

const initialState: CreateLeagueState = {};

// ต้องเป็น Client Component (มี "use client") เพราะ useActionState เป็น React hook — ใช้ hook
// ได้เฉพาะฝั่ง client เท่านั้น ตัว action ที่ผูกไว้ (createLeague) ยังรันบน server เหมือนเดิม
// นี่คือจุดที่ต้อง "ข้ามขอบ" จาก Server Component (page.tsx) มาเป็น Client Component จริง ๆ
export function CreateLeagueForm({
  competitions,
}: {
  competitions: { code: string; name: string }[];
}) {
  const [state, formAction] = useActionState(createLeague, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-foreground">ชื่อกลุ่ม</span>
        <input
          name="name"
          placeholder="เช่น แก๊งเพื่อนออฟฟิศ"
          required
          autoFocus
          maxLength={60}
          className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-foreground">ลีกที่จะทาย</span>
        <select
          name="competitionCode"
          required
          defaultValue={competitions[0]?.code}
          className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-accent focus:outline-none"
        >
          {competitions.map((c) => (
            <option key={c.code} value={c.code}>
              {c.name}
            </option>
          ))}
        </select>
        <span className="text-xs text-muted">
          เลือกได้ลีกเดียวต่อกลุ่ม — ถ้าอยากทายหลายลีก สร้างกลุ่มแยกได้
        </span>
      </label>

      {state.error && <p className="text-sm text-danger">{state.error}</p>}

      <SubmitButton className="self-start">สร้างลีก</SubmitButton>
    </form>
  );
}
