import test from "node:test";
import assert from "node:assert/strict";

import {
  extractReasoningFromLogPrompt,
  formatBaselineLogPrompt,
  formatLlmLogPrompt,
} from "./prediction-log";

test("อ่านเหตุผลกลับออกมาจาก prompt ของ agent ที่ใช้ LLM ได้", () => {
  const prompt = formatLlmLogPrompt({
    prompt: "แมตช์: Arsenal (เหย้า) พบ Chelsea (เยือน)\n\nทายผลแมตช์นี้",
    outcome: "HOME",
    reasoning: "อาร์เซนอลฟอร์มดีกว่าและได้เล่นในบ้าน",
  });

  assert.equal(
    extractReasoningFromLogPrompt(prompt),
    "อาร์เซนอลฟอร์มดีกว่าและได้เล่นในบ้าน",
  );
});

test("อ่านเหตุผลกลับออกมาจาก prompt ของ baseline ได้", () => {
  const prompt = formatBaselineLogPrompt({
    outcome: "DRAW",
    reasoning: "สูสีเกินเกณฑ์ 0.25 — เหย้า 1.60 vs เยือน 1.50",
  });

  assert.equal(
    extractReasoningFromLogPrompt(prompt),
    "สูสีเกินเกณฑ์ 0.25 — เหย้า 1.60 vs เยือน 1.50",
  );
});

test("เหตุผลที่มีเครื่องหมาย ':' อยู่ข้างในต้องไม่ถูกตัดทิ้ง", () => {
  const prompt = formatLlmLogPrompt({
    prompt: "ctx",
    outcome: "AWAY",
    reasoning: "ข้อสรุป: ทีมเยือนเหนือกว่าชัดเจน",
  });

  assert.equal(
    extractReasoningFromLogPrompt(prompt),
    "ข้อสรุป: ทีมเยือนเหนือกว่าชัดเจน",
  );
});

test("คืน null เมื่อ prompt ไม่ตรงรูปแบบ หรือไม่มีเหตุผลอยู่จริง", () => {
  assert.equal(extractReasoningFromLogPrompt(null), null);
  assert.equal(extractReasoningFromLogPrompt(""), null);
  assert.equal(extractReasoningFromLogPrompt("ข้อความมั่ว ๆ"), null);
  assert.equal(
    extractReasoningFromLogPrompt(
      formatLlmLogPrompt({ prompt: "ctx", outcome: "HOME", reasoning: "" }),
    ),
    null,
  );
});
