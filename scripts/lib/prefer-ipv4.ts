import dns from 'node:dns';

// บังคับให้ Node เลือก IPv4 ก่อน IPv6 เวลา resolve ชื่อโดเมน
//
// ทำไมต้องมี: บางเครือข่าย (โดยเฉพาะ ISP บ้านในไทยหลายเจ้า) แจก IPv6 มาให้แต่เส้นทางใช้งานจริง
// เสีย — TCP handshake ผ่าน แต่พอส่งข้อมูลจริงกลับเงียบหายจน timeout (ปัญหา MTU / IPv6 black hole)
// ค่าเริ่มต้นของ Node 18+ คือ 'verbatim' ซึ่งเชื่อลำดับที่ OS ให้มา และ Windows มักให้ IPv6 มาก่อน
// เลยไปติดเส้นทางที่เสียทุกครั้ง อาการที่เห็นคือ fetch ค้างยาวโดยไม่มี error อะไรเลย
//
// ผลข้างเคียงแทบไม่มี เพราะบริการที่เราเรียก (Google, football-data.org, Neon) มี IPv4 ครบทุกเจ้า
// ไฟล์นี้ import แล้วทำงานทันทีเป็น side effect — ต้อง import เป็นบรรทัดแรกก่อน module อื่นที่ใช้เน็ต
dns.setDefaultResultOrder('ipv4first');
