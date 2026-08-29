# Deploy Pundit ขึ้น production

โดเมนเป้าหมาย: **pundit.devda.fyi** (โดเมนหลัก devda.fyi จดไว้ที่ Cloudflare)
โฮสต์: **Vercel** — Cloudflare ทำหน้าที่แค่ DNS ไม่ได้ build เว็บ

---

## 1. แยกฐานข้อมูล prod ออกจาก dev

**ห้ามใช้ฐานข้อมูลตัวเดียวกับที่พัฒนาอยู่เด็ดขาด** — เพราะสคริปต์อย่าง `db:reset-play`,
`db:generate-article -- --force` และ `test-simulate-finish.ts` ถูกออกแบบมาให้ลบ/แก้ข้อมูลได้อิสระ
ตอนทดสอบ ถ้าชี้ไปที่ prod แล้วเผลอรันผิดตัวคือคำทายของเพื่อนทั้งซีซันหายทันที กู้ไม่ได้

ใน Neon ให้สร้าง **branch หรือ project แยก** สำหรับ prod:

1. เข้า Neon Console → เลือก project ของ Pundit
2. กด **Branches** → **New Branch** ตั้งชื่อ `production`
   (หรือสร้าง project ใหม่แยกไปเลยถ้าอยากแยกขาดกว่านั้น)
3. คัดลอก connection string ของ branch นั้น — **ต้องเลือกแบบ pooled** (โฮสต์มีคำว่า `-pooler`)
   เพราะ serverless function ของ Vercel เปิด connection พร้อมกันได้เยอะมาก
   ถ้าใช้ direct connection จะเจอ "too many connections" ตอนมีคนใช้พร้อมกัน

จากนั้นสร้าง schema บน DB ใหม่ โดยรันจากเครื่องตัวเองโดยชี้ `DATABASE_URL` ไปที่ prod ชั่วคราว:

```powershell
$env:DATABASE_URL="<prod pooled connection string>"
npm run db:apply-schema
npm run db:sync-fixtures        # ดึงทีม/โปรแกรมแข่งของทุกลีกใน competitions.ts
npm run db:seed-ai-agents
Remove-Item Env:DATABASE_URL    # อย่าลืมล้างค่า ไม่งั้น terminal นี้จะชี้ prod ต่อไป
```

---

## 2. ตัวแปร environment บน Vercel

ใส่ใน Vercel → Project → Settings → Environment Variables (เลือก scope **Production**):

| ตัวแปร                         | ค่า                                                                                      |
| ------------------------------ | ---------------------------------------------------------------------------------------- |
| `DATABASE_URL`                 | connection string แบบ pooled ของ Neon branch `production`                                |
| `AUTH_SECRET`                  | สร้างใหม่สำหรับ prod (`npx auth secret` หรือ `openssl rand -base64 32`) — คนละตัวกับ dev |
| `AUTH_URL`                     | `https://pundit.devda.fyi`                                                               |
| `AUTH_GOOGLE_ID`               | จาก Google Cloud Console (ตัวเดิมใช้ได้)                                                 |
| `AUTH_GOOGLE_SECRET`           | จาก Google Cloud Console                                                                 |
| `FOOTBALL_DATA_API_TOKEN`      | token เดิมจาก football-data.org                                                          |
| `GOOGLE_GENERATIVE_AI_API_KEY` | API key จาก Google AI Studio                                                             |
| `OPENROUTER_API_KEY`           | API key จาก OpenRouter สำหรับ `stealth/ox-alpha`                                         |
| `TOKENROUTER_API_KEY`          | API key จาก TokenRouter สำหรับ `qwen/qwen3.8-max-free`                                   |
| `GROQ_API_KEY`                 | API key จาก Groq สำหรับ `openai/gpt-oss-120b` และ `openai/gpt-oss-20b`                   |
| `MISTRAL_API_KEY`              | API key จาก Mistral สำหรับ `mistral-small-latest`                                        |
| `SPORTMONKS_API_TOKEN`         | API token จาก SportMonks — ใช้ดึงสกอร์สดของพรีเมียร์ลีกบนหน้าแรก                          |
| `PEXELS_API_KEY`               | API key จาก pexels.com/api — ภาพสำรองของหน้าปกบทความ (ฟรี 200 req/ชม.)                    |
| `ADMIN_EMAILS`                 | อีเมลที่เข้าหน้า /admin ได้ คั่นด้วย , — ไม่ตั้ง = ไม่มีใครเข้าได้เลย                        |
| `CRON_SECRET`                  | สุ่มใหม่ยาว ๆ (`openssl rand -hex 32`) — ใช้ยืนยันตัวตนของ cron                          |

สองอย่างนี้พลาดแล้วไม่มี error ให้เห็น จึงต้องเช็คด้วยตาเอง:

- **ขาด key ของ provider ไหน AI ตัวนั้นจะถูกข้ามเงียบ ๆ** (ตั้งใจให้เป็นแบบนี้ เพื่อให้เพิ่มผู้เล่น AI
  ใหม่ได้ก่อนสมัคร key — ดู `hasApiKey` ใน `src/lib/ai/llm.ts`) ถ้าลืม `GROQ_API_KEY` หรือ
  `MISTRAL_API_KEY` จะเหลือ AI ทายแค่บางตัว โดยที่ไม่มีอะไรฟ้องเลย
- **ขาด `SPORTMONKS_API_TOKEN` แล้วสกอร์สดจะเงียบไปเฉย ๆ** หน้าแรกจะกลับไปใช้สกอร์หน่วงเวลา
  ของ football-data.org แทน (`getSportMonksPremierLeagueLive` คืน `null` ทันทีเมื่อไม่มี token)
- **ขาด `PEXELS_API_KEY` แล้วหน้าปกบทความจะตกไปใช้รูปสต็อกในโค้ด** ซึ่งมีอยู่ไม่กี่ใบ
  จึงเห็นรูปซ้ำกันได้ (ลำดับการหาคือ ข่าวจริง → Pexels → รูปในโค้ด ดู `lib/ai/article-cover-fetch.ts`)

`AUTH_SECRET` ต้องเป็นคนละตัวกับ dev เพราะมันคือกุญแจเซ็น session ถ้าใช้ร่วมกัน
session ที่ออกจากเครื่อง dev จะใช้กับ prod ได้ด้วย ซึ่งไม่ควร

หลังเพิ่ม API keys บน Vercel แล้ว ต้อง deploy ใหม่เพื่อให้ฟังก์ชันอ่านค่า environment
ชุดใหม่ได้ จากนั้นรัน seed กับฐานข้อมูล production หนึ่งครั้งจากเครื่อง local:

```powershell
$env:DATABASE_URL="<prod pooled connection string>"
npm run db:seed-ai-agents
npm run db:join-ai-agents-to-leagues
Remove-Item Env:DATABASE_URL
```

คำสั่ง seed จะสร้าง/เปิดใช้งาน `open-router` และ
`token-router-qwen-max-free` ใน production ส่วนคำสั่ง join จะเพิ่มทั้งคู่เข้า league
เดิมที่มีอยู่แล้ว

---

## 3. Google OAuth — เพิ่ม redirect URI ของ prod

Google Cloud Console → APIs & Services → Credentials → OAuth client ของ Pundit

- **Authorized JavaScript origins**: เพิ่ม `https://pundit.devda.fyi`
- **Authorized redirect URIs**: เพิ่ม `https://pundit.devda.fyi/api/auth/callback/google`

ของ localhost เดิมไม่ต้องลบ จะได้พัฒนาต่อได้

เนื่องจากแอปยังอยู่สถานะ **Testing** อีเมลของเพื่อนทุกคนต้องถูกเพิ่มเป็น **Test user**
ในหน้า Audience ไม่งั้นจะ login ไม่ได้เลย

---

## 4. เชื่อมโดเมนที่ Cloudflare

1. Deploy โปรเจกต์ขึ้น Vercel ก่อน (import จาก GitHub)
2. Vercel → Settings → Domains → เพิ่ม `pundit.devda.fyi`
3. Vercel จะบอก DNS record ที่ต้องเพิ่ม — ปกติเป็น `CNAME pundit → cname.vercel-dns.com`
4. ที่ Cloudflare → DNS → เพิ่ม record ตามนั้น โดย **ตั้ง Proxy status เป็น "DNS only"** (เมฆสีเทา)

ข้อสุดท้ายสำคัญมาก: ถ้าเปิด proxy ของ Cloudflare (เมฆสีส้ม) จะมี CDN สองชั้นซ้อนกัน
ทำให้ Vercel ออกใบรับรอง SSL ไม่ได้ และอาจเจอ redirect วนไม่รู้จบ

---

## 5. ตั้งงานอัตโนมัติที่ cron-job.org

สมัคร cron-job.org (ฟรี) แล้วสร้าง 4 job ตามตารางนี้
ทุก job ตั้ง method เป็น **POST** และเพิ่ม header:

```
Authorization: Bearer <ค่า CRON_SECRET ที่ตั้งไว้บน Vercel>
```

| งาน         | URL                                                | ความถี่ที่แนะนำ         |
| ----------- | -------------------------------------------------- | ----------------------- |
| sync ผลแข่ง | `https://pundit.devda.fyi/api/cron/sync-results`   | ทุก 30 นาที             |
| คิดคะแนน    | `https://pundit.devda.fyi/api/cron/score`          | ทุก 30 นาที (หลัง sync) |
| AI ทายผล    | `https://pundit.devda.fyi/api/cron/ai-predictions` | ทุก 15 นาที             |
| เขียนบทความ | `https://pundit.devda.fyi/api/cron/article`        | วันละครั้ง 08:00        |

**ทำไม AI ทายผลต้องถี่ถึง 15 นาที** — Vercel Hobby จำกัดฟังก์ชันที่ 60 วินาที แต่การให้ AI ทาย
10 นัดต้องเว้นระยะตาม rate limit ของ Gemini ฟรี ทำไม่ทันในรอบเดียว งานจึงถูกออกแบบให้ทำเท่าที่ทัน
แล้วหยุด รอบถัดไปมาทำต่อจากที่ค้าง (ดู `deadlineMs` ใน `src/lib/jobs/ai-predictions.ts`)
ยิงถี่ ๆ ไม่เปลืองอะไร เพราะถ้าไม่มีงานค้างมันจบทันทีโดยไม่เรียก LLM เลย

ทุกงานเป็น idempotent — ยิงซ้ำไม่ทำให้คะแนนเบิ้ลหรือบทความซ้ำ

---

## 6. ตรวจหลัง deploy

```powershell
# ต้องได้ 401 (ไม่มี secret) = route ถูกป้องกันอยู่จริง
curl.exe -4 -i -X POST https://pundit.devda.fyi/api/cron/score

# ใส่ secret แล้วต้องได้ 200
curl.exe -4 -i -X POST https://pundit.devda.fyi/api/cron/score -H "Authorization: Bearer <CRON_SECRET>"
```

แล้วเช็คตาราง `cron_runs` ใน Neon ว่ามีแถว status = success โผล่ขึ้นมาจริง

---

## สิ่งที่ **ไม่ควร** ทำบน production

- อย่ารัน `npm run db:reset` หรือ `npm run db:reset-play` โดยชี้ไปที่ prod
- อย่ารัน `scripts/test-simulate-finish.ts` บน prod (มันแก้ผลแมตช์ให้เป็นผลปลอม)
- อย่าใช้ `AUTH_SECRET` หรือ `DATABASE_URL` ตัวเดียวกับ dev
