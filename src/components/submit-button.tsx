'use client';

import { useFormStatus } from 'react-dom';
import type { ComponentProps } from 'react';

import { BallSpinner } from './ball-spinner';
import { Button } from './ui';

// ปุ่ม submit ที่รู้เองว่าฟอร์มของตัวเองกำลังส่งอยู่
//
// useFormStatus อ่านสถานะของ <form> ที่ครอบมันอยู่ จึงต้องเป็น component แยก (เรียกใน component
// ที่มี <form> อยู่ข้างในตัวเองไม่ได้ hook จะไม่เห็นฟอร์มนั้น) — นี่คือเหตุผลเดียวที่ไฟล์นี้แยกออกมา
//
// ตัวหมุนซ้อนทับกลางปุ่มแทนที่จะต่อท้ายข้อความ เพราะถ้าต่อท้ายปุ่มจะกว้างขึ้นตอนกด
// แล้วปุ่มข้าง ๆ ขยับตาม ซึ่งเห็นชัดมากเวลาปุ่มเรียงกันหลายอันอย่างในหน้าทายผล
export function SubmitButton({
  children,
  ...props
}: Omit<ComponentProps<typeof Button>, 'type' | 'disabled'>) {
  const { pending } = useFormStatus();

  return (
    <Button {...props} type="submit" disabled={pending} className={`relative ${props.className ?? ''}`}>
      <span className={pending ? 'invisible' : undefined}>{children}</span>
      {pending && (
        <span className="absolute inset-0 flex items-center justify-center">
          <BallSpinner />
        </span>
      )}
    </Button>
  );
}
