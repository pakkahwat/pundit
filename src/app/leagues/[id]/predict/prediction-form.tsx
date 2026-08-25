'use client';

import { useActionState } from 'react';

import {
  outcomeLabel,
  PREDICTION_OUTCOMES,
  type PredictionOutcome,
} from '@/lib/predictions/outcome';

import { submitPrediction, type SubmitPredictionState } from './actions';
import { SubmitButton } from '@/components/submit-button';

const initialState: SubmitPredictionState = {};

export function PredictionForm({
  matchId,
  homeTeam,
  awayTeam,
  defaultOutcome,
  locked,
}: {
  matchId: string;
  homeTeam: string;
  awayTeam: string;
  defaultOutcome?: PredictionOutcome;
  locked: boolean;
}) {
  const boundAction = submitPrediction.bind(null, matchId);
  const [state, formAction] = useActionState(boundAction, initialState);

  if (locked) {
    return (
      <p className="text-sm text-muted">
        ปิดรับแล้ว ·{' '}
        {defaultOutcome ? (
          <span className="text-foreground">{outcomeLabel(defaultOutcome, homeTeam, awayTeam)}</span>
        ) : (
          'ไม่ได้ทาย'
        )}
      </p>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-3">
      {/* radio 3 ตัวคือสิ่งเดียวที่ทาย — บังคับเลือก (ใส่ required ที่ตัวแรกก็พอ เพราะ browser
          มองทั้งกลุ่มที่ name เดียวกันเป็นชุดเดียว) has-[:checked] ทำให้ label ทั้งอันเปลี่ยนสี
          ตาม input ข้างในโดยไม่ต้องใช้ state ฝั่ง JS เลย */}
      <div className="grid grid-cols-3 gap-2">
        {PREDICTION_OUTCOMES.map((o, i) => (
          <label
            key={o}
            className="flex cursor-pointer items-center justify-center rounded-lg border border-border px-2 py-2 text-center text-sm transition-all duration-150 hover:bg-surface-hover active:scale-95 has-[:checked]:scale-105 has-[:checked]:border-accent has-[:checked]:bg-accent has-[:checked]:text-accent-fg"
          >
            <input
              type="radio"
              name="outcome"
              value={o}
              defaultChecked={defaultOutcome === o}
              required={i === 0}
              className="sr-only"
            />
            {outcomeLabel(o, homeTeam, awayTeam)}
          </label>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <SubmitButton size="sm">บันทึก</SubmitButton>
        {state.success && <span className="animate-fade-up text-xs text-success">บันทึกแล้ว</span>}
        {state.error && <span className="text-xs text-danger">{state.error}</span>}
      </div>
    </form>
  );
}
