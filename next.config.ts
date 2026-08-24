import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  images: {
    // โลโก้ทีมมาจาก football-data.org (เก็บ URL ไว้ใน teams.crest_url ตอน sync)
    // next/image บังคับให้ประกาศโดเมนภายนอกไว้ล่วงหน้า เพื่อกันไม่ให้เว็บเราถูกใช้เป็น
    // image proxy ฟรีสำหรับรูปจากที่ไหนก็ได้
    remotePatterns: [{ protocol: 'https', hostname: 'crests.football-data.org' }],
  },
};

export default nextConfig;
