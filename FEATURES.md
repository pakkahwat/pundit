# สถานะฟีเจอร์ของ Pundit

อัปเดตล่าสุด: 2026-09-14 (commit `1878429`) — ไฟล์นี้คือ baseline ว่า "ตอนนี้ระบบทำอะไรได้บ้าง" ก่อนเริ่มงานรอบถัดไป
อ่านคู่กับ [README.md](./README.md) (แนวคิด/ข้อกำหนด) และ [DEPLOY.md](./DEPLOY.md) (การขึ้น production)

## สุขภาพโค้ด ณ วันนี้

| รายการ | ผล |
| --- | --- |
| `npx tsc --noEmit` | ผ่าน ไม่มี error |
| `npm test` (node:test ผ่าน tsx) | ผ่าน 58/58 |
| `npm run lint` | **ติด 6 errors, 3 warnings** (ดูท้ายไฟล์) |
| ขนาดโค้ด | ~17,100 บรรทัด TS/TSX ใน `src/` + `scripts/` |
| ลีกที่เปิดใช้ | PL (พรีเมียร์ลีก), PD (ลาลีกา) — `src/lib/football/competitions.ts` |

---

## 1. หน้าเว็บ (App Router)

### สาธารณะ (ไม่ต้อง login)

| เส้นทาง | ทำอะไร |
| --- | --- |
| `/` | Landing (ยังไม่ login) / หน้าแรก (login แล้ว): บล็อก **บอลวันนี้ · พรีเมียร์ลีก** (นัด -3 ชม. ถึง +24 ชม. ทับสกอร์สดจาก SportMonks), **ลีกของคุณ** พร้อมป้าย "ยังไม่ทาย N นัด", **คอลัมน์ประจำวัน** ล่าสุด |
| `/live` | ผลบอลสดพรีเมียร์ลีก นาที/เหตุการณ์จริงจาก SportMonks, `AutoRefresh` ทุก 30 วิ, กดนัดเปิด `MatchDialog` |
| `/fixtures` | โปรแกรมแข่งแยกตามลีก/แมตช์เดย์ (nav เลื่อนแมตช์เดย์) ป้ายบอกว่ายังไม่ได้เข้าร่วมลีก |
| `/standings` | ตารางคะแนน **คำนวณเองจากผลใน DB** (ไม่ใช้ `/standings` ของ football-data เพราะเสิร์ฟผลหลอน) สลับลีกได้ |
| `/teams/[id]` | หน้าทีม: ผลการแข่งขันล่าสุด, โปรแกรมแข่งถัดไป, สถิติพบกัน |
| `/news` , `/news/[id]` | คอลัมน์ที่ AI เขียนรายวัน พร้อมภาพหน้าปก (ข่าวจริง → Pexels → รูปในโค้ด) ป้าย "เขียนโดย AI" |
| `/join/[inviteCode]` | หน้ารับลิงก์เชิญ: ถ้ายังไม่ login โชว์ปุ่ม Google แล้ว callback กลับมาที่เดิม |

### ต้อง login (Google OAuth ผ่าน Auth.js)

| เส้นทาง | ทำอะไร | สิทธิ์ |
| --- | --- | --- |
| `/leagues` | ลีกที่อยู่ + ลีกอื่นที่เข้าร่วมได้ด้วยคลิกเดียว (`joinLeague` ใช้ `onConflictDoNothing`) | signed-in |
| `/leagues/new` | สร้างลีก: ชื่อ + เลือกลีกฟุตบอล (จาก `COMPETITIONS`) ใช้ `useActionState` แสดง error ในฟอร์ม | signed-in |
| `/leagues/[id]` | ภาพรวมลีก: ลิงก์เชิญ (`InviteLink` copy ได้), รายชื่อผู้เล่นพร้อม avatar/ป้ายเจ้าของ, ตารางคะแนนย่อ, ฟอร์ม Discord webhook, ปุ่มลบสมาชิก | สมาชิก / owner สำหรับ webhook+ลบ |
| `/leagues/[id]/predict` | ทายผล HOME/DRAW/AWAY ทีละนัดของแมตช์เดย์ (เลื่อนแมตช์เดย์ได้) ปิดรับตอนคิกออฟ กดดู H2H ได้ | สมาชิก |
| `/leagues/[id]/reveal` | เปิดคำทายทุกคนหลังคิกออฟ การ์ดนัดพับได้ + บรรทัดสรุป โชว์ "คุณไม่ได้ทาย" | สมาชิก |
| `/leagues/[id]/leaderboard` | ตารางคะแนนลีก + การ์ดโปรไฟล์ (กดชื่อ) | สมาชิก |
| `/leagues/[id]/my-predictions` | ประวัติคำทายของฉัน + เหรียญตราของฉัน + กราฟความแม่น | สมาชิก |
| `/vs-ai` | คน vs AI: ความแม่นสะสมตลอดฤดูกาล (กราฟ), ความแม่นรายคน, นัดที่คนกับ AI เห็นต่างกัน กรองตามลีกได้ | signed-in |
| `/vs-ai/insights` | เจาะลึก AI: ความแม่นแยกชนิดผล (เหย้า/เสมอ/เยือน), เวลาตอบเฉลี่ย, นัดหักปากกา (คนถูก AI ผิด) | signed-in |
| `/settings` | โปรไฟล์ของฉัน: ตั้ง display name (แยกจากชื่อ Google), สถิติการทายรวม/แยกลีก, สตรีค, เหรียญตรา | signed-in |
| `/admin` | สุขภาพระบบ (อ่านอย่างเดียว): งาน cron รอบล่าสุด + จำแนก error, สถานะ AI รายตัว, ความสดของข้อมูล, บทความล่าสุด | อีเมลใน `ADMIN_EMAILS` |

### API routes

| เส้นทาง | ทำอะไร |
| --- | --- |
| `POST/GET /api/cron/[job]` | `sync-results`, `score`, `ai-predictions`, `article`, `notify` — ต้องมี `Authorization: Bearer CRON_SECRET` (เทียบแบบ timing-safe), `ai-predictions` รันเบื้องหลังด้วย `after()` แล้วตอบ 200 ทันที, ทุกงานบันทึกลง `cron_runs` |
| `GET /api/h2h/[externalId]` | H2H โหลดตอนเปิด dialog เท่านั้น (กัน rate limit 10/นาที) |
| `GET /api/profile/[leagueId]/[userId]` | การ์ดโปรไฟล์สมาชิก ดูได้เฉพาะคนที่อยู่ลีกเดียวกัน กดช่องแต้มกางรายการนัดที่ทายถูก |
| `/api/auth/[...nextauth]` | Auth.js (Google) |

`src/proxy.ts` ยังไม่ protect route ไหน แค่ให้ Auth.js ต่ออายุ session cookie ทุก request — สิทธิ์เช็คในแต่ละ page/action

---

## 2. กติกาและการ์ดที่บังคับระดับ DB

- **ปิดรับทายตอนคิกออฟ** — `guardedUpsertPrediction` เทียบ `now()` ของ Postgres ในคำสั่งเดียวกับการเขียน
- **RLS บน `predictions`** (`FORCE ROW LEVEL SECURITY`): เห็นของตัวเองหรือนัดที่คิกออฟแล้วเท่านั้น, insert/update ได้เฉพาะของตัวเองก่อนคิกออฟ — ทุก query ต้องผ่าน `withUserContext` (`src/db/rls.ts`) รวมถึง jobs
- **คิดคะแนน idempotent** — `unique (league_id, prediction_id)` + `scored_result_version`; แต้มต่อลีกตั้งใน `scoring_config` (default ถูก 3 / ผิด 0)
- **ผลแก้ย้อนหลัง** — `result_version` ขยับเมื่อสกอร์เปลี่ยน คะแนนคิดใหม่เอง
- **การ์ด sync สองทิศ** — ไม่ให้ football-data ส่งข้อมูลเก่า/status พัง (timestamp แทนชื่อสถานะ) ทับนัดที่จบแล้ว, นัดเดียวพังไม่ล้มทั้งงาน
- **ล้างแต้มหลอน** — ลบ `prediction_scores` ได้เฉพาะนัดที่ยังไม่เตะ
- **กันแจ้งเตือนซ้ำ** — `unique (league_id, kind, ref)` ใน `notifications_sent`
- **AI ไม่ได้เปรียบ** — เขียนคำทายผ่านฟังก์ชันเดียวกับคน, context กรองด้วย `kickoff_at`

---

## 3. ผู้เล่น AI

- Provider ที่ต่อไว้ใน `src/lib/ai/llm.ts`: google, groq, mistral, anthropic, openrouter, tokenrouter — ขาด key ตัวไหนข้ามเงียบ (`hasApiKey`)
- ตัวที่ active (`scripts/seed-ai-agents.ts`):

| agent_key | ชื่อในเกม | provider / model |
| --- | --- | --- |
| `baseline-form` | ลุงสถิติ (ไม่ใช้ AI) | static_form_based (`baseline.ts`) |
| `gemini-flash-lite` | เจ้าสายฟ้า | google / gemini-flash-lite-latest |
| `groq-gpt-oss` | บิ๊กเบิ้ม | groq / openai/gpt-oss-120b |
| `groq-gpt-oss-20b` | น้องเล็กหัวใจโต | groq / openai/gpt-oss-20b |
| `mistral-small` | ลมกรดฝรั่งเศส | mistral / ministral-14b-latest (ย้ายจาก mistral-small-latest 14 ก.ย. 2026 — แผนฟรีเรียกไม่ได้แล้ว) |
| `open-router` | นินจาเงียบเหงา | groq / qwen/qwen3.8-27b |

- ปลดแล้ว: claude-haiku (Anthropic ต้องเติมเครดิต), TokenRouter agent — `seed` จะปิดตัวที่หลุดจากลิสต์และ `join-ai-agents-to-leagues` ไล่ออกจากลีก
- ทุกครั้งที่ AI ทายจะเก็บ `ai_prediction_logs` (context snapshot, prompt, reasoning, raw response, latency, error) และแสดงเหตุผลของ AI ในหน้า reveal
- งาน `ai-predictions` ทำเท่าที่ทันใน `deadlineMs` (55 วิ) แล้วรอบถัดไปทำต่อ ไม่มีงานค้าง = จบทันทีไม่เรียก LLM
- **วงจรตัดต่อ agent** (`src/lib/ai/circuit.ts`): ตัวที่พังติดกัน 5 ครั้งล่าสุด (กระจายมากกว่า 1 นัด) จะได้ยิงหยั่งเชิงแค่ 1 นัด/รอบ (retry 1 ครั้ง) สำเร็จเมื่อไหร่กลับมาทายเต็มทันทีในรอบเดียวกัน — กันกรณีโมเดลถูกถอดจากแผนฟรีแล้วยิงพังทุกนัดทุก 15 นาที
- แต่ละ AI มีไอคอน/โลโก้ของตัวเอง (`ai-icon.tsx`)

---

## 4. คอลัมน์ข่าวรายวัน (AI เขียน)

- `runGenerateArticle` วันละฉบับต่อฤดูกาล (`unique (season_id, published_on)`) จาก `buildArticleSource` (ผลแข่ง, ตารางคะแนน, คำทาย, story seeds) — เก็บ `source_snapshot`
- ภาพหน้าปก: `classifyArticleTopic` จำแนกหัวข้อ → ข่าวจริงจาก Google News RSS → Pexels → ภาพสนาม/รูปในโค้ด (`article-cover-fetch.ts`, `stadiums.ts`)
- `ArticleCard` / `ArticleBody` แสดงบนหน้าแรกและ `/news`

---

## 5. สถิติ โปรไฟล์ เหรียญตรา

- `lib/stats/profile.ts`: ความแม่น, สตรีคปัจจุบัน/สูงสุด (`users.best_streak`), สถิติแยกรายลีก
- `lib/stats/badges.ts`: เหรียญ 21 แบบ (ประเดิมสนาม, ร้อนแรง, มือขึ้น, ตาทิพย์, จอมแม่น, แม่นเกินมนุษย์, แมตช์เดย์เพอร์เฟกต์, เพอร์เฟกต์ซ้ำสอง, สวนมติ, ผู้ปราบ AI, นกตื่นเช้า, ครึ่งร้อย, ร้อยศึก, เซียนเสมอ, สายบุก, ป้อมปราการ, คัมแบ็ก, เส้นยาแดง, นกฮูก, ขาประจำ, ครบเครื่อง) — `awardBadgesForUsers` ให้หลังคิดคะแนน, มี backfill script, ภาพเหรียญ generate ด้วยสคริปต์
- `lib/stats/vs-ai.ts` + `ai-insights.ts`: สรุปคน vs AI, ความแม่นรายแมตช์เดย์, นัดหักปากกา, นัดที่คนกับ AI แตกกัน
- `AccuracyChart` กราฟความแม่นสะสม

---

## 6. แจ้งเตือน Discord (ต่อลีก)

`runNotify` ตรวจทุกลีกที่ตั้ง webhook (owner ตั้ง/ลบได้ใน `/leagues/[id]`, validate URL) และโพสต์ตามกฎ:

| kind | ยิงเมื่อ |
| --- | --- |
| `human` (deadlineRule) | เตือนคนที่ยังไม่ทายก่อนเส้นตาย |
| `reveal` | เปิดคำทายหลังคิกออฟ |
| `lead_change` | จ่าฝูงเปลี่ยน |
| `ai_split` | AI เห็นต่างกันในนัดหนึ่ง |
| `recap` | สรุปหลังแมตช์เดย์จบ (คน vs AI) |
| `article` | คอลัมน์ใหม่ออก |

---

## 7. ข้อมูลฟุตบอล

- football-data.org ผ่าน `cachedFetchJson` → ตาราง `api_cache` + fallback ข้อมูลเก่าเมื่อ API ล่ม; `sync-fixtures` เว้นระยะกันโควตา 10 req/นาที
- SportMonks (พรีเมียร์ลีกเท่านั้น): สกอร์สด นาที เหตุการณ์ — ทับทีละฟิลด์ด้วย `overlayLiveScores` (`live-overlay.ts`) ไม่แทนทั้งรายการ; จับคู่ทีมด้วย `team-aliases.ts`; ไม่มี token = เงียบ ๆ ใช้สกอร์หน่วงเวลา
- แมตช์เดย์ปัจจุบันคำนวณจากโปรแกรมใน DB (`current-matchday.ts`) ไม่เชื่อค่า provider
- `getStandings` คำนวณจาก `matches` เอง; `recover-missing-results` หักลบผลที่ API ไม่ส่งมาจากตารางคะแนน

---

## 8. งานอัตโนมัติ / สคริปต์ (`src/lib/jobs` ใช้ร่วมกันระหว่าง CLI กับ `/api/cron`)

| งาน | CLI | cron |
| --- | --- | --- |
| sync โปรแกรม/ทีมทั้งฤดูกาล | `db:sync-fixtures` | – |
| sync ผลแข่ง (±10 วันบน cron) | `db:sync-results` | ทุก 30 นาที |
| คิดคะแนน + เหรียญ | `db:score` | ทุก 30 นาที |
| AI ทายผล | `db:run-ai-predictions` | ทุก 15 นาที (background) |
| เขียนคอลัมน์ | `db:generate-article` | วันละครั้ง |
| แจ้งเตือน Discord | `db:notify` | **DEPLOY.md ยังไม่มีตารางสำหรับ job นี้** |

สคริปต์อื่น: seed/remove AI agents, join AI เข้าลีก, migrate (outcome, articles, display-name, notifications, ai-reasoning, profile-badges), backfill (covers, ai-reasoning, badges), reset (schema, play-data), debug (cron-runs, fd-matches, profile-stats, sync-window), season-status, cleanup-stale-scores, recover-missing-results, test (connection, llm, sportmonks, stadium-images, simulate-finish), list-models, generate-badge-images

---

## 9. UI/UX ทั่วไป

- `SiteHeader` + `LeagueNav` แท็บในลีก, `NavLink`/`LinkPending` แสดงสถานะกำลังโหลด, `loading.tsx` + `PitchLoader`/`BallSpinner`
- `PageBackdrop`, `CursorAura`, `Hero`, `Logo` — งานตกแต่ง
- `PlayerAvatar` โชว์ชื่อจริงเมื่อ hover, `ProfileName` เปิดการ์ดโปรไฟล์, `TeamCrest` โลโก้ทีม
- `MatchDialog` / `H2hDialog` รายละเอียดนัด/สถิติพบกัน
- responsive ทุกหน้า (commit `d50e0bd`)

---

## 10. ตาราง DB (`src/db/schema.sql` เป็นแหล่งความจริง, `schema.ts` เขียนตาม)

`users` (มี `display_name`, `player_kind`, `best_streak`), `accounts`, `sessions`, `verification_tokens`, `ai_agents`, `seasons`, `teams`, `matches` (`result_version`), `leagues` (`invite_code`, `scoring_config`, `discord_webhook_url`), `league_members`, `predictions` (RLS), `prediction_scores`, `user_badges`, `ai_prediction_logs`, `articles`, `api_cache`, `notifications_sent`, `cron_runs`

---

## 11. Environment variables

`DATABASE_URL`, `AUTH_SECRET`, `AUTH_URL`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `FOOTBALL_DATA_API_TOKEN`, `GOOGLE_GENERATIVE_AI_API_KEY`, `GROQ_API_KEY`, `MISTRAL_API_KEY`, `OPENROUTER_API_KEY`, `TOKENROUTER_API_KEY`, `SPORTMONKS_API_TOKEN`, `PEXELS_API_KEY`, `ADMIN_EMAILS`, `CRON_SECRET`
(`ANTHROPIC_API_KEY` ต่อไว้แต่ไม่มี agent ใช้แล้ว)

---

## 12. สิ่งที่ยังค้าง / ควรรู้ก่อนเริ่มงานใหม่

**Lint errors (6) / warnings (3)**
- `src/app/admin/page.tsx:126,134` — เรียก `Date.now()` ระหว่าง render (`react-hooks/purity`)
- `src/app/leagues/[id]/my-predictions/page.tsx:170`, `src/app/vs-ai/insights/page.tsx:121` — `"` ใน JSX ต้อง escape
- warnings: `_prev`/`_formData` ไม่ได้ใช้ใน `leagues/[id]/actions.ts`, `parseRssItems` ไม่ได้ใช้ใน `article-cover.ts`

**เอกสารเก่ากว่าโค้ด**
- README บอกให้ `cp .env.local.example` แต่ **ไม่มีไฟล์นี้ใน repo**
- README/DEPLOY ยังพูดถึง TokenRouter เป็น provider ที่ใช้อยู่ ทั้งที่ agent ถูกปลดแล้ว
- DEPLOY.md ตาราง cron มี 4 งาน ไม่มี `notify`; README บอก "งานสี่ตัวแรกมี endpoint" แต่จริงมี 5
- `db:test-llm` กับ `test:llm` ชี้สคริปต์เดียวกัน (ซ้ำ)

**ข้อจำกัดเชิงออกแบบ**
- สกอร์สดมีเฉพาะพรีเมียร์ลีก (SportMonks free) ลาลีกาใช้สกอร์หน่วงเวลา
- `proxy.ts` ยังไม่มี matcher ป้องกัน route
- Google OAuth ยังสถานะ Testing ต้องเพิ่ม test user ทีละคน
- Vercel Hobby จำกัด 60 วิ ต่อ function ทำให้ AI ทายต้องแบ่งรอบ
- `schema.ts` เขียนมือให้ตรง `schema.sql` (ไม่ได้ `drizzle-kit pull`) เสี่ยงคลาดกันถ้าแก้ฝั่งเดียว
