"use client";

import { useActionState, useEffect, useState } from "react";

import { removeMember, type RemoveMemberState } from "./actions";

// ปุ่มเตะสมาชิกออก — ยืนยันสองจังหวะในที่เดียวกัน (กด ✕ → กลายเป็น "ยืนยัน?" → กดซ้ำ = ลบจริง)
// จงใจไม่ใช้ window.confirm เพราะกล่องของเบราว์เซอร์บล็อกทั้งแท็บและหน้าตาไม่เข้ากับเว็บ
// เผลอกดค้างไว้เฉย ๆ ก็ไม่มีอะไรเสียหาย — เกิน 4 วินาทีไม่กดซ้ำจะถอยกลับเป็นปุ่มปกติเอง
export function RemoveMemberButton({
  leagueId,
  memberUserId,
  memberName,
}: {
  leagueId: string;
  memberUserId: string;
  memberName: string;
}) {
  const [confirming, setConfirming] = useState(false);
  const [state, formAction, pending] = useActionState<
    RemoveMemberState,
    FormData
  >(removeMember.bind(null, leagueId, memberUserId), {});

  useEffect(() => {
    if (!confirming) return;
    const id = setTimeout(() => setConfirming(false), 4_000);
    return () => clearTimeout(id);
  }, [confirming]);

  if (!confirming) {
    return (
      <button
        onClick={() => setConfirming(true)}
        aria-label={`เตะ ${memberName} ออกจากลีก`}
        title="เตะออกจากลีก"
        className="rounded-lg px-2 py-1 text-xs text-muted transition-colors hover:bg-surface-hover hover:text-danger"
      >
        ✕
      </button>
    );
  }

  return (
    <form action={formAction} className="flex items-center gap-1.5">
      {state.error && (
        <span className="text-xs text-danger">{state.error}</span>
      )}
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-danger/15 px-2.5 py-1 text-xs font-medium text-danger transition-colors hover:bg-danger/25 disabled:opacity-50"
      >
        {pending ? "กำลังลบ..." : `ยืนยันเตะ ${memberName}?`}
      </button>
      <button
        type="button"
        onClick={() => setConfirming(false)}
        className="rounded-lg px-2 py-1 text-xs text-muted hover:bg-surface-hover hover:text-foreground"
      >
        ยกเลิก
      </button>
    </form>
  );
}
