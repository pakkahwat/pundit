'use client';

import { useActionState } from 'react';

import { Button } from '@/components/ui';

import { saveDiscordWebhook, type WebhookState } from './actions';

// ฟอร์มตั้ง webhook ของ Discord — เห็นเฉพาะเจ้าของลีก (หน้า page ซ่อนไว้ และ action เช็คสิทธิ์ซ้ำ
// อีกชั้นที่ server เพราะ Server Action ถูกเรียกตรง ๆ ได้โดยไม่ผ่าน UI)
//
// จงใจไม่เอา URL เดิมมาเติมในช่อง แม้เจ้าของจะมีสิทธิ์เห็นก็ตาม — ใครถือลิงก์นี้โพสต์เข้าห้องเขา
// ได้ทันที ไม่มีเหตุผลที่ต้องส่งมันกลับมาแสดงบนหน้าจอทุกครั้งที่เปิดหน้าลีก บอกแค่ว่า "เปิดอยู่"
// ก็พอ อยากเปลี่ยนก็วางอันใหม่ทับ
export function DiscordForm({ leagueId, enabled }: { leagueId: string; enabled: boolean }) {
  const [state, action, pending] = useActionState<WebhookState, FormData>(
    saveDiscordWebhook.bind(null, leagueId),
    {},
  );

  return (
    <form action={action} className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="url"
          name="webhookUrl"
          placeholder={enabled ? 'วางลิงก์ใหม่เพื่อเปลี่ยน (เว้นว่าง = ปิด)' : 'https://discord.com/api/webhooks/...'}
          className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
        />
        <Button type="submit" disabled={pending}>
          {pending ? 'กำลังทดสอบ...' : 'บันทึก'}
        </Button>
      </div>

      {state.ok && <p className="text-sm text-success">{state.ok}</p>}
      {state.error && <p className="text-sm text-danger">{state.error}</p>}

      <p className="text-xs text-muted">
        {enabled ? '🟢 เปิดการแจ้งเตือนอยู่' : '⚪ ยังไม่ได้เปิดการแจ้งเตือน'} · สร้างลิงก์ได้จาก
        Discord: Server Settings → Integrations → Webhooks → New Webhook → Copy Webhook URL
      </p>
    </form>
  );
}
