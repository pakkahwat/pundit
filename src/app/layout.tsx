import type { Metadata } from 'next';
import { IBM_Plex_Sans_Thai, Kanit } from 'next/font/google';

import { PageBackdrop } from '@/components/page-backdrop';
import { SiteHeader } from '@/components/site-header';

import './globals.css';

// ฟอนต์ทั้งคู่รองรับทั้งไทยและ Latin ในตระกูลเดียว — สำคัญมากเพราะหน้าเว็บนี้ปนกันตลอด
// (ชื่อทีมอังกฤษ + ข้อความไทย + ตัวเลข) ถ้าใช้ฟอนต์ที่ไม่มีอักขระไทย เบราว์เซอร์จะ fallback ไป
// ฟอนต์ระบบเฉพาะส่วนไทย ทำให้ความหนาและความสูงตัวอักษรไม่เท่ากันในบรรทัดเดียว ดูไม่เรียบร้อย
// (เดิมใช้ Geist ซึ่งไม่มีอักขระไทยเลย ข้อความไทยทั้งเว็บจึงเป็นฟอนต์ระบบของแต่ละเครื่อง)
const ibmPlexSansThai = IBM_Plex_Sans_Thai({
  variable: '--font-sans-thai',
  subsets: ['thai', 'latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
});

// Kanit ใช้เฉพาะหัวข้อ ให้ความรู้สึกสปอร์ต/แข็งแรงเข้ากับธีมฟุตบอล แต่ไม่เหมาะกับเนื้อหายาว ๆ
// เลยโหลดแค่ 2 น้ำหนักพอ ไม่เปลืองแบนด์วิดท์
// ตั้งชื่อตัวแปรว่า --font-kanit ไม่ใช่ --font-display เพราะ --font-display เป็นชื่อ theme key
// ของ Tailwind เองอยู่แล้ว ถ้าใช้ชื่อซ้ำจะกลายเป็น --font-display: var(--font-display) ที่อ้างถึง
// ตัวเอง แล้วฟอนต์จะไม่ถูกใช้เลยโดยไม่มี error อะไรฟ้อง
const kanit = Kanit({
  variable: '--font-kanit',
  subsets: ['thai', 'latin'],
  weight: ['500', '600'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Pundit — ทายผลพรีเมียร์ลีก',
  description: 'ลีกทายผลฟุตบอลกับเพื่อน แข่งกับ AI ตลอดฤดูกาล',
};

// scrollbar-width / scrollbar-color เป็น property ที่ถ่ายทอดลงลูกหลานทั้งหมด ตั้งที่ <html>
// ที่เดียวจึงมีผลกับทุกกล่องที่เลื่อนได้ในแอป (dialog, ตารางที่กว้างเกินจอ, ตัวหน้าเว็บเอง)
// ไม่ต้องไล่ใส่ทีละที่ — ค่า default ของ Windows เป็นแถบสีขาวจ้าซึ่งตัดกับธีมมืดมาก
export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html
      lang="th"
      className={`${ibmPlexSansThai.variable} ${kanit.variable} h-full antialiased [scrollbar-color:var(--color-border)_transparent] [scrollbar-width:thin]`}
    >
      {/* leading-[1.7] และ [line-break:loose] เป็นค่าสำหรับภาษาไทยโดยเฉพาะ — สระบน/ล่างของไทย
          ซ้อนกันได้หลายชั้นจนชนบรรทัดถัดไปถ้าใช้ line-height ปกติ และภาษาไทยไม่มีช่องว่างระหว่างคำ
          เบราว์เซอร์เลยตัดบรรทัดกลางคำได้ line-break: loose ช่วยให้ตัดตามหลักภาษามากขึ้น
          (Tailwind ไม่มี utility สำเร็จรูปสำหรับ line-break เลยใช้ arbitrary property syntax) */}
      <body className="flex min-h-full flex-col bg-background font-sans leading-[1.7] text-foreground [line-break:loose]">
        <PageBackdrop />
        <SiteHeader />
        {children}
      </body>
    </html>
  );
}
