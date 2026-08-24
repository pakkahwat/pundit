'use client';

import { useState } from 'react';

// ลิงก์เชิญพร้อมปุ่มคัดลอก — เดิมเป็นแค่ <code> ที่ผู้ใช้ต้องลากเมาส์เลือกข้อความเองให้ครบ
// ซึ่งพลาดง่ายมากบนมือถือ (ลากไม่ครบ ได้ลิงก์ขาด แล้วเพื่อนกดเข้าไม่ได้)
export function InviteLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      // คืนข้อความปุ่มเป็นเดิมหลังสองวินาที ให้ผู้ใช้กดซ้ำได้และรู้ว่าปุ่มยังทำงานอยู่
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard API ใช้ไม่ได้ (หน้าเว็บที่ไม่ใช่ https หรือผู้ใช้ปิดสิทธิ์ไว้) — ไม่ต้องทำอะไร
      // ผู้ใช้ยังเลือกข้อความคัดลอกเองได้อยู่ดี
    }
  }

  return (
    <div className="flex items-center gap-2 rounded-xl border border-border bg-surface p-2">
      <code className="min-w-0 flex-1 truncate px-2 font-mono text-xs text-muted">{url}</code>
      <button
        type="button"
        onClick={copy}
        className="shrink-0 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-accent hover:bg-accent-soft hover:text-accent-soft-fg"
      >
        {copied ? 'คัดลอกแล้ว' : 'คัดลอก'}
      </button>
    </div>
  );
}
