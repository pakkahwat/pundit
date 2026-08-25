import { sql } from 'drizzle-orm';
import {
  pgTable,
  pgEnum,
  uuid,
  text,
  date,
  timestamp,
  boolean,
  integer,
  smallint,
  jsonb,
  uniqueIndex,
  unique,
  index,
} from 'drizzle-orm/pg-core';

// ไฟล์นี้ hand-write ให้ตรงกับ src/db/schema.sql เป๊ะ (ไม่ได้ generate จาก `drizzle-kit pull`
// เพราะ sandbox ที่ผมรันอยู่ต่อออก Neon ไม่ได้ — คุณรัน `npm run db:pull` เองในเครื่องได้ถ้าอยาก
// diff เช็คว่าตรงกับของจริงใน DB 100% ไหม)

// ========== enums ==========
export const matchStatusEnum = pgEnum('match_status', [
  'SCHEDULED',
  'TIMED',
  'POSTPONED',
  'SUSPENDED',
  'CANCELLED',
  'IN_PLAY',
  'PAUSED',
  'FINISHED',
  'AWARDED',
]);

export const playerKindEnum = pgEnum('player_kind', ['human', 'ai']);
export const leagueRoleEnum = pgEnum('league_role', ['owner', 'member']);
export const predictionOutcomeEnum = pgEnum('prediction_outcome', ['HOME', 'DRAW', 'AWAY']);

// ========== auth (Auth.js DrizzleAdapter shape) ==========
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name'),
  // ชื่อที่ผู้ใช้ตั้งเอง — แยกจาก name เพื่อไม่ให้ Auth.js เขียนทับ (ดูคอมเมนต์ schema.sql)
  displayName: text('display_name'),
  email: text('email').unique(),
  emailVerified: timestamp('email_verified', { withTimezone: true }),
  image: text('image'),
  playerKind: playerKindEnum('player_kind').notNull().default('human'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const accounts = pgTable(
  'accounts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    provider: text('provider').notNull(),
    providerAccountId: text('provider_account_id').notNull(),
    refresh_token: text('refresh_token'),
    access_token: text('access_token'),
    // @auth/drizzle-adapter คาดหวัง expires_at เป็น PgInteger ใน type ของมัน แม้ DB column จริง
    // จะเป็น bigint ก็ตาม (ตาม official schema ของ Auth.js) — ใช้ integer() ที่นี่แค่เพื่อให้ตรง
    // กับ adapter type เท่านั้น ไม่กระทบข้อมูลจริงเพราะ unix timestamp วินาทียังพอดีกับ int4 อยู่
    expires_at: integer('expires_at'),
    id_token: text('id_token'),
    scope: text('scope'),
    session_state: text('session_state'),
    token_type: text('token_type'),
  },
  (table) => [
    uniqueIndex('accounts_provider_provider_account_id_key').on(
      table.provider,
      table.providerAccountId,
    ),
  ],
);

// session_token เป็น primary key ตรง ๆ ตามที่ @auth/drizzle-adapter คาดหวัง (ดูคอมเมนต์ใน schema.sql)
export const sessions = pgTable('sessions', {
  sessionToken: text('session_token').primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expires: timestamp('expires', { withTimezone: true }).notNull(),
});

export const verificationTokens = pgTable(
  'verification_tokens',
  {
    identifier: text('identifier').notNull(),
    token: text('token').notNull(),
    expires: timestamp('expires', { withTimezone: true }).notNull(),
  },
  (table) => [{ pk: [table.identifier, table.token] }],
);

// ========== AI players ==========
export const aiAgents = pgTable('ai_agents', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: 'cascade' }),
  agentKey: text('agent_key').notNull().unique(),
  displayName: text('display_name').notNull(),
  provider: text('provider'),
  modelId: text('model_id'),
  strategy: text('strategy').notNull().default('llm'),
  systemPrompt: text('system_prompt'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ========== football data ==========
export const seasons = pgTable(
  'seasons',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    externalCompetitionId: integer('external_competition_id').notNull(),
    competitionCode: text('competition_code').notNull(),
    name: text('name').notNull(),
    year: integer('year').notNull(),
    currentMatchday: integer('current_matchday'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('seasons_competition_code_year_key').on(table.competitionCode, table.year)],
);

export const teams = pgTable('teams', {
  id: uuid('id').primaryKey().defaultRandom(),
  externalId: integer('external_id').notNull().unique(),
  name: text('name').notNull(),
  shortName: text('short_name'),
  tla: text('tla'),
  crestUrl: text('crest_url'),
});

export const matches = pgTable(
  'matches',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    externalId: integer('external_id').notNull().unique(),
    seasonId: uuid('season_id')
      .notNull()
      .references(() => seasons.id),
    matchday: integer('matchday').notNull(),
    homeTeamId: uuid('home_team_id')
      .notNull()
      .references(() => teams.id),
    awayTeamId: uuid('away_team_id')
      .notNull()
      .references(() => teams.id),
    kickoffAt: timestamp('kickoff_at', { withTimezone: true }).notNull(),
    status: matchStatusEnum('status').notNull().default('SCHEDULED'),
    homeScore: integer('home_score'),
    awayScore: integer('away_score'),
    resultVersion: integer('result_version').notNull().default(0),
    lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('matches_season_matchday_idx').on(table.seasonId, table.matchday),
    index('matches_kickoff_idx').on(table.kickoffAt),
  ],
);

// ========== leagues ==========
export const leagues = pgTable('leagues', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  seasonId: uuid('season_id')
    .notNull()
    .references(() => seasons.id),
  createdBy: uuid('created_by')
    .notNull()
    .references(() => users.id),
  inviteCode: text('invite_code')
    .notNull()
    .unique()
    .default(sql`replace(gen_random_uuid()::text, '-', '')`),
  scoringConfig: jsonb('scoring_config')
    .notNull()
    .default(sql`'{"correct":3,"wrong":0}'::jsonb`),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  discordWebhookUrl: text('discord_webhook_url'),
});

export const leagueMembers = pgTable(
  'league_members',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    leagueId: uuid('league_id')
      .notNull()
      .references(() => leagues.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: leagueRoleEnum('role').notNull().default('member'),
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('league_members_league_id_user_id_key').on(table.leagueId, table.userId)],
);

// ========== predictions ==========
export const predictions = pgTable(
  'predictions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    matchId: uuid('match_id')
      .notNull()
      .references(() => matches.id, { onDelete: 'cascade' }),
    predictedOutcome: predictionOutcomeEnum('predicted_outcome').notNull(),
    submittedAt: timestamp('submitted_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('predictions_user_id_match_id_key').on(table.userId, table.matchId),
    index('predictions_match_idx').on(table.matchId),
  ],
);

// ========== per-league scoring ==========
export const predictionScores = pgTable(
  'prediction_scores',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    leagueId: uuid('league_id')
      .notNull()
      .references(() => leagues.id, { onDelete: 'cascade' }),
    predictionId: uuid('prediction_id')
      .notNull()
      .references(() => predictions.id, { onDelete: 'cascade' }),
    pointsAwarded: smallint('points_awarded').notNull(),
    scoredResultVersion: integer('scored_result_version').notNull(),
    scoredAt: timestamp('scored_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('prediction_scores_league_id_prediction_id_key').on(table.leagueId, table.predictionId)],
);

// ========== AI observability ==========
export const aiPredictionLogs = pgTable(
  'ai_prediction_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    aiAgentId: uuid('ai_agent_id')
      .notNull()
      .references(() => aiAgents.id, { onDelete: 'cascade' }),
    matchId: uuid('match_id')
      .notNull()
      .references(() => matches.id, { onDelete: 'cascade' }),
    predictionId: uuid('prediction_id').references(() => predictions.id),
    modelId: text('model_id'),
    contextSnapshot: jsonb('context_snapshot').notNull(),
    prompt: text('prompt').notNull(),
    rawResponse: text('raw_response'),
    parsedHomeScore: smallint('parsed_home_score'),
    parsedAwayScore: smallint('parsed_away_score'),
    parseSucceeded: boolean('parse_succeeded').notNull().default(false),
    latencyMs: integer('latency_ms'),
    error: text('error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('ai_prediction_logs_match_idx').on(table.matchId)],
);

// ========== บทความข่าวที่ AI เขียน ==========
export const articles = pgTable(
  'articles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    seasonId: uuid('season_id')
      .notNull()
      .references(() => seasons.id, { onDelete: 'cascade' }),
    publishedOn: date('published_on').notNull(),
    title: text('title').notNull(),
    body: text('body').notNull(),
    coverImageUrls: text('cover_image_urls').array().notNull().default([]),
    modelId: text('model_id'),
    sourceSnapshot: jsonb('source_snapshot').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('articles_season_id_published_on_key').on(table.seasonId, table.publishedOn),
    index('articles_published_idx').on(table.publishedOn),
  ],
);

// ========== ops / caching ==========
export const apiCache = pgTable('api_cache', {
  cacheKey: text('cache_key').primaryKey(),
  payload: jsonb('payload').notNull(),
  fetchedAt: timestamp('fetched_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
});

// กันการโพสต์ข้อความเดิมซ้ำเข้ากลุ่ม — unique (league_id, kind, ref) เป็นตัวบังคับจริง
export const notificationsSent = pgTable(
  'notifications_sent',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    leagueId: uuid('league_id')
      .notNull()
      .references(() => leagues.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    ref: text('ref').notNull(),
    sentAt: timestamp('sent_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique().on(t.leagueId, t.kind, t.ref)],
);

export const cronRuns = pgTable('cron_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  jobName: text('job_name').notNull(),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
  status: text('status'),
  processedCount: integer('processed_count'),
  error: text('error'),
});
