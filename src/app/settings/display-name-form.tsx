'use client';

import { useActionState } from 'react';

import { Button } from '@/components/ui';

import { updateDisplayName, type UpdateDisplayNameState } from './actions';

const initialState: UpdateDisplayNameState = {};

export function DisplayNameForm({
  currentDisplayName,
  googleName,
}: {
  currentDisplayName: string | null;
  googleName: string | null;
}) {
  const [state, formAction, pending] = useActionState(updateDisplayName, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-foreground">ชื่อที่แสดงในลีก</span>
        <input
          name="displayName"
          defaultValue={currentDisplayName ?? ''}
          placeholder={googleName ?? 'ตั้งชื่อของคุณ'}
          maxLength={40}
          className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
        />
        <span className="text-xs text-muted">
          เว้นว่างไว้เพื่อกลับไปใช้ชื่อจากบัญชี Google ({googleName ?? 'ไม่มีชื่อ'})
        </span>
      </label>

      {state.error && <p className="text-sm text-danger">{state.error}</p>}
      {state.success && <p className="text-sm text-success">บันทึกแล้ว</p>}

      <Button type="submit" disabled={pending} className="self-start">
        {pending ? 'กำลังบันทึก...' : 'บันทึก'}
      </Button>
    </form>
  );
}
