'use client';

import { useRef, useState } from 'react';

export type ChartPoint = {
  matchday: number;
  human: number | null; // ความแม่นสะสม (%) ถึงแมตช์เดย์นี้ — null ถ้ายังไม่มีข้อมูล
  ai: number | null;
  humanTotal: number;
  aiTotal: number;
};

// กราฟเส้นความแม่นสะสมของคนเทียบกับ AI ตลอดฤดูกาล
//
// เลือกเป็น "เส้น" เพราะงานของข้อมูลชุดนี้คือแนวโน้มตามเวลา และเป็น 2 ชุดที่ต้องแยกกันให้ออก
// (คน / AI) จึงใช้สีเชิงหมวดหมู่ 2 สี — น้ำเงินกับส้ม ซึ่งเป็นคู่ที่ผ่านการตรวจ CVD แล้วว่า
// คนตาบอดสีแบบ protan/deutan ยังแยกออก และคอนทราสต์กับพื้นการ์ดผ่านเกณฑ์ทั้งธีมสว่างและมืด
// (ค่าสีอยู่ใน globals.css เป็น --series-human / --series-ai แยกค่าตามธีม)
//
// สีไม่ได้ทำหน้าที่คนเดียว: มีทั้งคำอธิบายสัญลักษณ์ด้านบน ป้ายชื่อติดปลายเส้น และตารางตัวเลข
// ให้กางดูได้ด้านล่าง — คนที่แยกสีไม่ออกหรือใช้ screen reader จึงยังอ่านค่าได้ครบ

const W = 720;
const H = 260;
const PAD = { top: 16, right: 92, bottom: 34, left: 40 };
const PLOT_W = W - PAD.left - PAD.right;
const PLOT_H = H - PAD.top - PAD.bottom;

export function AccuracyChart({ points }: { points: ChartPoint[] }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  if (points.length < 2) return null;

  const xs = points.map((p) => p.matchday);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  // กัน division by zero ตอนมีแมตช์เดย์เดียว (ถูกกันด้วย length < 2 ข้างบนอยู่แล้ว แต่กันไว้อีกชั้น)
  const spanX = Math.max(1, maxX - minX);

  const x = (matchday: number) => PAD.left + ((matchday - minX) / spanX) * PLOT_W;
  const y = (pct: number) => PAD.top + (1 - pct / 100) * PLOT_H;

  // สร้าง path จากเฉพาะจุดที่มีค่า — ถ้าแมตช์เดย์ไหนไม่มีคำทายเลย เส้นจะข้ามไปจุดถัดไป
  const pathFor = (key: 'human' | 'ai') => {
    const valid = points.filter((p) => p[key] !== null);
    if (valid.length === 0) return '';
    return valid.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.matchday)} ${y(p[key]!)}`).join(' ');
  };

  const lastWithValue = (key: 'human' | 'ai') => {
    for (let i = points.length - 1; i >= 0; i--) {
      if (points[i][key] !== null) return points[i];
    }
    return null;
  };

  const humanEnd = lastWithValue('human');
  const aiEnd = lastWithValue('ai');
  const hovered = hoverIdx === null ? null : points[hoverIdx];

  // แปลงตำแหน่งเมาส์จริงเป็นพิกัดใน viewBox — ต้องหารด้วยอัตราส่วนที่ SVG ถูกย่อ/ขยาย
  // เพราะ SVG กว้าง 100% ของกล่อง ไม่ได้กว้าง 720px ตามที่ประกาศไว้เสมอไป
  function handleMove(e: React.MouseEvent<SVGSVGElement>) {
    const el = svgRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const vbX = ((e.clientX - rect.left) / rect.width) * W;

    let nearest = 0;
    let best = Infinity;
    points.forEach((p, i) => {
      const d = Math.abs(x(p.matchday) - vbX);
      if (d < best) {
        best = d;
        nearest = i;
      }
    });
    setHoverIdx(nearest);
  }

  const gridPcts = [0, 25, 50, 75, 100];

  return (
    <div>
      {/* คำอธิบายสัญลักษณ์ — ต้องมีเสมอเมื่อมีตั้งแต่ 2 ชุดข้อมูลขึ้นไป ตัวหนังสือใช้สีข้อความปกติ
          ไม่ใช่สีของเส้น (สีอยู่ที่จุดวงกลมข้าง ๆ) เพื่อให้อ่านง่ายในทุกธีม */}
      <div className="mb-3 flex flex-wrap items-center gap-4 text-sm">
        <span className="flex items-center gap-2 text-foreground">
          <span
            aria-hidden
            className="h-2.5 w-2.5 rounded-full"
            style={{ background: 'var(--series-human)' }}
          />
          คน
        </span>
        <span className="flex items-center gap-2 text-foreground">
          <span
            aria-hidden
            className="h-2.5 w-2.5 rounded-full"
            style={{ background: 'var(--series-ai)' }}
          />
          AI
        </span>
        <span className="text-xs text-muted">ความแม่นสะสม (%) ตามแมตช์เดย์</span>
      </div>

      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full"
        role="img"
        aria-label="กราฟเส้นเปรียบเทียบความแม่นสะสมของคนกับ AI ตามแมตช์เดย์ ค่าตัวเลขทั้งหมดอยู่ในตารางด้านล่าง"
        onMouseMove={handleMove}
        onMouseLeave={() => setHoverIdx(null)}
      >
        {/* เส้นตาราง — เส้นทึบบาง 1px สีจางกว่าพื้นหนึ่งขั้น ไม่ใช้เส้นประเพราะเส้นประอ่านเหมือน
            "ค่าคาดการณ์" หรือ "เส้นเกณฑ์" ทั้งที่มันเป็นแค่เส้นตาราง */}
        {gridPcts.map((pct) => (
          <g key={pct}>
            <line
              x1={PAD.left}
              x2={PAD.left + PLOT_W}
              y1={y(pct)}
              y2={y(pct)}
              stroke="var(--color-border)"
              strokeWidth={1}
            />
            <text
              x={PAD.left - 8}
              y={y(pct) + 4}
              textAnchor="end"
              fontSize={11}
              className="tabular-nums"
              fill="var(--color-muted)"
            >
              {pct}
            </text>
          </g>
        ))}

        {/* แกน X: ป้ายแมตช์เดย์ เว้นระยะไม่ให้ป้ายชนกันเมื่อมีจุดเยอะ */}
        {points.map((p, i) => {
          const step = Math.ceil(points.length / 8);
          if (i % step !== 0 && i !== points.length - 1) return null;
          return (
            <text
              key={p.matchday}
              x={x(p.matchday)}
              y={H - 12}
              textAnchor="middle"
              fontSize={11}
              className="tabular-nums"
              fill="var(--color-muted)"
            >
              {p.matchday}
            </text>
          );
        })}

        {/* เส้นชี้ตำแหน่งตอนเอาเมาส์ชี้ */}
        {hovered && (
          <line
            x1={x(hovered.matchday)}
            x2={x(hovered.matchday)}
            y1={PAD.top}
            y2={PAD.top + PLOT_H}
            stroke="var(--color-muted)"
            strokeWidth={1}
          />
        )}

        {/* เส้นข้อมูล 2px ปลายและมุมมน */}
        <path
          d={pathFor('human')}
          fill="none"
          stroke="var(--series-human)"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d={pathFor('ai')}
          fill="none"
          stroke="var(--series-ai)"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* จุดที่ถูกชี้อยู่ — วงแหวนสีพื้น 2px ทำให้จุดยังเห็นชัดแม้สองเส้นทับกันพอดี */}
        {hovered?.human !== null && hovered && (
          <circle
            cx={x(hovered.matchday)}
            cy={y(hovered.human!)}
            r={4.5}
            fill="var(--series-human)"
            stroke="var(--color-surface)"
            strokeWidth={2}
          />
        )}
        {hovered?.ai !== null && hovered && (
          <circle
            cx={x(hovered.matchday)}
            cy={y(hovered.ai!)}
            r={4.5}
            fill="var(--series-ai)"
            stroke="var(--color-surface)"
            strokeWidth={2}
          />
        )}

        {/* ป้ายชื่อติดปลายเส้น — ใส่เฉพาะจุดสุดท้ายเท่านั้น ไม่ใส่ตัวเลขทุกจุด */}
        {humanEnd?.human != null && (
          <>
            <circle
              cx={x(humanEnd.matchday)}
              cy={y(humanEnd.human)}
              r={4}
              fill="var(--series-human)"
              stroke="var(--color-surface)"
              strokeWidth={2}
            />
            <text
              x={x(humanEnd.matchday) + 10}
              y={y(humanEnd.human) + 4}
              fontSize={12}
              fill="var(--color-foreground)"
            >
              คน {Math.round(humanEnd.human)}%
            </text>
          </>
        )}
        {aiEnd?.ai != null && (
          <>
            <circle
              cx={x(aiEnd.matchday)}
              cy={y(aiEnd.ai)}
              r={4}
              fill="var(--series-ai)"
              stroke="var(--color-surface)"
              strokeWidth={2}
            />
            <text
              x={x(aiEnd.matchday) + 10}
              y={y(aiEnd.ai) + 4}
              fontSize={12}
              fill="var(--color-foreground)"
            >
              AI {Math.round(aiEnd.ai)}%
            </text>
          </>
        )}
      </svg>

      {/* กล่องบอกค่าตอนชี้ — อยู่นอก SVG เพื่อให้จัดข้อความด้วย CSS ได้ตามปกติ */}
      <p className="mt-2 min-h-6 text-sm text-muted">
        {hovered ? (
          <>
            <span className="text-foreground">แมตช์เดย์ {hovered.matchday}</span> · คน{' '}
            {hovered.human === null ? '—' : `${Math.round(hovered.human)}%`} · AI{' '}
            {hovered.ai === null ? '—' : `${Math.round(hovered.ai)}%`}
          </>
        ) : (
          'เอาเมาส์ชี้บนกราฟเพื่อดูค่าแต่ละแมตช์เดย์'
        )}
      </p>

      {/* ตารางตัวเลข — กางดูได้ ทำให้ทุกค่าอ่านได้โดยไม่ต้องพึ่งการชี้เมาส์หรือการแยกสี */}
      <details className="mt-3">
        <summary className="cursor-pointer text-sm text-muted transition-colors hover:text-foreground">
          ดูเป็นตารางตัวเลข
        </summary>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted">
                <th className="py-2 pr-3 font-medium">แมตช์เดย์</th>
                <th className="py-2 pr-3 text-right font-medium">คน</th>
                <th className="py-2 pr-3 text-right font-medium">AI</th>
                <th className="py-2 text-right font-medium">คำทายสะสม</th>
              </tr>
            </thead>
            <tbody>
              {points.map((p) => (
                <tr key={p.matchday} className="border-b border-border/60">
                  <td className="py-1.5 pr-3 tabular-nums text-foreground">{p.matchday}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums text-foreground">
                    {p.human === null ? '—' : `${Math.round(p.human)}%`}
                  </td>
                  <td className="py-1.5 pr-3 text-right tabular-nums text-foreground">
                    {p.ai === null ? '—' : `${Math.round(p.ai)}%`}
                  </td>
                  <td className="py-1.5 text-right tabular-nums text-muted">
                    {p.humanTotal + p.aiTotal}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
