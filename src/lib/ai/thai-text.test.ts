import test from "node:test";
import assert from "node:assert/strict";

import { isThaiText } from "./thai-text";

test("ไทยปนชื่อทีมอังกฤษผ่าน", () => {
  assert.equal(
    isThaiText("Liverpool มีฟอร์มดีกว่าและอยู่ในอันดับสูงกว่า Fulham ที่แพ้ต่อเนื่องและอยู่ในตำแหน่งล่างสุด"),
    true,
  );
  assert.equal(isThaiText("เจ้าบ้านฟอร์มดี 3 นัดติด (W W W) ส่วน Getafe CF แพ้ 2 นัดหลัง"), true);
});

test("อังกฤษล้วน / จีน / ว่าง / ไทยสั้นเกิน ตก", () => {
  assert.equal(
    isThaiText(
      "AFC Bournemouth currently sits in 15th place with only 2 points from 3 matches, indicating a poor start.",
    ),
    false,
  );
  assert.equal(isThaiText("数据分析显示 Fulham 表现更优。基于相对状态优势，预测 Fulham 不败。"), false);
  assert.equal(isThaiText("อ้างอิง Bet365 等主流机构 ทีมเหย้าเหนือกว่าชัดเจนในทุกด้าน"), false);
  assert.equal(isThaiText(""), false);
  assert.equal(isThaiText(null), false);
  assert.equal(isThaiText("Real Racing Club de Santander ชนะ"), false);
});

test("ไทยเกือบทั้งย่อหน้าแต่มีคำภาษาอื่นแทรก (code-switching) ตก", () => {
  assert.equal(
    isThaiText("Leeds ได้เปรียบผลงาน近期และความมั่นใจสูงกว่าจากชัยชนะเกมล่าสุด ซึ่งอาจส่งผลให้ทีมเหย้าได้เปรียบเล็กน้อย"),
    false,
  );
  assert.equal(
    isThaiText("ทีมเยือนจึงมีศักยภาพการชนะสูงกว่าเล็กน้อยในช่วงเปิด 시즌 แม้จะเป็นทีมเยือนก็ตาม"),
    false,
  );
  assert.equal(
    isThaiText("ในด้านฟอร์มล่าสุด Atlético مدريد มีดีกรีความนิ่งและการสร้างจังหวะทำประตูที่ดี"),
    false,
  );
  assert.equal(
    isThaiText("ซึ่งอาจส่งผลให้ทีม хозяต มีความได้เปรียบเล็กน้อยในแมตช์นี้ จากฟอร์มที่ดีกว่า"),
    false,
  );
});

test("อังกฤษยาวแต่มีไทยแทรกนิดเดียว ตก", () => {
  const text =
    "Brentford is performing significantly better, sitting in 5th place with a positive goal difference and strong momentum. ทีมเยือนน่าจะเหนือกว่า";
  assert.equal(isThaiText(text), false);
});
