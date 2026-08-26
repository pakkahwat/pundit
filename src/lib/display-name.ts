import { sql } from 'drizzle-orm';

import { users } from '@/db/schema';

// ชื่อที่ใช้แสดงทุกที่ในแอป = ชื่อที่ผู้ใช้ตั้งเอง ถ้าไม่ได้ตั้งค่อยใช้ชื่อจาก Google
// ทำเป็น helper ตัวเดียวเพื่อไม่ให้แต่ละหน้าเขียน coalesce เองแล้วหลุดไปหน้าใดหน้าหนึ่ง
// (ถ้าหลุด ผู้ใช้จะเห็นชื่อตัวเองไม่ตรงกันระหว่างหน้า ซึ่งงงมาก)
export const displayNameSql = sql<string | null>`coalesce(${users.displayName}, ${users.name})`;

// ข้อความที่โผล่ตอนเอาเมาส์ชี้ชื่อ — บอกว่าคนที่ตั้งชื่อเล่นไว้จริง ๆ แล้วคือใคร
//
// คืน undefined เมื่อไม่มีอะไรให้เฉลย (ไม่ได้ตั้งชื่อเอง หรือตั้งเหมือนชื่อ Google เป๊ะ ๆ) เพื่อให้
// ฝั่งที่เรียกใช้ส่งค่าลง title ได้ตรง ๆ — title ที่เป็น undefined จะไม่ถูกเรนเดอร์ออกมาเลย
// ผู้เล่น AI ไม่มีบัญชี Google จึงไม่มีอะไรให้เฉลยเช่นกัน
//
// ใช้เฉพาะหน้าที่อยู่ในลีก (สมาชิกลีก/อันดับ/คำทายทุกคน) ไม่ใช้ในหน้าคนปะทะ AI แบบทุกลีก
// เพราะหน้านั้นมีคนจากลีกอื่นที่เราไม่ได้รู้จักด้วย ไม่ควรเอาชื่อจริงของเขาไปโชว์ให้คนแปลกหน้า
export function realNameHint(
  displayName: string | null,
  googleName: string | null,
): string | undefined {
  if (!displayName || !googleName) return undefined;
  if (displayName.trim() === googleName.trim()) return undefined;
  return `ชื่อจากบัญชี Google: ${googleName}`;
}
