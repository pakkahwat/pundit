// ไอคอนประจำตัวของผู้เล่น AI แต่ละตัว — ใช้โลโก้จริงของเจ้าของโมเดลเมื่อหาได้
//
// ทำไมต้องมี: เดิม AI ใช้วงกลมตัวอักษรแรกของชื่อเหมือนคนทั่วไป ซึ่งพังกับชื่อไทย
// "น้องเล็ก" กับ "บิ๊กเบิ้ม" ได้ตัว น/บ ที่หน้าตาคล้ายกันมาก ส่วน "ลมกรด" กับ "ลุงสถิติ"
// ได้ ล เหมือนกันเป๊ะ กวาดตาแล้วแยกไม่ออกว่าแถวไหนของใคร
//
// เรื่องโลโก้: path ของ Gemini กับ Mistral เอามาจากชุดไอคอน Simple Icons (ตัว path data
// เป็น CC0) ลอกค่ามาแปะไว้ตรงนี้เลย ไม่ได้ผูกเป็น dependency เพิ่มเพราะใช้แค่สองอัน
// ใช้เพื่อ "บอกว่าคำทายนี้มาจากโมเดลไหน" ซึ่งเป็นการอ้างถึงตามปกติ ไม่ได้เอาไปทำเป็น
// แบรนด์ของเราเอง
//
// ส่วน GPT-OSS (ทั้ง 120B และ 20B) ไม่มีโลโก้ให้ใช้ — OpenAI ขอถอนเครื่องหมายของตัวเอง
// ออกจากชุดไอคอนสาธารณะไปแล้ว และการวาดเลียนแบบเอาเองนอกจากจะผิดที่ผิดทางยังออกมาไม่เหมือน
// จึงใช้ "เลขขนาดโมเดล" เป็นเครื่องหมายแทน ซึ่งบังเอิญอ่านง่ายกว่าโลโก้เสียอีกเพราะสองตัวนี้
// เป็นโมเดลตระกูลเดียวกัน ต่างกันแค่ขนาด — ถ้าใช้โลโก้เดียวกันทั้งคู่ก็จะแยกไม่ออกอยู่ดี
type AiLook = {
  color: string;
  /** เส้นในกรอบ 24x24 — ใช้คู่กับ path ของโลโก้ */
  glyph?: React.ReactNode;
  /** ใช้ตัวหนังสือเป็นเครื่องหมายแทนเมื่อไม่มีโลโก้ */
  text?: string;
};

// ── โลโก้จริง (viewBox 24x24 เท่ากันทุกอัน) ──────────────────────────────────
const GEMINI = (
  <path
    d="M11.04 19.32Q12 21.51 12 24q0-2.49.93-4.68.96-2.19 2.58-3.81t3.81-2.55Q21.51 12 24 12q-2.49 0-4.68-.93a12.3 12.3 0 0 1-3.81-2.58 12.3 12.3 0 0 1-2.58-3.81Q12 2.49 12 0q0 2.49-.96 4.68-.93 2.19-2.55 3.81a12.3 12.3 0 0 1-3.81 2.58Q2.49 12 0 12q2.49 0 4.68.96 2.19.93 3.81 2.55t2.55 3.81"
    fill="currentColor"
  />
);
const MISTRAL = (
  <path
    d="M17.143 3.429v3.428h-3.429v3.429h-3.428V6.857H6.857V3.43H3.43v13.714H0v3.428h10.286v-3.428H6.857v-3.429h3.429v3.429h3.429v-3.429h3.428v3.429h-3.428v3.428H24v-3.428h-3.43V3.429z"
    fill="currentColor"
  />
);

// ── เครื่องหมายที่วาดเอง (สำหรับตัวที่ไม่ใช่โมเดลของใคร) ─────────────────────
const CHART = (
  <g fill="currentColor">
    <rect x="4" y="13" width="4" height="7" rx="1" />
    <rect x="10" y="8" width="4" height="12" rx="1" />
    <rect x="16" y="4" width="4" height="16" rx="1" />
  </g>
);
const ROBOT = (
  <g fill="currentColor">
    <rect x="4" y="7" width="16" height="12" rx="3.5" />
    <circle cx="9" cy="13" r="1.8" fill="var(--color-surface)" />
    <circle cx="15" cy="13" r="1.8" fill="var(--color-surface)" />
    <rect x="11" y="2.5" width="2" height="4" rx="1" />
  </g>
);

// ผูกกับ agent_key ไม่ใช่ชื่อที่แสดง เพราะชื่อเปลี่ยนได้ตลอด (เราเพิ่งเปลี่ยนมารอบหนึ่งแล้ว)
// ส่วน agent_key เป็นตัวระบุถาวรของผู้เล่น AI แต่ละตัว
//
// สีของ Gemini/Mistral ใช้สีแบรนด์จริง ส่วนที่เหลือเลือกโทนกลาง ๆ ที่อ่านออกทั้งธีมสว่างและมืด
const LOOKS: Record<string, AiLook> = {
  'gemini-flash-lite': { color: '#8E75B2', glyph: GEMINI }, // เจ้าสายฟ้า
  'mistral-small': { color: '#FA520F', glyph: MISTRAL }, // ลมกรดฝรั่งเศส
  'groq-gpt-oss': { color: '#8b5cf6', text: '120' }, // บิ๊กเบิ้ม — GPT-OSS 120B
  'groq-gpt-oss-20b': { color: '#f43f5e', text: '20' }, // น้องเล็กหัวใจโต — GPT-OSS 20B
  'baseline-form': { color: '#3b82f6', glyph: CHART }, // ลุงสถิติ — ดูสถิติล้วน ไม่ได้ใช้ AI
};

// AI ตัวใหม่ที่ยังไม่ได้กำหนดหน้าตาไว้จะได้หุ่นยนต์ + สีที่คำนวณจากชื่อ key แบบคงที่
// (key เดิมได้สีเดิมเสมอ) ดีกว่าให้ทุกตัวที่ไม่รู้จักหน้าตาเหมือนกันหมด
const FALLBACK_COLORS = ['#10b981', '#ec4899', '#eab308', '#6366f1', '#14b8a6'];

export function aiLook(agentKey: string | null): AiLook {
  if (agentKey && LOOKS[agentKey]) return LOOKS[agentKey];
  let hash = 0;
  for (const ch of agentKey ?? '') hash = (hash * 31 + ch.charCodeAt(0)) % 9973;
  return { color: FALLBACK_COLORS[hash % FALLBACK_COLORS.length], glyph: ROBOT };
}

export function AiIcon({ agentKey, size = 28 }: { agentKey: string | null; size?: number }) {
  const { color, glyph, text } = aiLook(agentKey);
  return (
    <span
      aria-hidden
      style={{
        width: size,
        height: size,
        color,
        // พื้นเป็นสีเดียวกับเครื่องหมายแบบจาง ๆ — ใช้ชุดสีเดียวได้ทั้งธีมสว่างและมืด
        // ไม่ต้องมีค่าสีแยกสองชุดต่อธีม
        background: `color-mix(in oklab, ${color} 20%, transparent)`,
      }}
      className="flex shrink-0 items-center justify-center rounded-full"
    >
      {text ? (
        // ตัวเลขยาวไม่เท่ากัน ("120" กับ "20") ถ้าใช้ขนาดเดียวกันตัวที่ยาวกว่าจะล้นวงกลม
        <span
          className="font-semibold leading-none tabular-nums"
          style={{ fontSize: size * (text.length >= 3 ? 0.33 : 0.4) }}
        >
          {text}
        </span>
      ) : (
        <svg viewBox="0 0 24 24" style={{ width: size * 0.62, height: size * 0.62 }}>
          {glyph}
        </svg>
      )}
    </span>
  );
}
