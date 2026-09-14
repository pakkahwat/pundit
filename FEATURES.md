# สถานะฟีเจอร์ของ Pundit

อัปเดตล่าสุด: 2026-09-14 — ไฟล์นี้คือ baseline ว่า "ตอนนี้ระบบทำอะไรได้บ้าง" ก่อนเริ่มงานรอบถัดไป
อ่านคู่กับ [README.md](./README.md) (แนวคิด/ข้อกำหนด) และ [DEPLOY.md](./DEPLOY.md) (การขึ้น production + migrations)

## สุขภาพโค้ด ณ วันนี้

| รายการ | ผล |
| --- | --- |
| `npx tsc --noEmit` | ผ่าน ไม่มี error |
| `npm test` (node:test ผ่าน tsx) | ผ่าน 88/88 |
| `npm run lint` | ติด 4 errors, 3 warnings (ของเดิม ดูท้ายไฟล์) |
| ลีกที่เปิดใช้ | PL (พรีเมียร์ลีก), CL (แชมเปียนส์ลีก — เฟส 1 รอบลีก) — `src/lib/football/competitions.ts` · PD (ลาลีกา) ปิด 14 ก.ย. 2026 ข้อมูลยังอยู่ |

## เพิ่มล่าสุด (14 ก.ย. 2026 — ต้องรัน migrations ตาม DEPLOY.md ก่อน deploy)

1. **วงจรตัดต่อผู้เล่น AI** — โมเดลที่พังติดกันจะถูกหยั่งเชิงแค่นัดเดียวต่อรอบ ไม่เผางบเวลาของตัวอื่น (ดู §3)
2. **AI บอก % ความมั่นใจ** ทั้งสามผล → เก็บลง log, โชว์ในหน้า reveal หลังคิกออฟ, ตาราง calibration (Brier) ใน `/vs-ai/insights` (§3)
3. **ผู้เล่น "สภา AI"** ทายตามเสียงข้างมากของ AI ตัวอื่น ไม่เรียก LLM (§3)
4. **แจ้งเตือนระบบพังเงียบเข้า Discord ผู้ดูแล** ส่งเฉพาะตอนสถานะเปลี่ยน (§6)
5. **บทความพรีวิวก่อนแมตช์เดย์** + **แบนเนอร์ปกที่ตรงเนื้อหาแน่นอน** (โลโก้ 2 ทีม + สกอร์/เวลาเตะ ซ้อนบนภาพ) (§4)
6. **แชมเปียนส์ลีก เฟส 1** — เปิดลีก CL, เก็บ `matches.stage`, ป้ายรอบแทนเลขแมตช์เดย์ในทุก nav/แจ้งเตือน/พรีวิว, โซนตารางคะแนนต่อลีก; ปิดลาลีกาด้วย `db:season-active` (§7)

---

## 1. หน้าเว็บ (App Router)

### สาธารณะ (ไม่ต้อง login)

| เส้นทาง | ทำอะไร |
| --- | --- |
| `/` | Landing (ยังไม่ login) / หน้าแรก (login แล้ว): บล็อก **บอลวันนี้ · พรีเมียร์ลีก** (นัด -3 ชม. ถึง +24 ชม. ทับสกอร์สดจาก SportMonks), **ลีกของคุณ** พร้อมป้าย "ยังไม่ทาย N นัด", **คอลัมน์ประจำวัน** ล่าสุด (การ์ดพรีวิวมีป้าย "พรีวิวแมตช์เดย์") |
| `/live` | ผลบอลสดพรีเมียร์ลีก นาที/เหตุการณ์จริงจาก SportMonks, `AutoRefresh` ทุก 30 วิ, กดนัดเปิด `MatchDialog` |
| `/fixtures` | โปรแกรมแข่งแยกตามลีก/แมตช์เดย์ (nav เลื่อนแมตช์เดย์) ป้ายบอกว่ายังไม่ได้เข้าร่วมลีก |
| `/standings` | ตารางคะแนน **คำนวณเองจากผลใน DB** (ไม่ใช้ `/standings` ของ football-data เพราะเสิร์ฟผลหลอน) สลับลีกได้ |
| `/teams/[id]` | หน้าทีม: ผลการแข่งขันล่าสุด, โปรแกรมแข่งถัดไป, สถิติพบกัน |
| `/news` , `/news/[id]` | บทความที่ AI เขียน (คอลัมน์รายวัน + พรีวิวแมตช์เดย์) พร้อมแบนเนอร์ปก ป้าย "เขียนโดย AI" / "พรีวิวแมตช์เดย์ N" |
| `/join/[inviteCode]` | หน้ารับลิงก์เชิญ: ถ้ายังไม่ login โชว์ปุ่ม Google แล้ว callback กลับมาที่เดิม |

### ต้อง login (Google OAuth ผ่าน Auth.js)

| เส้นทาง | ทำอะไร | สิทธิ์ |
| --- | --- | --- |
| `/leagues` | ลีกที่อยู่ + ลีกอื่นที่เข้าร่วมได้ด้วยคลิกเดียว (`joinLeague` ใช้ `onConflictDoNothing`) | signed-in |
| `/leagues/new` | สร้างลีก: ชื่อ + เลือกลีกฟุตบอล (จาก `COMPETITIONS`) ใช้ `useActionState` แสดง error ในฟอร์ม | signed-in |
| `/leagues/[id]` | ภาพรวมลีก: ลิงก์เชิญ (`InviteLink` copy ได้), รายชื่อผู้เล่นพร้อม avatar/ป้ายเจ้าของ, ตารางคะแนนย่อ, ฟอร์ม Discord webhook, ปุ่มลบสมาชิก | สมาชิก / owner สำหรับ webhook+ลบ |
| `/leagues/[id]/predict` | ทายผล HOME/DRAW/AWAY ทีละนัดของแมตช์เดย์ (เลื่อนแมตช์เดย์ได้) ปิดรับตอนคิกออฟ กดดู H2H ได้ | สมาชิก |
| `/leagues/[id]/reveal` | เปิดคำทายทุกคนหลังคิกออฟ การ์ดนัดพับได้ + บรรทัดสรุป โชว์ "คุณไม่ได้ทาย"; ของ AI โชว์ **มั่นใจ N%** + เหตุผล (หลังคิกออฟเท่านั้น) | สมาชิก |
| `/leagues/[id]/leaderboard` | ตารางคะแนนลีก + การ์ดโปรไฟล์ (กดชื่อ) | สมาชิก |
| `/leagues/[id]/my-predictions` | ประวัติคำทายของฉัน + เหรียญตราของฉัน + กราฟความแม่น | สมาชิก |
| `/vs-ai` | คน vs AI: ความแม่นสะสมตลอดฤดูกาล (กราฟ), ความแม่นรายคน, นัดที่คนกับ AI เห็นต่างกัน กรองตามลีกได้ | signed-in |
| `/vs-ai/insights` | เจาะลึก AI: ความแม่นแยกชนิดผล (เหย้า/เสมอ/เยือน), เวลาตอบเฉลี่ย, **ตาราง calibration** (มั่นใจเฉลี่ย vs แม่นจริง, ส่วนต่าง, Brier), นัดหักปากกา | signed-in |
| `/settings` | โปรไฟล์ของฉัน: ตั้ง display name (แยกจากชื่อ Google), สถิติการทายรวม/แยกลีก, สตรีค, เหรียญตรา | signed-in |
| `/admin` | สุขภาพระบบ (อ่านอย่างเดียว): งาน cron รอบล่าสุด + จำแนก error, สถานะ AI รายตัว, ความสดของข้อมูล, บทความล่าสุด | อีเมลใน `ADMIN_EMAILS` |

### API routes

| เส้นทาง | ทำอะไร |
| --- | --- |
| `POST/GET /api/cron/[job]` | `sync-results`, `score`, `ai-predictions`, `article` (คอลัมน์ + พรีวิว), `notify` — ต้องมี `Authorization: Bearer CRON_SECRET` (เทียบแบบ timing-safe), `ai-predictions` รันเบื้องหลังด้วย `after()` แล้วตอบ 200 ทันที, ทุกงานบันทึกลง `cron_runs` และรายงาน ops |
| `GET /api/h2h/[externalId]` | H2H โหลดตอนเปิด dialog เท่านั้น (กัน rate limit 10/นาที) |
| `GET /api/profile/[leagueId]/[userId]` | การ์ดโปรไฟล์สมาชิก ดูได้เฉพาะคนที่อยู่ลีกเดียวกัน กดช่องแต้มกางรายการนัดที่ทายถูก |
| `/api/auth/[...nextauth]` | Auth.js (Google) |

`src/proxy.ts` ยังไม่ protect route ไหน แค่ให้ Auth.js ต่ออายุ session cookie ทุก request — สิทธิ์เช็คในแต่ละ page/action

---

## 2. กติกาและการ์ดที่บังคับระดับ DB

- **ปิดรับทายตอนคิกออฟ** — `guardedUpsertPrediction` เทียบ `now()` ของ Postgres ในคำสั่งเดียวกับการเขียน
- **RLS บน `predictions`** (`FORCE ROW LEVEL SECURITY`): เห็นของตัวเองหรือนัดที่คิกออฟแล้วเท่านั้น, insert/update ได้เฉพาะของตัวเองก่อนคิกออฟ — ทุก query ต้องผ่าน `withUserContext` (`src/db/rls.ts`) รวมถึง jobs (สภา AI อ่านเสียงโหวตทีละตัวภายใต้ context ของเจ้าของคำทาย ไม่เจาะ RLS)
- **คิดคะแนน idempotent** — `unique (league_id, prediction_id)` + `scored_result_version`; แต้มต่อลีกตั้งใน `scoring_config` (default ถูก 3 / ผิด 0)
- **ผลแก้ย้อนหลัง** — `result_version` ขยับเมื่อสกอร์เปลี่ยน คะแนนคิดใหม่เอง
- **การ์ด sync สองทิศ** — ไม่ให้ football-data ส่งข้อมูลเก่า/status พัง (timestamp แทนชื่อสถานะ) ทับนัดที่จบแล้ว, นัดเดียวพังไม่ล้มทั้งงาน
- **ล้างแต้มหลอน** — ลบ `prediction_scores` ได้เฉพาะนัดที่ยังไม่เตะ
- **กันแจ้งเตือนซ้ำ** — `unique (league_id, kind, ref)` ใน `notifications_sent`; ops alerts กันซ้ำด้วยสถานะล่าสุดใน `ops_alerts`
- **บทความไม่ซ้ำ** — คอลัมน์ `unique (season_id, published_on) where kind='daily'`, พรีวิว `unique (season_id, matchday) where kind='preview'` (พรีวิวไม่ผูกวันที่ กันเขียนทับกันเมื่อวันเดียวมีสองแมตช์เดย์)
- **AI ไม่ได้เปรียบ** — เขียนคำทายผ่านฟังก์ชันเดียวกับคน, context กรองด้วย `kickoff_at`; % ความมั่นใจของ AI แสดงหลังคิกออฟเท่านั้น; พรีวิวไม่มีคำทายของ AI และ prompt ห้ามฟันธงผล

---

## 3. ผู้เล่น AI

- Provider ที่ต่อไว้ใน `src/lib/ai/llm.ts`: google, groq, mistral, anthropic, openrouter, tokenrouter — ขาด key ตัวไหนข้ามเงียบ (`hasApiKey`)
- ตัวที่ active (`scripts/seed-ai-agents.ts`):

| agent_key | ชื่อในเกม | provider / model |
| --- | --- | --- |
| `baseline-form` | ลุงสถิติ (ไม่ใช้ AI) | static_form_based (`baseline.ts`) ไม่ให้ % |
| `ai-council` | สภา AI (โหวตเสียงข้างมาก) | council (`council.ts`) ไม่เรียก LLM |
| `gemini-flash-lite` | เจ้าสายฟ้า | google / gemini-flash-lite-latest |
| `groq-gpt-oss` | บิ๊กเบิ้ม | groq / openai/gpt-oss-120b |
| `groq-gpt-oss-20b` | น้องเล็กหัวใจโต | groq / openai/gpt-oss-20b |
| `mistral-small` | ลมกรดฝรั่งเศส | mistral / ministral-14b-latest (ย้ายจาก mistral-small-latest 14 ก.ย. 2026 — แผนฟรีเรียกไม่ได้แล้ว) |
| `open-router` | นินจาเงียบเหงา | groq / qwen/qwen3.8-27b |

- ปลดแล้ว: claude-haiku (Anthropic ต้องเติมเครดิต), TokenRouter agent — `seed` จะปิดตัวที่หลุดจากลิสต์และ `join-ai-agents-to-leagues` ไล่ออกจากลีก
- **% ความมั่นใจ**: schema บังคับ `probHome/probDraw/probAway` (required — Groq strict mode ไม่รับ optional) → `normalizeProbabilities` ปรับให้รวม 100 หรือ null ถ้าใช้ไม่ได้; เก็บใน `ai_prediction_logs.prob_*`; ทดสอบแล้วทั้ง Groq/Gemini/Mistral ให้ตัวเลข
- **สภา AI** (`council.ts`): นับโหวตของ AI ทุกตัวที่ทายนัดนั้นแล้ว เสมอกันตัดสินด้วยผลรวม % แล้วค่อยเจ้าบ้าน; % ของสภา = สัดส่วนเสียงแบบ Laplace smoothing (3 เสียงเอกฉันท์ = 66% ไม่ใช่ 100); รอให้ทุกตัวที่ยังทำงานได้ทายก่อน หรือเหลือ < 3 ชม.และมี ≥ 2 เสียง; นัดที่รอไม่บันทึก log ไม่นับพัง
- ทุกครั้งที่ AI ทายจะเก็บ `ai_prediction_logs` (context snapshot, prompt, reasoning, %, latency, error) และแสดงเหตุผล + % ในหน้า reveal
- **กัน reasoning หลุดภาษา** (`thai-text.ts`): prompt บังคับไทย + ถ้าตอบจีน/อังกฤษถามซ้ำ 1 ครั้ง (จำกัดเวลาไม่ให้ทะลุ 55 วิ) ของเก่าแปลด้วย `db:backfill-thai-reasoning` (เก็บต้นฉบับใน `raw_response`)
- งาน `ai-predictions` ทำเท่าที่ทันใน `deadlineMs` (55 วิ) แล้วรอบถัดไปทำต่อ ไม่มีงานค้าง = จบทันทีไม่เรียก LLM
- **วงจรตัดต่อ agent** (`circuit.ts`): พังติดกัน 5 ครั้งล่าสุด (กระจายมากกว่า 1 นัด) → หยั่งเชิงแค่ 1 นัด/รอบ (retry 1 ครั้ง) สำเร็จเมื่อไหร่กลับมาทายเต็มทันทีในรอบเดียวกัน — ทดสอบจริงแล้วกู้ 3 ตัวของ Groq ในรอบเดียว
- แต่ละ AI มีไอคอน/โลโก้ของตัวเอง (`ai-icon.tsx`) สภา = Σ สีเหลืองอำพัน

---

## 4. บทความที่ AI เขียน

- **คอลัมน์ประจำวัน** (`kind='daily'`): `runGenerateArticle` วันละฉบับต่อฤดูกาล จาก `buildArticleSource` (ผลแข่ง, ตารางคะแนน, คำทาย, ข่าว RSS, story seeds) — เก็บ `source_snapshot`
- **พรีวิวก่อนแมตช์เดย์** (`kind='preview'`, `matchday`): เขียนเมื่อเหลือ < 48 ชม.ก่อนนัดแรกที่ยังไม่เตะของแมตช์เดย์ปัจจุบัน แมตช์เดย์ละบท; ข้อมูลคือโปรแกรม (เฉพาะนัดที่ยังไม่เตะ), ฟอร์ม 5 นัด, อันดับ/แต้ม, h2h, เวลาเตะไทย — **ไม่มีคำทายของ AI**, prompt ห้ามฟันธง/ชี้นำ และเช็คซ้ำด้วย `looksLikeTip` (เจอ → เขียนใหม่ 1 ครั้ง ยังเจอ → ไม่เผยแพร่); เรียกทีมด้วยชื่อไทย; CLI `db:generate-article -- --preview [--force]` (พรีวิวทำเฉพาะรอบวันนี้ ไม่ทำตอนเขียนย้อนหลัง)
- โมเดลส่ง `focusTeams` (ทีมหลัก) และ `imageQuery` (ฉากภาพ) มาด้วย → ใช้เลือกแบนเนอร์/ภาพ
- **แบนเนอร์ปก** (`banner://` ใน `cover_image_urls[0]`, `article-cover.ts` + `article-cover-fetch.ts` `buildArticleCover`): ภาพพื้นหลัง (สนามเจ้าบ้าน → ข่าวจริง → Pexels ด้วย `imageQuery` แล้วคำค้นตามหมวด → รูปในโค้ด) ซ้อนด้วยของจาก DB เราเอง: โลโก้เหย้า/เยือน + สกอร์ (สรุปผล) หรือ VS + เวลาเตะ (พรีวิว) หรือโลโก้ทีมเดียว + ป้ายหมวด (ย้ายทีม/บาดเจ็บ/ตาราง) — `ArticleCard` เรนเดอร์เอง, รองรับ `vs://` รุ่นเก่า, `db:backfill-covers` ทำย้อนหลังได้
- ข้อจำกัด: ภาพหน้าปกแบบ AI generate ทดสอบแล้ว Gemini image models ทุกตัวได้โควตา 0 บน free tier จึงยังใช้ภาพจริง/สต็อก
- Discord: กฎ `article` โพสต์ทั้งคอลัมน์และพรีวิว (ไอคอน 📰 / 🔭)

---

## 5. สถิติ โปรไฟล์ เหรียญตรา

- `lib/stats/profile.ts`: ความแม่น, สตรีคปัจจุบัน/สูงสุด (`users.best_streak`), สถิติแยกรายลีก
- `lib/stats/badges.ts`: เหรียญ 21 แบบ — `awardBadgesForUsers` ให้หลังคิดคะแนน, มี backfill script, ภาพเหรียญ generate ด้วยสคริปต์
- `lib/stats/vs-ai.ts` + `ai-insights.ts`: สรุปคน vs AI, ความแม่นรายแมตช์เดย์, นัดหักปากกา, นัดที่คนกับ AI แตกกัน, **calibration** (`getCalibration`: มั่นใจเฉลี่ย, แม่นจริง, Brier 3 ผล นับเฉพาะนัดที่มี % และออกผลแล้ว ≥ 5 นัด)
- `AccuracyChart` กราฟความแม่นสะสม

---

## 6. แจ้งเตือน Discord

**ต่อลีก** (`runNotify`, webhook ตั้งโดย owner ใน `/leagues/[id]`, validate URL):

| kind | ยิงเมื่อ |
| --- | --- |
| `human` (deadlineRule) | เตือนคนที่ยังไม่ทายก่อนเส้นตาย |
| `reveal` | เปิดคำทายหลังคิกออฟ |
| `lead_change` | จ่าฝูงเปลี่ยน |
| `ai_split` | AI เห็นต่างกันในนัดหนึ่ง |
| `recap` | สรุปหลังแมตช์เดย์จบ (คน vs AI) |
| `article` | บทความใหม่ (คอลัมน์/พรีวิว สูงสุด 3 ใบต่อรอบ) |

**ผู้ดูแลระบบ** (`lib/notify/ops.ts`, env `OPS_DISCORD_WEBHOOK_URL`, ตาราง `ops_alerts`): ส่งเฉพาะตอนสถานะเปลี่ยน + ส่งอีกครั้งตอนหาย

| key | ยิงเมื่อ |
| --- | --- |
| `cron:<job>` | งาน cron ล้มเหลว (`withCronRun`) |
| `stale:sync_results` / `stale:run_ai_predictions` | ไม่ได้รันสำเร็จมานาน (3 ชม. / 2 ชม.) — เช็คทุกครั้งที่งานไหนก็ได้รันสำเร็จ |
| `agent:<agent_key>` | ผู้เล่น AI วงจรตัดและหยั่งเชิงไม่ผ่าน |
| `articles` | งานเขียนบทความพังโดยไม่มีบทความใหม่เลยในรอบนั้น (งานนี้กลืน error รายลีก `cron:` จึงมองไม่เห็น) |

ทุก error ในตัวนี้ถูกกลืน (ตารางยังไม่ migrate, Discord ล่ม) ไม่ทำให้งานหลักพัง; ไม่ตั้ง env = แค่บันทึกสถานะ

---

## 7. ข้อมูลฟุตบอล

- football-data.org ผ่าน `cachedFetchJson` → ตาราง `api_cache` + fallback ข้อมูลเก่าเมื่อ API ล่ม; `sync-fixtures` เว้นระยะกันโควตา 10 req/นาที
- SportMonks (พรีเมียร์ลีกเท่านั้น): สกอร์สด นาที เหตุการณ์ — ทับทีละฟิลด์ด้วย `overlayLiveScores` (`live-overlay.ts`) ไม่แทนทั้งรายการ; จับคู่ทีมด้วย `team-aliases.ts`; ไม่มี token = เงียบ ๆ ใช้สกอร์หน่วงเวลา
- แมตช์เดย์ปัจจุบันคำนวณจากโปรแกรมใน DB (`current-matchday.ts`) ไม่เชื่อค่า provider
- **บอลถ้วย (CL)**: `matches.stage` จาก football-data (LEAGUE_STAGE/PLAYOFFS/LAST_16/…) → `stage-label.ts` แปลงเป็น "เพลย์ออฟ นัดแรก" ฯลฯ (นัดแรก/สองนับจากลำดับแมตช์เดย์ในรอบ) ใช้ในหน้าโปรแกรม/ทาย/reveal/หน้าแรก/ตาราง/Discord/พรีวิว; โซนตาราง (1-8 เข้ารอบ, 9-24 เพลย์ออฟ, ที่เหลือตกรอบ) ตั้งใน `competitions.ts`
  - **เฟส 2 ที่ยังไม่ทำ (ก่อน ก.พ. 2027)**: จับคู่สองนัด + สกอร์รวม, ซ่อนตารางหลังจบรอบลีก, bracket, กติกาผล 90 นาที vs ต่อเวลา (ต้องเก็บ `regularTime` แยก), เช็คว่าเลขแมตช์เดย์รอบน็อกเอาต์ของ football-data นับต่อจาก 8 หรือเริ่มใหม่ (ดู `db:season-status`)
- ปิด/เปิดลีก: `db:season-active -- --code=XX --off|--on` (ทุกงานและหน้าสร้างลีก/รายการลีก/แจ้งเตือน อ่านจาก `seasons.is_active`)
- `getStandings` คำนวณจาก `matches` เอง; `recover-missing-results` หักลบผลที่ API ไม่ส่งมาจากตารางคะแนน

---

## 8. งานอัตโนมัติ / สคริปต์ (`src/lib/jobs` ใช้ร่วมกันระหว่าง CLI กับ `/api/cron`)

| งาน | CLI | cron |
| --- | --- | --- |
| sync โปรแกรม/ทีมทั้งฤดูกาล | `db:sync-fixtures` | – |
| sync ผลแข่ง (±10 วันบน cron) | `db:sync-results` | ทุก 30 นาที |
| คิดคะแนน + เหรียญ | `db:score` | ทุก 30 นาที |
| AI ทายผล (+ สภา, วงจรตัด, ops รายตัว) | `db:run-ai-predictions` | ทุก 15 นาที (background) |
| เขียนคอลัมน์ + พรีวิวแมตช์เดย์ | `db:generate-article` | วันละครั้ง |
| แจ้งเตือน Discord ของลีก | `db:notify` | ทุก 15 นาที |

migrations: `db:migrate-ai-confidence`, `db:migrate-ops-alerts`, `db:migrate-article-kinds`, `db:migrate-match-stage` (ใหม่) + outcome, articles, display-name, notifications, ai-reasoning, profile-badges (เดิม) · `db:season-active` เปิด/ปิดลีก
สคริปต์อื่น: seed/remove AI agents, join AI เข้าลีก, backfill (covers, ai-reasoning, thai-reasoning, badges), reset (schema, play-data), debug (cron-runs, fd-matches, profile-stats, sync-window), season-status, cleanup-stale-scores, recover-missing-results, test (connection, llm — พิมพ์ % ด้วย, sportmonks, stadium-images, simulate-finish), list-models, generate-badge-images

---

## 9. UI/UX ทั่วไป

- `SiteHeader` + `LeagueNav` แท็บในลีก, `NavLink`/`LinkPending` แสดงสถานะกำลังโหลด, `loading.tsx` + `PitchLoader`/`BallSpinner`
- `PageBackdrop`, `CursorAura`, `Hero`, `Logo` — งานตกแต่ง
- `PlayerAvatar` โชว์ชื่อจริงเมื่อ hover, `ProfileName` เปิดการ์ดโปรไฟล์, `TeamCrest` โลโก้ทีม
- `MatchDialog` / `H2hDialog` รายละเอียดนัด/สถิติพบกัน
- responsive ทุกหน้า

---

## 10. ตาราง DB (`src/db/schema.sql` เป็นแหล่งความจริง, `schema.ts` เขียนตาม)

`users` (มี `display_name`, `player_kind`, `best_streak`), `accounts`, `sessions`, `verification_tokens`, `ai_agents`, `seasons`, `teams`, `matches` (`result_version`, `stage`), `leagues` (`invite_code`, `scoring_config`, `discord_webhook_url`), `league_members`, `predictions` (RLS), `prediction_scores`, `user_badges`, `ai_prediction_logs` (+ `prob_home/draw/away`), `articles` (+ `kind`, `matchday`), `api_cache`, `notifications_sent`, `ops_alerts`, `cron_runs`

---

## 11. Environment variables

`DATABASE_URL`, `AUTH_SECRET`, `AUTH_URL`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `FOOTBALL_DATA_API_TOKEN`, `GOOGLE_GENERATIVE_AI_API_KEY`, `GROQ_API_KEY`, `MISTRAL_API_KEY`, `OPENROUTER_API_KEY`, `TOKENROUTER_API_KEY`, `SPORTMONKS_API_TOKEN`, `PEXELS_API_KEY`, `ADMIN_EMAILS`, `CRON_SECRET`, `OPS_DISCORD_WEBHOOK_URL` (ใหม่, ไม่บังคับ)
(`ANTHROPIC_API_KEY` ต่อไว้แต่ไม่มี agent ใช้แล้ว)

---

## 12. สิ่งที่ยังค้าง / ควรรู้ก่อนเริ่มงานใหม่

**Lint errors (4) / warnings (3) ของเดิม**
- `src/app/admin/page.tsx:126,134` — เรียก `Date.now()` ระหว่าง render (`react-hooks/purity`)
- `src/app/leagues/[id]/my-predictions/page.tsx:170` — `"` ใน JSX ต้อง escape
- warnings: `_prev`/`_formData` ไม่ได้ใช้ใน `leagues/[id]/actions.ts`, `parseRssItems` ไม่ได้ใช้ใน `article-cover.ts`

**เอกสาร**
- README บอกให้ `cp .env.local.example` แต่ **ไม่มีไฟล์นี้ใน repo**
- `db:test-llm` กับ `test:llm` ชี้สคริปต์เดียวกัน (ซ้ำ)

**ข้อจำกัดเชิงออกแบบ**
- สกอร์สดมีเฉพาะพรีเมียร์ลีก (SportMonks free) ลาลีกาใช้สกอร์หน่วงเวลา
- `proxy.ts` ยังไม่มี matcher ป้องกัน route
- Google OAuth ยังสถานะ Testing ต้องเพิ่ม test user ทีละคน
- Vercel Hobby จำกัด 60 วิ ต่อ function ทำให้ AI ทายต้องแบ่งรอบ
- `schema.ts` เขียนมือให้ตรง `schema.sql` (ไม่ได้ `drizzle-kit pull`) เสี่ยงคลาดกันถ้าแก้ฝั่งเดียว
- แผนฟรี: Mistral เหลือเฉพาะตระกูล Ministral, Gemini image generation โควตา 0, Anthropic ไม่มี free tier
- ops alerts ฟ้องได้เฉพาะเมื่อยังมีงานไหนสักงานรันอยู่ — ถ้า cron โดนปิดทุกงานพร้อมกันต้องพึ่ง uptime monitor ข้างนอก
