// รายการลีกที่ระบบรองรับ — รหัสเป็นของ football-data.org (แผนฟรีให้ 12 ลีก)
//
// ที่นี่คือแหล่งความจริงเดียวว่าระบบรู้จักลีกอะไรบ้าง ทั้งตอน sync ข้อมูล ตอนให้เลือกในหน้าสร้างลีก
// และตอนสลับดูตารางคะแนน — เพิ่มลีกใหม่แก้ที่ไฟล์นี้ไฟล์เดียวแล้วรัน sync
//
// ข้อควรระวังเรื่องโควตา: แผนฟรีจำกัด 10 requests/นาที และการ sync แต่ละลีกใช้ 3 requests
// (competition + teams + matches) เพิ่มลีกเยอะ ๆ ต้องเผื่อเวลาระหว่างลีกด้วย (sync-fixtures
// หน่วงเวลาให้อยู่แล้ว)
export type CompetitionConfig = {
  code: string;
  name: string; // ชื่อไทยที่แสดงในแอป
  shortName: string;
};

export const COMPETITIONS: CompetitionConfig[] = [
  { code: 'PL', name: 'พรีเมียร์ลีก อังกฤษ', shortName: 'พรีเมียร์ลีก' },
  { code: 'PD', name: 'ลาลีกา สเปน', shortName: 'ลาลีกา' },
];

// ลีกอื่นในแผนฟรีที่เพิ่มได้ทีหลัง (แค่ย้ายมาใส่ COMPETITIONS ข้างบนแล้ว sync):
//   BL1 บุนเดสลีกา · SA เซเรียอา · FL1 ลีกเอิง · DED เอเรอดีวีซี · PPL โปรตุเกส
//   ELC แชมเปียนชิพ · CL แชมเปียนส์ลีก · BSA บราซิล เซเรียอา

export function competitionByCode(code: string): CompetitionConfig | undefined {
  return COMPETITIONS.find((c) => c.code === code);
}

// ชื่อไทยของลีก ถ้าไม่รู้จักก็คืนชื่อที่ API ให้มาแทน (กันหน้าเว็บพังเวลามีข้อมูลลีกเก่าค้างใน DB)
export function competitionLabel(code: string, fallback: string): string {
  return competitionByCode(code)?.name ?? fallback;
}
