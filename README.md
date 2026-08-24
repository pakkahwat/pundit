# Pundit

ลีกทายผลฟุตบอลกับเพื่อน โดยมี **AI ลงแข่งด้วยจริง** ภายใต้กติกาและเส้นตายเดียวกับคน
เพื่อตอบคำถามว่า AI ทายแม่นกว่าคนไหม

ผู้เล่นทายผลแพ้/ชนะ/เสมอก่อนเตะ ระบบปิดรับตอนคิกออฟ แล้วเปิดคำทายของทุกคนพร้อมกัน
มีคอลัมน์ฟุตบอลรายวันที่ AI เขียนจากข้อมูลจริงในฐานข้อมูล

## Stack

Next.js 16 (App Router) · TypeScript · Postgres บน Neon · Drizzle ORM · Auth.js (Google)
Tailwind CSS v4 · Vercel AI SDK (Gemini) · ข้อมูลฟุตบอลจาก football-data.org

## เริ่มพัฒนา

```bash
npm install
cp .env.local.example .env.local   # แล้วเติมค่าให้ครบ
npm run db:apply-schema            # สร้างตารางทั้งหมด
npm run db:sync-fixtures           # ดึงทีม/โปรแกรมแข่งของทุกลีกใน competitions.ts
npm run db:seed-ai-agents          # สร้างผู้เล่น AI
npm run dev                        # http://localhost:3001
```

## คำสั่งที่ใช้บ่อย

| คำสั่ง | ทำอะไร |
| --- | --- |
| `npm run db:sync-results` | ดึงผลแข่งล่าสุดของทุกลีกที่ active |
| `npm run db:score` | คิดคะแนนจากแมตช์ที่จบแล้ว (idempotent) |
| `npm run db:run-ai-predictions` | ให้ AI ทายผลนัดที่ยังไม่ปิดรับ |
| `npm run db:generate-article` | ให้ AI เขียนคอลัมน์ประจำวัน |
| `npm run db:studio` | เปิด Drizzle Studio ดู/แก้ข้อมูล |
| `npm run db:reset-play -- --yes` | ล้างคำทาย/คะแนน/ลีก แต่เก็บข้อมูลฟุตบอลไว้ |

งานสี่ตัวแรกมี HTTP endpoint คู่กันที่ `/api/cron/*` สำหรับให้ scheduler ยิงตอน production
(ใช้โค้ดชุดเดียวกันใน `src/lib/jobs/`) — ดู [DEPLOY.md](./DEPLOY.md)

## ข้อกำหนดที่ห้ามพลาด

ทั้งหมดนี้บังคับที่ระดับฐานข้อมูล ไม่ใช่แค่ซ่อนใน UI:

1. **ปิดรับทายตอนคิกออฟ** — เทียบกับ `now()` ของ Postgres ในคำสั่งเดียวกับที่เขียนข้อมูล
   ไม่เชื่อเวลาที่ client ส่งมา และไม่มีช่องว่างให้เกิด race condition
   (`src/lib/predictions/guarded-upsert.ts`)
2. **คิดคะแนนซ้ำได้ไม่เพี้ยน** — `unique (league_id, prediction_id)` + เทียบ `result_version`
   รันซ้ำกี่ครั้งคะแนนก็เท่าเดิม (`src/lib/jobs/score.ts`)
3. **รองรับผลแก้ย้อนหลัง** — `result_version` ขยับเมื่อสกอร์เปลี่ยน คะแนนคิดใหม่อัตโนมัติ
4. **ห้ามเห็นคำทายคนอื่นก่อนปิดรับ** — บังคับด้วย Row-Level Security บนตาราง `predictions`
   (`FORCE ROW LEVEL SECURITY`) ต่อให้เขียน query ผิดก็ยังหลุดไม่ได้
5. **AI ไม่ได้เปรียบ** — เขียนคำทายผ่านฟังก์ชันเดียวกับมนุษย์ทุกตัวอักษร และ context ที่เห็น
   ถูกกรองด้วย `kickoff_at` ของแมตช์เป้าหมายเสมอ จึงไม่มีทางเห็นข้อมูลหลังเตะ
6. **ไม่ยิง API เกินโควตาฟรี** — แคชผ่านตาราง `api_cache` และ fallback ไปข้อมูลเก่าเมื่อ API ล่ม

## โครงสร้างที่ควรรู้

```
src/lib/jobs/        ตรรกะงาน cron — ใช้ร่วมกันระหว่าง scripts/ กับ /api/cron/*
src/lib/football/    คุยกับ football-data.org (ตารางคะแนน, ทีม, h2h) + แคช
src/lib/ai/          ผู้เล่น AI: สร้าง context, baseline, เรียก LLM, เขียนบทความ
src/db/schema.sql    แหล่งความจริงของโครงสร้างฐานข้อมูล (schema.ts แปลตามไฟล์นี้)
```
