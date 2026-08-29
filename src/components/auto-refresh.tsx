"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

// รีเฟรชข้อมูลฝั่ง server ทุก 30 วินาที — เท่ากับรอบแคชของ SportMonks (revalidate: 30)
// ถี่กว่านี้ก็ได้ข้อมูลชุดเดิมจากแคชกลับมาเปล่า ๆ
//
// router.refresh() ดึงเฉพาะ RSC payload ใหม่ ไม่ใช่โหลดทั้งหน้า — สกอร์เด้งโดยหน้าไม่กระพริบ
// และหยุดตอนแท็บถูกพับไว้ เพราะรีเฟรชให้คนที่ไม่ได้ดูอยู่ไม่มีประโยชน์กับใครเลย
export function AutoRefresh({ intervalMs = 30_000 }: { intervalMs?: number }) {
  const router = useRouter();

  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, intervalMs);
    const onVisible = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [router, intervalMs]);

  return null;
}
