-- =====================================================================
-- Pundit — DB schema (Postgres / Neon)
-- v1 scope: พรีเมียร์ลีกเท่านั้น (season เดียว) — ตารางไม่ผูกกับ multi-competition
--
-- Role ที่ต้องสร้างบน Neon ก่อนรัน schema นี้:
--   pundit_service : owner ของ schema/migration, BYPASSRLS — ใช้เฉพาะ cron/sync/scoring job
--   pundit_app     : role ที่แอป Next.js ใช้แทนผู้ใช้จริงทุก request ถูก RLS บังคับเต็มที่
--
--   create role pundit_service with login password '...' bypassrls;
--   create role pundit_app with login password '...';
--   grant usage on schema public to pundit_app;
--   grant select, insert, update, delete on all tables in schema public to pundit_app;
--   alter default privileges in schema public
--     grant select, insert, update, delete on tables to pundit_app;
--
-- ทุก request ที่ต่อด้วย pundit_app ต้องตั้ง context ใน transaction เดียวกับ query:
--   begin;
--   select set_config('app.current_user_id', '<uuid ของ session ปัจจุบัน>', true);
--   ... query ปกติ ...
--   commit;
--   Drizzle: db.transaction(async (tx) => { await tx.execute(sql`select set_config(...)`); ... })
--   ข้อจำกัด: ต้องต่อผ่าน connection แบบ session/pooled (node-postgres Pool, postgres.js,
--   หรือ Neon serverless driver โหมด Pool ผ่าน websocket) — ใช้ Neon HTTP driver (neon-http)
--   ไม่ได้ เพราะแต่ละ query เป็นคนละ HTTP call คนละ session, set_config ไม่ค้างข้าม query
-- =====================================================================

create extension if not exists pgcrypto; -- ให้ gen_random_uuid() ใช้ได้

-- ========== enums ==========
create type match_status as enum (
  'SCHEDULED','TIMED','POSTPONED','SUSPENDED','CANCELLED',
  'IN_PLAY','PAUSED','FINISHED','AWARDED'
); -- ตรงกับ status vocabulary ของ football-data.org เป๊ะ ๆ เพื่อให้ sync เป็นแค่ mapping ตรง ๆ ไม่ต้องแปล

create type player_kind as enum ('human','ai');
create type league_role as enum ('owner','member');

-- ========== auth (Auth.js DrizzleAdapter shape) ==========
create table users (
  id uuid primary key default gen_random_uuid(),
  name text,
  email text unique,              -- null ได้สำหรับผู้เล่น AI (ไม่ต้อง login)
  email_verified timestamptz,
  image text,
  player_kind player_kind not null default 'human',
  created_at timestamptz not null default now()
);

create table accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  type text not null,
  provider text not null,
  provider_account_id text not null,
  refresh_token text,
  access_token text,
  expires_at bigint,
  id_token text,
  scope text,
  session_state text,
  token_type text,
  unique (provider, provider_account_id)
);

create table sessions (
  id uuid primary key default gen_random_uuid(),
  session_token text not null unique,
  user_id uuid not null references users(id) on delete cascade,
  expires timestamptz not null
);

create table verification_tokens (
  identifier text not null,
  token text not null,
  expires timestamptz not null,
  primary key (identifier, token)
);

-- ========== AI players ==========
create table ai_agents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references users(id) on delete cascade,
  agent_key text not null unique,       -- 'gpt5-predictor' | 'claude-predictor' | 'baseline-home-1-0'
  display_name text not null,
  provider text,                        -- 'openai' | 'anthropic' | null สำหรับ baseline ที่ไม่เรียก LLM
  model_id text,                        -- 'gpt-5-...' — null ได้สำหรับ baseline
  strategy text not null default 'llm', -- 'llm' | 'static_home_1_0'
  system_prompt text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ========== football data (sync จาก football-data.org — PL เท่านั้นใน v1) ==========
create table seasons (
  id uuid primary key default gen_random_uuid(),
  external_competition_id integer not null, -- football-data.org competition id, PL = 2021
  competition_code text not null,           -- 'PL'
  name text not null,                       -- 'Premier League 2026/27'
  year integer not null,
  current_matchday integer,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (competition_code, year)
);

create table teams (
  id uuid primary key default gen_random_uuid(),
  external_id integer not null unique,      -- football-data.org team id
  name text not null,
  short_name text,
  tla text,
  crest_url text
);

create table matches (
  id uuid primary key default gen_random_uuid(),
  external_id integer not null unique,      -- football-data.org match id — คีย์ upsert ตอน sync
  season_id uuid not null references seasons(id),
  matchday integer not null,
  home_team_id uuid not null references teams(id),
  away_team_id uuid not null references teams(id),
  kickoff_at timestamptz not null,          -- แหล่งความจริงเดียวของเส้นตายทายผล
  status match_status not null default 'SCHEDULED',
  home_score integer,
  away_score integer,
  result_version integer not null default 0, -- เพิ่มเฉพาะตอนสกอร์/status เปลี่ยนจริง — หัวใจของการคิดคะแนนแบบ idempotent
  last_synced_at timestamptz,
  created_at timestamptz not null default now()
);
create index matches_season_matchday_idx on matches (season_id, matchday);
create index matches_kickoff_idx on matches (kickoff_at);

-- ========== leagues (กลุ่มเพื่อนที่สร้างเอง) ==========
create table leagues (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  season_id uuid not null references seasons(id),
  created_by uuid not null references users(id),
  invite_code text not null unique default replace(gen_random_uuid()::text, '-', ''),
  scoring_config jsonb not null default '{"exact":3,"outcome":1,"wrong":0}'::jsonb, -- per-league scoring rule
  created_at timestamptz not null default now()
);

create table league_members (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references leagues(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  role league_role not null default 'member',
  joined_at timestamptz not null default now(),
  unique (league_id, user_id)
);

-- ========== predictions ==========
-- คำทายเป็น global ต่อ (user, match) ไม่ผูก league — คนคนเดียวกันทายแมตช์เดียวกัน
-- ค่าเดียวไม่ว่าจะอยู่กี่ลีก คะแนนต่างหากคือสิ่งที่ผัน per-league (ดู prediction_scores ด้านล่าง)
create table predictions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  match_id uuid not null references matches(id) on delete cascade,
  predicted_home_score smallint not null,
  predicted_away_score smallint not null,
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, match_id)
);
create index predictions_match_idx on predictions (match_id);

-- RLS: บังคับ "เห็นคำทายคนอื่นได้เฉพาะหลังปิดรับ" และ "เขียนได้เฉพาะก่อนปิดรับ" ที่ระดับ database
-- ใช้ได้กับ role pundit_app เท่านั้น (pundit_service ที่ cron ใช้มี BYPASSRLS ข้ามทั้งหมดนี้ไปเลย)
alter table predictions enable row level security;
alter table predictions force row level security;

create policy predictions_select_own_or_locked on predictions
  for select
  using (
    user_id = current_setting('app.current_user_id', true)::uuid
    or exists (
      select 1 from matches m
      where m.id = predictions.match_id
        and now() >= m.kickoff_at
    )
  );

create policy predictions_insert_own_before_kickoff on predictions
  for insert
  with check (
    user_id = current_setting('app.current_user_id', true)::uuid
    and exists (
      select 1 from matches m
      where m.id = match_id and m.kickoff_at > now()
    )
  );

create policy predictions_update_own_before_kickoff on predictions
  for update
  using (user_id = current_setting('app.current_user_id', true)::uuid)
  with check (
    user_id = current_setting('app.current_user_id', true)::uuid
    and exists (
      select 1 from matches m
      where m.id = match_id and m.kickoff_at > now()
    )
  );

-- ========== per-league scoring ==========
-- แยกจาก predictions เพราะกติกาให้คะแนนผันตามลีก (leagues.scoring_config) คนเดียวกัน
-- ทายเหมือนกันแต่คนละลีกได้คะแนนไม่เท่ากันได้ ถ้าลีกตั้งกติกาต่างกัน
-- ไม่ต้องมี RLS ตรงนี้: แถวจะถูกสร้างก็ต่อเมื่อ match FINISHED เท่านั้น ซึ่งแปลว่า kickoff
-- ผ่านไปแล้วเสมอ — ข้อมูลจึง "ปลอดภัยที่จะเห็น" โดยธรรมชาติของเงื่อนไข ไม่มีทางเก็บคะแนนของ
-- แมตช์ที่ยังไม่ปิดรับได้เลย
create table prediction_scores (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references leagues(id) on delete cascade,
  prediction_id uuid not null references predictions(id) on delete cascade,
  points_awarded smallint not null,
  scored_result_version integer not null,   -- เทียบกับ matches.result_version — กลไก idempotent + แก้ผลย้อนหลัง
  scored_at timestamptz not null default now(),
  unique (league_id, prediction_id)
);

-- ========== AI observability ==========
create table ai_prediction_logs (
  id uuid primary key default gen_random_uuid(),
  ai_agent_id uuid not null references ai_agents(id) on delete cascade,
  match_id uuid not null references matches(id) on delete cascade,
  prediction_id uuid references predictions(id), -- null ถ้า parse ไม่ผ่านและไม่ได้เขียน prediction
  model_id text,                                   -- snapshot ของ ai_agents.model_id ตอนเรียกจริง
  context_snapshot jsonb not null,                 -- feature ทั้งหมดที่ส่งให้โมเดล (ฟอร์ม, H2H, อันดับ, เหย้า/เยือน)
  prompt text not null,
  raw_response text,
  parsed_home_score smallint,
  parsed_away_score smallint,
  parse_succeeded boolean not null default false,
  latency_ms integer,
  error text,
  created_at timestamptz not null default now()
);
create index ai_prediction_logs_match_idx on ai_prediction_logs (match_id);

-- ========== ops / caching ==========
create table api_cache (
  cache_key text primary key,   -- 'pl:2026:matchday:5', 'pl:2026:standings'
  payload jsonb not null,
  fetched_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create table cron_runs (              -- แนะนำ ไม่บังคับ แต่ช่วย debug มากเวลาโปรเจกต์รันยาวทั้งฤดูกาล
  id uuid primary key default gen_random_uuid(),
  job_name text not null,             -- 'sync_fixtures' | 'sync_results' | 'score_predictions' | 'run_ai_predictions'
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text,                        -- 'success' | 'error'
  processed_count integer,
  error text
);

-- =====================================================================
-- ตัวอย่าง query อ้างอิง (ไม่ใช่ DDL — เก็บไว้ในคอมเมนต์เป็น reference ตอนเขียนโค้ดจริง)
-- =====================================================================

-- guarded upsert คำทาย (server-time only, ไม่เชื่อ client) — เขียนผ่าน role pundit_app
-- ใน transaction เดียวกับ set_config('app.current_user_id', ...) แล้ว RLS policy ข้างบน
-- จะบังคับ user_id ให้ตรงกับ context เองอยู่แล้ว ส่วน WHERE นี้กันซ้ำอีกชั้นเผื่อ RLS ปิดอยู่
-- insert into predictions (user_id, match_id, predicted_home_score, predicted_away_score)
-- select $1, $2, $3, $4
-- where (select kickoff_at from matches where id = $2) > now()
-- on conflict (user_id, match_id) do update
--   set predicted_home_score = excluded.predicted_home_score,
--       predicted_away_score = excluded.predicted_away_score,
--       updated_at = now()
-- where (select kickoff_at from matches where id = predictions.match_id) > now();

-- คิดคะแนนแบบ idempotent + per-league — รันผ่าน role pundit_service (BYPASSRLS)
-- insert into prediction_scores (league_id, prediction_id, points_awarded, scored_result_version)
-- select
--   lm.league_id,
--   p.id,
--   case
--     when p.predicted_home_score = m.home_score and p.predicted_away_score = m.away_score
--       then (l.scoring_config->>'exact')::smallint
--     when sign(p.predicted_home_score - p.predicted_away_score) = sign(m.home_score - m.away_score)
--       then (l.scoring_config->>'outcome')::smallint
--     else (l.scoring_config->>'wrong')::smallint
--   end,
--   m.result_version
-- from matches m
-- join predictions p on p.match_id = m.id
-- join league_members lm on lm.user_id = p.user_id
-- join leagues l on l.id = lm.league_id and l.season_id = m.season_id
-- where m.status = 'FINISHED'
-- on conflict (league_id, prediction_id) do update
--   set points_awarded = excluded.points_awarded,
--       scored_result_version = excluded.scored_result_version,
--       scored_at = now()
--   where prediction_scores.scored_result_version is distinct from excluded.scored_result_version;
