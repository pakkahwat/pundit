import { sql } from 'drizzle-orm';

import { users } from '@/db/schema';

// ชื่อที่ใช้แสดงทุกที่ในแอป = ชื่อที่ผู้ใช้ตั้งเอง ถ้าไม่ได้ตั้งค่อยใช้ชื่อจาก Google
// ทำเป็น helper ตัวเดียวเพื่อไม่ให้แต่ละหน้าเขียน coalesce เองแล้วหลุดไปหน้าใดหน้าหนึ่ง
// (ถ้าหลุด ผู้ใช้จะเห็นชื่อตัวเองไม่ตรงกันระหว่างหน้า ซึ่งงงมาก)
export const displayNameSql = sql<string | null>`coalesce(${users.displayName}, ${users.name})`;
