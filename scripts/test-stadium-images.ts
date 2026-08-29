import { fetchStadiumImage } from "@/lib/ai/article-cover-fetch";
import { stadiumPageFor, stadiumTeams } from "@/lib/football/stadiums";

// ไล่เช็คว่าหน้า Wikipedia ของสนามทุกทีมยังคืนรูปได้จริง — ชื่อหน้าในตาราง STADIUM_PAGES
// เขียนจากความรู้ ไม่ได้ยืนยันกับ Wikipedia ทีละหน้า และ Wikipedia เองก็เปลี่ยนชื่อหน้าได้
// (สนามเปลี่ยนสปอนเซอร์บ่อยมาก) หน้าที่พังไม่ทำให้ระบบพัง (ตกไปใช้แบนเนอร์โลโก้แทน)
// แต่ก็ควรรู้ว่าทีมไหนไม่มีภาพสนามให้ใช้ — รันสคริปต์นี้เช็คได้ทุกเมื่อ ไม่แตะฐานข้อมูลเลย
//
// รัน: npm run test:stadium-images

async function main() {
  let ok = 0;
  let missing = 0;

  for (const team of stadiumTeams()) {
    const image = await fetchStadiumImage(team);
    if (image) {
      ok++;
      console.log(`✔ ${team} (${stadiumPageFor(team)})`);
    } else {
      missing++;
      console.log(`✘ ${team} — หน้า "${stadiumPageFor(team)}" ไม่ให้รูป (404/เปลี่ยนชื่อ?)`);
    }
  }

  console.log(`\nได้รูป ${ok} ทีม / ไม่ได้ ${missing} ทีม`);
  if (missing > 0) {
    console.log("ทีมที่ไม่ได้รูปจะใช้แบนเนอร์โลโก้ 'เหย้า vs เยือน' แทนโดยอัตโนมัติ");
    console.log("ถ้าอยากได้ภาพสนาม แก้ชื่อหน้าใน src/lib/football/stadiums.ts");
  }
}

main().catch((err) => {
  console.error("ตรวจภาพสนามล้มเหลว:", err);
  process.exit(1);
});
