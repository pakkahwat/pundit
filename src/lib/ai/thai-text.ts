// ตรวจว่าข้อความ "เป็นภาษาไทย" พอที่จะโชว์ให้ผู้เล่นอ่านไหม — ใช้กับ reasoning ของ AI
//
// ที่มา: Qwen (นินจา) เผลอเขียนเหตุผลเป็นจีน/อังกฤษทั้งย่อหน้าทั้งที่ schema บอกว่าให้เป็นไทย
// (ดูคอมเมนต์ใน llm.ts) กติกาตรงนี้จงใจหลวม: ชื่อทีมในข้อมูลเป็นอังกฤษอยู่แล้ว ("Liverpool FC")
// ประโยคไทยที่มีชื่อทีมอังกฤษปนต้องผ่าน แต่ย่อหน้าอังกฤษล้วนหรือมีอักษรจีน/ญี่ปุ่น/เกาหลี/
// ซีริลลิก/อาหรับต้องตก — ของจริงที่เจอใน log: "ผลงาน近期", "ทีม хозяต", "เปิด 시즌", "Atlético مدريد"
// แทรกกลางประโยคไทย (code-switching ของ Qwen) ซึ่งสัดส่วนอักษรไทยยังสูงแต่อ่านไม่รู้เรื่อง
const FOREIGN_SCRIPT = /[぀-ヿ㐀-䶿一-鿿가-힯Ѐ-ӿ؀-ۿ]/;
const THAI_LETTER = /[ก-ฺเ-๎]/g;
const LATIN_LETTER = /[A-Za-z]/g;

// ต้องมีอักษรไทยอย่างน้อยเท่านี้ — กันเคส "Real Racing Club de Santander ชนะ" ที่ไทยแค่ 3 ตัว
// แต่จริง ๆ คือเหตุผลสั้นเกินไป ไม่ใช่ภาษาผิด (เหตุผลจริงยาวกว่านี้เสมอ)
const MIN_THAI_LETTERS = 10;
const MIN_THAI_RATIO = 0.3;

export function isThaiText(text: string | null | undefined): boolean {
  if (!text) return false;
  if (FOREIGN_SCRIPT.test(text)) return false;
  const thai = text.match(THAI_LETTER)?.length ?? 0;
  const latin = text.match(LATIN_LETTER)?.length ?? 0;
  if (thai < MIN_THAI_LETTERS) return false;
  return thai / (thai + latin) >= MIN_THAI_RATIO;
}
