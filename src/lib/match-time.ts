// helper function เฉย ๆ (ไม่ใช่ component) ใช้ร่วมกันระหว่าง predict/page.tsx และ reveal/page.tsx
// แยกออกมาจาก component body เพราะ eslint (react-hooks/purity) ห้ามเรียกฟังก์ชัน impure
// อย่าง Date.now() ตรง ๆ ใน body ของ component โดยตรง
//
// ข้อควรรู้: ฟังก์ชันนี้เป็นแค่ตัวช่วยแสดงผล/กรอง query เท่านั้น ไม่ใช่จุดบังคับความปลอดภัยจริง —
// การบังคับ "ปิดรับ" ตัวจริงอยู่ที่ SQL guard (now() ของ Postgres เอง ใน actions.ts) และ RLS policy
// บนตาราง predictions ต่างหาก ต่อให้นาฬิกาฝั่งนี้เพี้ยนไปบ้างก็ไม่กระทบความปลอดภัย
export function isMatchLocked(kickoffAt: Date) {
  return kickoffAt.getTime() <= Date.now();
}

export function formatKickoff(date: Date) {
  return new Intl.DateTimeFormat('th-TH', {
    timeZone: 'Asia/Bangkok',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}
