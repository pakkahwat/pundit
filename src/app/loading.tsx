import { PitchLoaderScreen } from '@/components/pitch-loader';

// loading.tsx ที่ระดับ root — Next.js เอาไปห่อทุกหน้าด้วย Suspense ให้เองอัตโนมัติ
// จึงขึ้นระหว่างที่ server component ของหน้าปลายทางยังดึงข้อมูลไม่เสร็จ โดยไม่ต้องแก้หน้าไหนเลย
//
// วางไว้ที่ root อย่างเดียวก็ครอบทุกหน้า — ถ้าหน้าไหนอยากได้ตัวโหลดเฉพาะของตัวเอง
// ค่อยเพิ่ม loading.tsx ในโฟลเดอร์นั้นทับได้ทีหลัง
export default function Loading() {
  return <PitchLoaderScreen />;
}
