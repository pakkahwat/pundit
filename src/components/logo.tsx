// โลโก้เป็น inline SVG ไม่ใช่ไฟล์รูป — คมทุกขนาดหน้าจอ ไฟล์เล็กกว่ารูป raster หลายสิบเท่า
// และเปลี่ยนสีตามธีมได้เอง (ใช้ currentColor กับ token ของแอป) ซึ่งรูป .png ทำไม่ได้เลย
//
// รูปคือลูกฟุตบอลอย่างง่าย: วงกลมสีพื้น + ห้าเหลี่ยมตรงกลาง ตั้งใจตัดรายละเอียดออกให้เหลือน้อย
// ที่สุด เพราะโลโก้ต้องอ่านออกที่ขนาด 20px บนแถบหัวเว็บ ลายหนังฟุตบอลเต็ม ๆ จะกลายเป็นจุดมั่ว
export function LogoMark({ className = 'h-7 w-7' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden className={`${className} text-accent`}>
      <rect width="32" height="32" rx="9" fill="currentColor" />
      <circle cx="16" cy="16.5" r="8.5" fill="var(--color-accent-fg)" />
      <path d="M16 10.6l4.35 3.16-1.66 5.11h-5.38l-1.66-5.11L16 10.6z" fill="currentColor" />
    </svg>
  );
}

export function Logo() {
  return (
    <span className="flex items-center gap-2">
      <LogoMark />
      <span className="font-display text-lg font-semibold tracking-tight text-foreground">
        Pundit
      </span>
    </span>
  );
}
