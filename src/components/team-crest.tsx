import Image from 'next/image';

// โลโก้ทีมขนาดเล็กสำหรับใช้ในรายการแมตช์ — รวมไว้ที่เดียวเพราะมีที่ใช้หลายหน้า
// (โปรแกรมแข่งของทีม, สถิติเจอกัน, หน้าทายผล, หน้าคำทายทุกคน) และทุกที่ต้องจัดการเคสเดียวกันหมด
//
// unoptimized: โลโก้จาก football-data.org หลายทีมเป็นไฟล์ SVG ซึ่ง next/image ปรับขนาดให้ไม่ได้
// อยู่แล้ว และไฟล์พวกนี้เล็กมาก (ไม่กี่ KB) การส่งผ่าน optimizer จึงมีแต่เสียเวลากับเปลืองโควตา
//
// alt="" ตั้งใจให้ว่าง เพราะชื่อทีมเป็นข้อความอยู่ข้าง ๆ อยู่แล้ว ถ้าใส่ชื่อทีมซ้ำใน alt
// โปรแกรมอ่านหน้าจอจะอ่านชื่อทีมสองรอบติดกัน
export function TeamCrest({
  src,
  size = 20,
  className = '',
}: {
  src: string | null | undefined;
  size?: number;
  className?: string;
}) {
  // จองพื้นที่ไว้เท่าเดิมแม้ไม่มีรูป เพื่อให้ชื่อทีมในแต่ละแถวเรียงตรงกันเสมอ
  if (!src) {
    return <span aria-hidden className={`inline-block shrink-0 ${className}`} style={{ width: size, height: size }} />;
  }

  return (
    <Image
      src={src}
      alt=""
      width={size}
      height={size}
      className={`shrink-0 object-contain ${className}`}
      style={{ width: size, height: size }}
      unoptimized
    />
  );
}
