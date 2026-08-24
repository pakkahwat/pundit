import type { ReactNode } from 'react';

// เรนเดอร์เนื้อหาบทความที่ LLM เขียนมา
//
// ตั้งใจไม่ใช้ dangerouslySetInnerHTML และไม่ลงไลบรารี markdown เต็มรูปแบบ เพราะเนื้อหานี้มาจาก
// โมเดลภาษา ซึ่งถือเป็น untrusted input — ถ้าแปลงเป็น HTML ดิบจะเปิดช่อง XSS ทันทีถ้าโมเดลถูกชักจูง
// ให้แทรกแท็กลงมา (prompt injection ผ่านข้อมูลใน DB ก็เป็นไปได้ เช่นชื่อผู้ใช้ที่ตั้งเอง)
// ที่นี่แยกเป็นย่อหน้าและจับ **ตัวหนา** เองแล้วสร้างเป็น React element ซึ่ง React escape ให้อัตโนมัติ
// ครอบคลุมพอสำหรับความเรียง 3-5 ย่อหน้าที่เราสั่งให้โมเดลเขียน (ห้ามใช้ bullet point อยู่แล้ว)
function renderInline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') && part.length > 4 ? (
      <strong key={i} className="font-semibold text-foreground">
        {part.slice(2, -2)}
      </strong>
    ) : (
      part
    ),
  );
}

export function ArticleBody({ body }: { body: string }) {
  const paragraphs = body
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  return (
    <div className="flex flex-col gap-4">
      {paragraphs.map((p, i) => {
        // เผื่อโมเดลใส่หัวข้อ markdown มาแม้จะสั่งห้ามไว้ — แสดงเป็นหัวข้อย่อยแทนที่จะโชว์ # ดิบ ๆ
        const heading = p.match(/^#{1,6}\s+(.*)$/);
        if (heading) {
          return (
            <h2 key={i} className="font-display text-lg font-semibold text-foreground">
              {renderInline(heading[1])}
            </h2>
          );
        }
        return (
          <p key={i} className="leading-relaxed text-foreground/90">
            {renderInline(p)}
          </p>
        );
      })}
    </div>
  );
}
