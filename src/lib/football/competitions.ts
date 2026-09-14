// รายการลีกที่ระบบรองรับ — รหัสเป็นของ football-data.org (แผนฟรีให้ 12 ลีก)
//
// ที่นี่คือแหล่งความจริงเดียวว่าระบบรู้จักลีกอะไรบ้าง ทั้งตอน sync ข้อมูล ตอนให้เลือกในหน้าสร้างลีก
// และตอนสลับดูตารางคะแนน — เพิ่มลีกใหม่แก้ที่ไฟล์นี้ไฟล์เดียวแล้วรัน sync
// เอาลีกออก: ลบจากลิสต์นี้ + ปิดฤดูกาลใน DB ด้วย `npm run db:season-active -- --code=XX --off`
// (งาน sync/AI/บทความ/แจ้งเตือน อ่านจาก seasons.is_active ไม่ใช่จากลิสต์นี้ — ลีกที่เคยสร้างไว้
// ยังอยู่ใน DB ครบ เปิดกลับได้ด้วย --on)
//
// ข้อควรระวังเรื่องโควตา: แผนฟรีจำกัด 10 requests/นาที และการ sync แต่ละลีกใช้ 3 requests
// (competition + teams + matches) เพิ่มลีกเยอะ ๆ ต้องเผื่อเวลาระหว่างลีกด้วย (sync-fixtures
// หน่วงเวลาให้อยู่แล้ว)
export type CompetitionConfig = {
  code: string;
  name: string; // ชื่อไทยที่แสดงในแอป
  shortName: string;
  /**
   * โซนในตารางคะแนน (อันดับที่นับจาก 1) ใช้ทาสีแถบซ้ายในตาราง — ลีกปกติ: 1-4 ไปแชมเปียนส์ลีก,
   * ท้ายตารางตกชั้น; CL รอบลีก: 1-8 เข้ารอบ 16 ทีมตรง, 9-24 เพลย์ออฟ, 25-36 ตกรอบ
   */
  zones: { top: number; topLabel: string; mid?: number; midLabel?: string; bottom: number; bottomLabel: string };
  /** จำนวนแมตช์เดย์ที่ควรมีหลัง sync ครบ — db:season-status ใช้เตือนเมื่อดึงมาไม่ครบ */
  expectedMatchdays: number;
};

export const COMPETITIONS: CompetitionConfig[] = [
  {
    code: 'PL',
    name: 'พรีเมียร์ลีก อังกฤษ',
    shortName: 'พรีเมียร์ลีก',
    zones: { top: 4, topLabel: 'แชมเปียนส์ลีก', bottom: 3, bottomLabel: 'ตกชั้น' },
    expectedMatchdays: 38,
  },
  {
    // รูปแบบใหม่ (2024/25 เป็นต้นไป): รอบลีก 36 ทีม ตารางเดียว 8 แมตช์เดย์ แล้วต่อด้วยเพลย์ออฟ +
    // น็อกเอาต์สองนัด — football-data ส่ง stage มาด้วย (LEAGUE_STAGE, PLAYOFFS, LAST_16, ...)
    // เก็บไว้ในคอลัมน์ matches.stage และแสดงเป็นป้ายรอบแทนเลขแมตช์เดย์ (ดู lib/matches/stage-label.ts)
    // ⚠️ ตอนเปิดใช้ (ก.ย. 2026) feed ยังมีแค่รอบลีก — พอโปรแกรมน็อกเอาต์โผล่ (ปลาย ม.ค.) ต้องเช็คด้วย
    // db:season-status ว่าเลขแมตช์เดย์ของรอบน็อกเอาต์ "นับต่อ" (9, 10, …) ไม่ใช่เริ่มใหม่ต่อรอบ
    // เพราะทั้งระบบใช้ (season, matchday) เป็นตัวระบุรอบ ถ้าซ้ำกันต้องแปลงตอน sync
    code: 'CL',
    name: 'ยูฟ่า แชมเปียนส์ลีก',
    shortName: 'แชมเปียนส์ลีก',
    zones: {
      top: 8,
      topLabel: 'เข้ารอบ 16 ทีม',
      mid: 24,
      midLabel: 'เพลย์ออฟ',
      bottom: 12,
      bottomLabel: 'ตกรอบ',
    },
    expectedMatchdays: 8,
  },
];

// ลีกที่เคยเปิดแล้วปิดไป: PD ลาลีกา (ปิด 14 ก.ย. 2026 เพราะไม่มีคนเล่น — ข้อมูล/ลีก/คำทายยังอยู่ใน DB)
// ลีกอื่นในแผนฟรีที่เพิ่มได้ทีหลัง (แค่เพิ่มใน COMPETITIONS ข้างบนแล้ว sync):
//   PD ลาลีกา · BL1 บุนเดสลีกา · SA เซเรียอา · FL1 ลีกเอิง · DED เอเรอดีวีซี · PPL โปรตุเกส
//   ELC แชมเปียนชิพ · BSA บราซิล เซเรียอา

// ชื่อไทยของลีกที่ปิดไปแล้ว — ยังต้องแสดงชื่อให้ถูกในสถิติ/ประวัติ/ลีกเก่า แต่ไม่อยู่ในลิสต์ที่เปิดใช้
const RETIRED_NAMES: Record<string, { name: string; shortName: string }> = {
  PD: { name: 'ลาลีกา สเปน', shortName: 'ลาลีกา' },
};

export function competitionByCode(code: string): CompetitionConfig | undefined {
  return COMPETITIONS.find((c) => c.code === code);
}

// ชื่อไทยของลีก ถ้าไม่รู้จักก็คืนชื่อที่ API ให้มาแทน (กันหน้าเว็บพังเวลามีข้อมูลลีกเก่าค้างใน DB)
export function competitionLabel(code: string, fallback: string): string {
  return competitionByCode(code)?.name ?? RETIRED_NAMES[code]?.name ?? fallback;
}

/** ชื่อสั้นสำหรับป้ายในสถิติ — รู้จักลีกที่ปิดแล้วด้วย ไม่งั้นจะโชว์รหัสดิบ "PD" */
export function competitionShortLabel(code: string): string {
  return competitionByCode(code)?.shortName ?? RETIRED_NAMES[code]?.shortName ?? code;
}
