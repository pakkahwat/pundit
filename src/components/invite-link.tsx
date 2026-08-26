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

  // ตัดลิงก์ตรงทับเส้นสุดท้าย เพื่อให้ "รหัสเชิญ" ท้ายลิงก์ไม่โดนตัดทิ้ง
  // ถ้า truncate ทั้งเส้น บนจอมือถือจะเหลือแค่ https://pundit.devda.fyi/joi… ซึ่งเป็นส่วนที่
  // ไม่มีประโยชน์เลย — ส่วนที่ต้องอ่าน/บอกเพื่อนคือรหัสท้ายสุด จึงให้โดเมนเป็นตัวที่ถูกตัดแทน
  const slash = url.lastIndexOf('/');
  const prefix = slash === -1 ? '' : url.slice(0, slash + 1);
  const code = slash === -1 ? url : url.slice(slash + 1);

  return (
    <div className="flex items-center gap-2 rounded-xl border border-border bg-surface p-2">
      <code className="flex min-w-0 flex-1 px-2 font-mono text-xs text-muted">
        <span className="truncate">{prefix}</span>
        <span className="shrink-0 font-semibold text-foreground">{code}</span>
      </code>
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
