// พื้นหลังตกแต่งของทั้งเว็บ — วางไว้ใน layout ชั้นเดียว ครอบทุกหน้า
//
// ทำด้วย CSS gradient ล้วน ไม่ใช้ไฟล์รูป: ไม่ต้องดาวน์โหลดอะไรเพิ่ม ไม่มีภาพเบลอตอนซูม และ
// เปลี่ยนสีตามธีมอัตโนมัติเพราะอ้าง token เดียวกับทั้งแอป (--accent, --border)
//
// fixed + -z-10 + pointer-events-none = อยู่หลังทุกอย่าง เลื่อนหน้าแล้วไม่ขยับตาม และไม่ขวาง
// การคลิกของผู้ใช้ ส่วน aria-hidden บอก screen reader ให้ข้ามไปเลยเพราะไม่มีความหมายอะไร
import { CursorAura } from "./cursor-aura";

export function PageBackdrop() {
  return (
    <>
      <CursorAura />
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
      >
        {/* แสงเขียวจาง ๆ จากด้านบน ให้หน้าไม่ดูเป็นพื้นเรียบทึบ */}
        <div className="absolute inset-x-0 top-0 h-[45rem] bg-[radial-gradient(60rem_32rem_at_50%_-8rem,var(--color-accent-soft),transparent)] opacity-70" />
        {/* จุดอีกกลุ่มเยื้องไปทางขวา ทำให้ไล่สีไม่สมมาตรจนดูแบน */}
        <div className="absolute right-0 top-40 h-[35rem] w-[35rem] bg-[radial-gradient(20rem_20rem_at_70%_30%,var(--color-accent-soft),transparent)] opacity-50" />
        {/* ตารางจุดบาง ๆ ให้พื้นหลังมีเท็กซ์เจอร์ ไม่โล่ง */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,var(--color-border)_1px,transparent_0)] [background-size:26px_26px] opacity-50" />
        {/* ไล่จางลงล่าง ไม่ให้ลายจุดวิ่งยาวจนรบกวนสายตาตอนอ่านเนื้อหา */}
        <div className="absolute inset-x-0 bottom-0 h-[30rem] bg-gradient-to-t from-background to-transparent" />
      </div>
    </>
  );
}
