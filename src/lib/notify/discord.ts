// ส่งข้อความเข้า Discord ผ่าน incoming webhook
//
// URL ของ webhook มาจาก leagues.discord_webhook_url ที่เจ้าของลีกตั้งเอง ไม่ได้อยู่ใน env
// เพราะเป็นข้อมูลของผู้ใช้แต่ละกลุ่ม ไม่ใช่ความลับของแอป — แต่ยังต้องระวัง: ใครถือ URL นี้
// ก็โพสต์เข้าห้องเขาได้ จึงห้ามส่งค่านี้ออกไปฝั่ง browser ให้ใครนอกจากเจ้าของลีกเห็น

const DISCORD_HOST_SUFFIXES = ['discord.com', 'discordapp.com'];

// ตรวจว่า URL ที่ผู้ใช้กรอกเป็น webhook ของ Discord จริง
//
// นี่ไม่ใช่แค่การกันพิมพ์ผิด แต่กัน SSRF ด้วย: ถ้าปล่อยให้ใส่ URL อะไรก็ได้ ผู้ใช้จะสั่งให้
// server ของเรายิง POST ไปที่ไหนก็ได้ รวมถึงที่อยู่ภายในเครือข่ายที่คนนอกยิงเองไม่ถึง
export function isValidDiscordWebhook(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:') return false;
  const host = url.hostname.toLowerCase();
  // เทียบแบบ "เท่ากับ" หรือ "ลงท้ายด้วย .โดเมน" — ไม่ใช้ includes() เพราะโดเมนอย่าง
  // discord.com.evil.example จะผ่านได้
  const hostOk = DISCORD_HOST_SUFFIXES.some((d) => host === d || host.endsWith(`.${d}`));
  if (!hostOk) return false;
  return url.pathname.startsWith('/api/webhooks/');
}

export type DiscordMessage = {
  content?: string;
  embeds?: {
    title?: string;
    description?: string;
    color?: number;
    fields?: { name: string; value: string; inline?: boolean }[];
    footer?: { text: string };
  }[];
};

export async function postToDiscord(webhookUrl: string, message: DiscordMessage): Promise<void> {
  if (!isValidDiscordWebhook(webhookUrl)) {
    throw new Error('webhook URL ไม่ใช่ของ Discord');
  }

  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(message),
    // ตั้ง timeout เองเพราะงานนี้รันใน serverless function ที่มีเพดาน 60 วิ ถ้า Discord ค้าง
    // เราต้องยอมแพ้ก่อนที่ทั้ง job จะโดนตัด ไม่งั้นการแจ้งเตือนตัวอื่นที่รอคิวอยู่จะไม่ได้ส่งเลย
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    throw new Error(`Discord ตอบ ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
}

// สีของแถบซ้ายใน embed — ใช้เขียวสนามให้เข้ากับธีมเว็บ ยกเว้นอันที่ต้องการความเร่งด่วน
export const COLOR = {
  accent: 0x22c55e,
  urgent: 0xf59e0b,
  neutral: 0x71717a,
} as const;
