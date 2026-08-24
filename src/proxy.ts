// Next.js 16 เปลี่ยนชื่อ middleware.ts เป็น proxy.ts (ฟังก์ชัน export ชื่อ proxy แทน middleware)
// ตอนนี้ยังไม่มี route ที่ต้อง protect จริง แค่ใส่ไว้ให้ Auth.js คอย refresh อายุ session cookie
// ให้ทุก request — ตอนทำหน้า /league/[id] ฯลฯ ค่อยกลับมาเพิ่ม matcher + logic เช็คสิทธิ์ที่นี่
export { auth as proxy } from '@/auth';
