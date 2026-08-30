// สิทธิ์ผู้ดูแลระบบ — อีเมลใน ADMIN_EMAILS (คั่นด้วย ,) เท่านั้น
// ไม่ได้ตั้ง env = ไม่มีใครเป็น admin เลย (ปลอดภัยโดย default)
// อยู่ไฟล์เดียวเพราะมีสองที่ใช้: หน้า /admin (กันเข้า) กับแถบเมนู (โชว์ลิงก์เฉพาะคนที่เข้าได้)
// ถ้าปล่อยให้ต่างคนต่างเขียน เงื่อนไขจะเพี้ยนจากกันแล้วเกิดลิงก์ที่กดแล้วเด้ง หรือหน้าที่เข้าได้แต่หาไม่เจอ
export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const allowed = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  return allowed.includes(email.toLowerCase());
}
