import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  images: {
    // โลโก้ทีมมาจาก football-data.org (เก็บ URL ไว้ใน teams.crest_url ตอน sync)
    // next/image บังคับให้ประกาศโดเมนภายนอกไว้ล่วงหน้า เพื่อกันไม่ให้เว็บเราถูกใช้เป็น
    // image proxy ฟรีสำหรับรูปจากที่ไหนก็ได้
    remotePatterns: [
      { protocol: 'https', hostname: 'crests.football-data.org' },
      // รูปโปรไฟล์จากบัญชี Google — โฮสต์จริงสลับไปมาระหว่าง lh3/lh4/lh5.googleusercontent.com
      // จึงต้องใช้ ** ครอบซับโดเมน (เรนเดอร์แบบ unoptimized เบราว์เซอร์โหลดตรงจาก Google
      // เราไม่ได้เป็นตัวกลางให้รูป จึงไม่ได้เปิดช่องให้ใครเอาเว็บเราไปใช้เป็น image proxy)
      { protocol: 'https', hostname: '**.googleusercontent.com' },
    ],
  },
};

export default nextConfig;
