import dns from 'node:dns';

// โค้ดที่ใช้ได้เฉพาะ Node.js runtime — แยกไฟล์ออกมาต่างหากตามที่เอกสาร Next.js กำหนด
// (docs: "Importing runtime-specific code" ใน 01-app/02-guides/instrumentation.md)
//
// ถ้าเขียน import('node:dns') ไว้ใน instrumentation.ts ตรง ๆ แม้จะครอบด้วย if NEXT_RUNTIME
// แล้วก็ตาม ตัว bundler ยังมองเห็นและพยายาม bundle เข้า Edge runtime ด้วย เลยขึ้น warning
// "A Node.js module is loaded ('node:dns') which is not supported in the Edge Runtime"
// การแยกเป็นไฟล์แล้ว dynamic import ทำให้ bundler ตัดทั้งไฟล์ทิ้งไปตอน build ฝั่ง Edge
//
// เหตุผลที่ต้องบังคับ IPv4: บางเครือข่ายแจก IPv6 มาแต่เส้นทางใช้จริงเสีย ทำให้ fetch ออกไป
// ข้างนอก (Gemini, football-data.org) ค้างยาวจน timeout โดยไม่มี error อะไรเลย
// (เหตุผลเดียวกับ scripts/lib/prefer-ipv4.ts ซึ่งทำให้ฝั่งสคริปต์)
dns.setDefaultResultOrder('ipv4first');
