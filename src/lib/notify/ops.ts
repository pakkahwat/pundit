import type postgres from 'postgres';

import { COLOR, isValidDiscordWebhook, postToDiscord, type DiscordMessage } from './discord';

// ── แจ้งเตือน "ระบบพังเงียบ" เข้า Discord ของผู้ดูแล ─────────────────────────────
//
// ทุกอย่างที่หน้า /admin โชว์ (cron พัง, sync ไม่เดิน, AI โดนวงจรตัด) เคยถูกปล่อยไว้เป็นวัน ๆ
// เพราะไม่มีใครเปิดหน้านั้นดู — ตัวนี้ยิงเข้าช่องส่วนตัวแทน (OPS_DISCORD_WEBHOOK_URL ใน env
// ไม่ใช่ webhook ของลีก) แล้วบอกอีกครั้งตอนกลับมาปกติ
//
// กันสแปมด้วยตาราง ops_alerts ที่จำ "สถานะล่าสุดของแต่ละเรื่อง": ส่งเฉพาะตอนสถานะเปลี่ยน
// งานที่พังทุก 15 นาทีจึงได้ข้อความเดียวตอนเริ่มพังและอีกข้อความตอนหาย ไม่ใช่ 96 ข้อความต่อวัน
//
// ห้ามให้ตัวนี้ทำงานหลักพัง: ทุก error ข้างใน (ตารางยังไม่ถูก migrate, Discord ล่ม) ถูกกลืนแล้ว log
// แทน — การแจ้งเตือนหายไปหนึ่งรอบยังดีกว่างาน sync ไม่ได้รัน

export type OpsState = 'ok' | 'error' | 'stale' | 'down';
export type OpsTransition = 'alert' | 'recovered' | 'record' | 'none';

/**
 * ตัดสินจากสถานะก่อนหน้า (null = ไม่เคยบันทึก) ว่ารอบนี้ต้องทำอะไร
 * - alert     : เพิ่งเปลี่ยนเป็นไม่ปกติ (หรือเปลี่ยนชนิดของความไม่ปกติ)
 * - recovered : กลับมาปกติหลังจากเคยไม่ปกติ
 * - record    : ปกติตั้งแต่แรก แค่บันทึกไว้ ไม่ต้องส่ง
 * - none      : สถานะเดิม ไม่ทำอะไร
 */
export function opsTransition(prev: OpsState | null, next: OpsState): OpsTransition {
  if (prev === next) return 'none';
  if (next === 'ok') return prev === null ? 'record' : 'recovered';
  return 'alert';
}

// คีย์เป็น "<ชนิด>:<ชื่อ>" เช่น cron:sync_results, stale:run_ai_predictions, agent:mistral-small
function describeKey(key: string): string {
  const [kind, name] = key.split(':', 2);
  switch (kind) {
    case 'cron':
      return `งาน cron "${name}"`;
    case 'stale':
      return `งาน "${name}" ไม่ได้รันสำเร็จมานาน`;
    case 'agent':
      return `ผู้เล่น AI "${name}"`;
    case 'articles':
      return 'การเขียนบทความ (คอลัมน์/พรีวิว)';
    case 'stage':
      return `โปรแกรมแข่งของลีก "${name}" มีเลขแมตช์เดย์ซ้ำข้ามรอบ`;
    default:
      return key;
  }
}

function buildMessage(
  key: string,
  state: OpsState,
  detail: string | null,
  transition: OpsTransition,
): DiscordMessage {
  const subject = describeKey(key);
  const recovered = transition === 'recovered';
  return {
    embeds: [
      {
        title: recovered ? `🟢 กลับมาปกติ — ${subject}` : `🔴 ${subject}`,
        description: recovered
          ? 'สถานะกลับเป็นปกติแล้ว'
          : (detail ?? state).slice(0, 1500),
        color: recovered ? COLOR.accent : COLOR.danger,
        footer: { text: 'Pundit ops · รายละเอียดเต็มที่หน้า /admin' },
      },
    ],
  };
}

/**
 * รายงานสถานะของเรื่องหนึ่ง — ส่ง Discord เฉพาะตอนเปลี่ยน แล้วบันทึกสถานะใหม่
 * ถ้าส่งไม่สำเร็จจะ "ไม่" บันทึก เพื่อให้รอบถัดไปลองส่งใหม่ (ไม่งั้นการแจ้งเตือนนั้นหายไปตลอดกาล)
 */
export async function reportOps(
  sql: postgres.Sql,
  key: string,
  state: OpsState,
  detail: string | null,
  log: (msg: string) => void = () => {},
): Promise<OpsTransition> {
  try {
    const [prev] = await sql<{ state: OpsState }[]>`
      select state from ops_alerts where key = ${key}
    `;
    const transition = opsTransition(prev?.state ?? null, state);
    if (transition === 'none') return transition;

    if (transition === 'alert' || transition === 'recovered') {
      const webhook = process.env.OPS_DISCORD_WEBHOOK_URL;
      if (!webhook) {
        log(`[ops] ${key} -> ${state} (ไม่ได้ตั้ง OPS_DISCORD_WEBHOOK_URL จึงไม่ได้ส่ง)`);
      } else if (!isValidDiscordWebhook(webhook)) {
        log('[ops] OPS_DISCORD_WEBHOOK_URL ไม่ใช่ webhook ของ Discord — ไม่ส่ง');
      } else {
        try {
          await postToDiscord(webhook, buildMessage(key, state, detail, transition));
          log(`[ops] ส่งแจ้งเตือน ${key} -> ${state}`);
        } catch (err) {
          log(`[ops] ส่งแจ้งเตือน ${key} ไม่สำเร็จ: ${String(err)}`);
          return 'none';
        }
      }
    }

    await sql`
      insert into ops_alerts (key, state, detail, updated_at)
      values (${key}, ${state}, ${detail}, now())
      on conflict (key) do update set
        state = excluded.state, detail = excluded.detail, updated_at = now()
    `;
    return transition;
  } catch (err) {
    // ตารางยังไม่ถูกสร้าง (ลืมรัน db:migrate-ops-alerts) หรือ DB สะดุด — ห้ามลามไปงานหลัก
    log(`[ops] บันทึกสถานะ ${key} ไม่สำเร็จ: ${String(err)}`);
    return 'none';
  }
}
