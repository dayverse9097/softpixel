import { useId, useMemo } from 'react';

const PALETTE: Array<[string, string]> = [
  ['#4c1d95', '#0891b2'],
  ['#1e1b6b', '#7c3aed'],
  ['#064e5b', '#6d28d9'],
  ['#7c1d6f', '#2563eb'],
  ['#0f3d5e', '#9333ea'],
  ['#312e81', '#0e7490'],
];

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Cover art for games that have no uploaded image. The same slug always gives the same picture. */
export function PlaceholderArt({ seed }: { seed: string }) {
  const id = useId();
  const art = useMemo(() => {
    const h = hash(seed);
    const [from, to] = PALETTE[h % PALETTE.length] as [string, string];
    const unit = (shift: number) => ((h >>> shift) & 255) / 255;
    const rings = [0, 1, 2].map((i) => ({
      cx: 40 + unit(i * 5) * 240,
      cy: 30 + unit(i * 5 + 3) * 140,
      r: 18 + unit(i * 7 + 1) * 46,
      dot: i === 0,
    }));
    return { from, to, rings };
  }, [seed]);

  return (
    <svg viewBox="0 0 320 200" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false" className="h-full w-full">
      <defs>
        <linearGradient id={`${id}-bg`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={art.from} />
          <stop offset="1" stopColor={art.to} />
        </linearGradient>
        <radialGradient id={`${id}-glow`} cx=".25" cy=".15" r=".9">
          <stop offset="0" stopColor="#fff" stopOpacity=".3" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="320" height="200" fill={`url(#${id}-bg)`} />
      <rect width="320" height="200" fill={`url(#${id}-glow)`} />
      {art.rings.map((ring, i) => (
        <g key={i}>
          <circle cx={ring.cx} cy={ring.cy} r={ring.r} fill="none" stroke="#fff" strokeOpacity={0.25} strokeWidth="3" />
          <circle cx={ring.cx} cy={ring.cy} r={ring.dot ? 12 : ring.r / 3} fill={ring.dot ? '#fff' : '#29e1ff'} fillOpacity={ring.dot ? 0.9 : 0.55} />
        </g>
      ))}
    </svg>
  );
}
