// ลูกฟุตบอลกลิ้งบนสนามหญ้า ใช้เป็นตัวบอกว่ากำลังโหลด
//
// ทำด้วย CSS ล้วน ไม่มี JavaScript เลย เพราะตัวโหลดต้องขึ้นได้ตั้งแต่ก่อน JS ของหน้าจะโหลดเสร็จ
// (ถ้าทำด้วย JS มันจะโผล่มาช้ากว่าจังหวะที่ควรโผล่พอดี ซึ่งเป็นจังหวะที่ต้องการมันที่สุด)
//
// องศาการหมุนไม่ได้สุ่มมา: ลูกบอลรัศมี 16px กลิ้งเป็นระยะทาง 160px ต้องหมุน 160/16 = 10 เรเดียน
// ซึ่งเท่ากับราว 573 องศา ถ้าใส่ค่ามั่ว ๆ ตาจะจับได้ทันทีว่ามัน "ลื่นไถล" ไม่ใช่กลิ้งจริง
export function PitchLoader({ label = 'กำลังโหลด...' }: { label?: string }) {
  return (
    <div className="flex flex-col items-center gap-3" role="status" aria-live="polite">
      <div className="relative h-16 w-56">
        {/* สนามหญ้า — ลายทางแนวตั้งแบบรอยตัดหญ้าจริง แล้วเฟดจางที่ปลายทั้งสองข้างด้วย mask
            เพื่อไม่ให้กลายเป็นแถบทึบที่อ่านเหมือน progress bar */}
        <div
          aria-hidden
          className="absolute inset-x-0 bottom-0 h-3.5 rounded-full"
          style={{
            background:
              'repeating-linear-gradient(90deg, color-mix(in oklab, var(--accent) 22%, transparent) 0 14px, color-mix(in oklab, var(--accent) 12%, transparent) 14px 28px)',
            maskImage: 'linear-gradient(90deg, transparent, #000 12%, #000 88%, transparent)',
            WebkitMaskImage: 'linear-gradient(90deg, transparent, #000 12%, #000 88%, transparent)',
          }}
        />
        <div
          aria-hidden
          className="absolute inset-x-0 bottom-3.5 h-px"
          style={{
            background: 'color-mix(in oklab, var(--accent) 35%, transparent)',
            maskImage: 'linear-gradient(90deg, transparent, #000 12%, #000 88%, transparent)',
            WebkitMaskImage: 'linear-gradient(90deg, transparent, #000 12%, #000 88%, transparent)',
          }}
        />

        {/* เงาใต้ลูกบอล เลื่อนไปพร้อมกัน — ช่วยให้ลูกบอลดู "วางอยู่บนพื้น" ไม่ใช่ลอยอยู่หน้าพื้น */}
        <div
          aria-hidden
          className="animate-ball-roll-shadow absolute bottom-2.5 left-2.5 h-1.5 w-7 rounded-full bg-black/40 blur-[3px]"
        />

        <div className="animate-ball-roll absolute bottom-3.5 left-2 h-8 w-8">
          <svg viewBox="0 0 32 32" className="h-8 w-8" aria-hidden>
            <circle cx="16" cy="16" r="15" fill="#ffffff" stroke="#0f172a" strokeWidth="1.5" />
            {/* ห้าเหลี่ยมกลางกับรอบ ๆ — ลายหนังฟุตบอลแบบคลาสสิก */}
            <path d="M16 7l5.2 3.8-2 6.2h-6.4l-2-6.2z" fill="#0f172a" />
            <path d="M16 1.2l3 2.2-1.1 1.5h-3.8L13 3.4z" fill="#0f172a" opacity="0.85" />
            <path d="M30 15l-1 3.4-1.8-.4-1.3-4z" fill="#0f172a" opacity="0.85" />
            <path d="M2 15l4.1-1-1.3 4-1.8.4z" fill="#0f172a" opacity="0.85" />
            <path d="M10.6 29.6l1.2-3.9 2 1.2.6 3.3z" fill="#0f172a" opacity="0.85" />
            <path d="M21.4 29.6l-3.8.6.6-3.3 2-1.2z" fill="#0f172a" opacity="0.85" />
          </svg>
        </div>
      </div>

      <p className="text-sm text-muted">{label}</p>
    </div>
  );
}

// เวอร์ชันเต็มหน้าจอ สำหรับ loading.tsx ของแต่ละ route
export function PitchLoaderScreen({ label }: { label?: string }) {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-24">
      <PitchLoader label={label} />
    </main>
  );
}
