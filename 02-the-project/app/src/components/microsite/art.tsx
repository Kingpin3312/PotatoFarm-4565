import { useId, type ReactNode } from "react";
import type { Picture, Scene } from "@/lib/microsite/imagery";

/**
 * Drawn scenes: the microsite's picture of last resort.
 *
 * When there is no photograph to show — a property with none yet, an
 * agent who has not uploaded a cover, a community the photo pack does not
 * cover — the slot is filled with a drawing rather than a grey box: Dubai
 * at dusk, in the brand's own greys with the pink as the glow on the
 * horizon. A drawing never pretends to be a photograph of a particular
 * property, so it is honest anywhere it appears.
 *
 * Deterministic: the same seed draws the same scene, so a page does not
 * change between visits. Light: window lights are SVG patterns, not
 * thousands of rectangles, so a page of tiles stays cheap to draw.
 *
 * Colours are the scheme's — greys, near-whites and #FF1493 — because
 * `palette.py` checks this file like any other.
 */

const W = 1600, H = 1000;

function rng(seed: string) {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) { h = Math.imul(h ^ seed.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

type Tower = { x: number; w: number; top: number; cap: number; lit: number };

function skyline(r: () => number, o: { count: number; base: number; min: number; max: number; from?: number; to?: number }) {
  const out: Tower[] = [];
  const from = o.from ?? -40, to = o.to ?? W + 40;
  let x = from;
  while (x < to && out.length < o.count * 2) {
    const w = 40 + r() * 90;
    const h = o.min + r() * (o.max - o.min);
    out.push({ x, w, top: o.base - h, cap: r() < 0.35 ? 6 + r() * 24 : 0, lit: Math.floor(r() * 3) });
    x += w * (0.55 + r() * 0.7);
  }
  return out;
}

function palm(x: number, y: number, h: number, flip: boolean, fill: string) {
  const s = flip ? -1 : 1;
  const top = { x: x + s * h * 0.12, y: y - h };
  const fronds = [-1.15, -0.6, -0.1, 0.35, 0.85, 1.3].map((a, i) => {
    const len = h * (0.42 + (i % 2) * 0.08);
    const ex = top.x + Math.cos(a - Math.PI / 2) * len * (i < 3 ? -1 : 1) * 0.9;
    const ey = top.y + Math.sin(a) * len * 0.45 + len * 0.18;
    const cx = (top.x + ex) / 2, cy = Math.min(top.y, ey) - len * 0.22;
    return `M${top.x} ${top.y} Q${cx} ${cy} ${ex} ${ey} Q${cx} ${cy + len * 0.12} ${top.x} ${top.y}Z`;
  });
  return (
    <g fill={fill}>
      <path d={`M${x - 5} ${y} Q${x + s * h * 0.02} ${y - h * 0.55} ${top.x - 3} ${top.y} L${top.x + 3} ${top.y} Q${x + s * h * 0.05} ${y - h * 0.55} ${x + 5} ${y}Z`} />
      {fronds.map((d, i) => <path key={i} d={d} />)}
    </g>
  );
}

export function Art({ scene, seed, className }: { scene: Scene; seed: string; className?: string }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  const r = rng(`${scene}:${seed}`);
  const u = (n: string) => `url(#${n}${id})`;

  const horizon = { towers: 780, marina: 640, palm: 610, spire: 760, villas: 700, creek: 640, interior: 760 }[scene];
  const water = scene === "marina" || scene === "palm" || scene === "creek";

  const far = skyline(r, { count: 18, base: horizon, min: 40, max: scene === "palm" || scene === "villas" ? 120 : 220 });
  const near = scene === "palm" || scene === "villas" ? []
    : skyline(r, { count: 12, base: horizon, min: scene === "marina" ? 220 : 160, max: scene === "marina" ? 520 : scene === "spire" ? 360 : 440 });
  const glowX = 300 + r() * 1000;
  // Two cards from one area must not look like one picture twice: the
  // seed also decides which way the scene faces.
  const flip = r() < 0.5;
  const facing = flip ? `translate(${W} 0) scale(-1 1)` : undefined;

  const towers = (
    <g>
      <g fill={u("far")}>{far.map((t, i) => <rect key={i} x={t.x} y={t.top} width={t.w} height={horizon - t.top} />)}</g>
      {near.map((t, i) => (
        <g key={i}>
          <rect x={t.x} y={t.top} width={t.w} height={horizon - t.top} fill={u("tower")} />
          <rect x={t.x + 6} y={t.top + 14} width={Math.max(0, t.w - 12)} height={Math.max(0, horizon - t.top - 24)} fill={u(["lit", "lit2", "litp"][t.lit] ?? "lit")} />
          {/* The lit edge: the glow catching one side of the tower. */}
          <rect x={t.x + t.w - 2} y={t.top} width={2} height={horizon - t.top} fill="#A0A5AE" opacity={0.18} />
          <rect x={t.x} y={t.top} width={t.w} height={2} fill="#A0A5AE" opacity={0.22} />
          {t.cap > 0 && <rect x={t.x + t.w / 2 - 1.5} y={t.top - t.cap} width={3} height={t.cap} fill="#3A3E46" />}
        </g>
      ))}
      {scene === "spire" && (
        <g>
          <path d={`M${glowX - 60} ${horizon} L${glowX - 44} ${horizon - 360} L${glowX - 30} ${horizon - 360} L${glowX - 24} ${horizon - 560} L${glowX - 12} ${horizon - 560} L${glowX - 8} ${horizon - 700} L${glowX} ${horizon - 700} L${glowX + 2} ${horizon - 820} L${glowX + 4} ${horizon - 700} L${glowX + 12} ${horizon - 700} L${glowX + 16} ${horizon - 560} L${glowX + 28} ${horizon - 560} L${glowX + 34} ${horizon - 360} L${glowX + 48} ${horizon - 360} L${glowX + 64} ${horizon}Z`} fill={u("tower")} />
          <rect x={glowX + 1} y={horizon - 900} width={2} height={84} fill="#A0A5AE" opacity={0.7} />
          <rect x={glowX - 40} y={horizon - 350} width={74} height={340} fill={u("lit2")} opacity={0.8} />
        </g>
      )}
    </g>
  );

  let fore: ReactNode = null;
  if (scene === "palm") {
    fore = (
      <g>
        {[0, 1, 2].map((i) => (
          <path key={i} d={`M${560 + i * 40} ${horizon + 40} Q${800} ${horizon + 120 + i * 30} ${1080 - i * 40} ${horizon + 40}`} fill="none" stroke="#2A2D33" strokeWidth={10 - i * 2} strokeLinecap="round" opacity={0.9} />
        ))}
        <path d={`M${500} ${horizon + 32} Q${800} ${horizon + 210} ${1120} ${horizon + 32}`} fill="none" stroke="#3A3E46" strokeWidth={6} opacity={0.8} />
        {palm(140, H + 40, 520, false, "#0C0D0F")}
        {palm(1480, H + 60, 600, true, "#0C0D0F")}
      </g>
    );
  } else if (scene === "villas") {
    const villas = Array.from({ length: 6 }, (_, i) => ({ x: -40 + i * 290 + r() * 60, w: 200 + r() * 70, h: 90 + r() * 70 }));
    fore = (
      <g>
        <rect x={0} y={horizon} width={W} height={H - horizon} fill={u("ground")} />
        {villas.map((v, i) => (
          <g key={i}>
            <rect x={v.x} y={horizon + 150 - v.h} width={v.w} height={v.h} fill="#1E2025" />
            <rect x={v.x - 10} y={horizon + 150 - v.h - 8} width={v.w + 20} height={10} fill="#2E3137" />
            <rect x={v.x + v.w * 0.12} y={horizon + 150 - v.h + 22} width={v.w * 0.32} height={v.h * 0.5} fill="#F3F4F6" opacity={0.16 + r() * 0.2} />
            <rect x={v.x + v.w * 0.56} y={horizon + 150 - v.h + 22} width={v.w * 0.3} height={v.h * 0.5} fill="#F3F4F6" opacity={0.08 + r() * 0.14} />
          </g>
        ))}
        {(() => {
          const px = 240 + r() * 520, pw = 380 + r() * 220;
          return (
            <>
              <rect x={px} y={horizon + 190} width={pw} height={46} rx={6} fill="#FF1493" opacity={0.16} />
              <rect x={px} y={horizon + 190} width={pw} height={46} rx={6} fill="none" stroke="#FF1493" strokeOpacity={0.35} />
            </>
          );
        })()}
        {palm(80, H + 30, 470, false, "#0C0D0F")}
        {palm(1530, H + 40, 520, true, "#0C0D0F")}
        {palm(1180, H + 20, 330, false, "#111215")}
      </g>
    );
  } else if (scene === "towers" || scene === "spire") {
    fore = (
      <g>
        <rect x={0} y={horizon} width={W} height={H - horizon} fill={u("ground")} />
        <path d={`M0 ${horizon + 120} C ${W * 0.35} ${horizon + 80}, ${W * 0.65} ${horizon + 170}, ${W} ${horizon + 110}`} stroke="#FF1493" strokeOpacity={0.5} strokeWidth={3} fill="none" />
        <path d={`M0 ${horizon + 132} C ${W * 0.35} ${horizon + 92}, ${W * 0.65} ${horizon + 182}, ${W} ${horizon + 122}`} stroke="#F3F4F6" strokeOpacity={0.35} strokeWidth={2} fill="none" />
      </g>
    );
  }

  if (scene === "interior") {
    return (
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" className={className} aria-hidden="true">
        <Defs id={id} horizon={500} glowX={glowX} />
        <rect width={W} height={H} fill="#141518" />
        <svg x={120} y={70} width={1360} height={640} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice">
          <rect width={W} height={H} fill={u("sky")} />
          <ellipse cx={glowX} cy={horizon} rx={900} ry={260} fill={u("glow")} />
          {towers}
          {fore}
        </svg>
        <g fill="none" stroke="#2E3137" strokeWidth={14}>
          <rect x={120} y={70} width={1360} height={640} />
          <line x1={573} y1={70} x2={573} y2={710} /><line x1={1027} y1={70} x2={1027} y2={710} />
        </g>
        <rect x={0} y={710} width={W} height={290} fill={u("floor")} />
        <rect x={220} y={720} width={1160} height={120} fill="#F3F4F6" opacity={0.04} />
        <g fill="#0E0F11">
          <rect x={260} y={760} width={620} height={120} rx={18} />
          <rect x={240} y={700} width={660} height={90} rx={22} />
          <rect x={980} y={800} width={260} height={60} rx={10} />
        </g>
        <rect x={1320} y={520} width={8} height={300} fill="#2E3137" />
        <ellipse cx={1324} cy={512} rx={56} ry={30} fill="#F3F4F6" opacity={0.18} />
        <ellipse cx={1324} cy={600} rx={220} ry={160} fill={u("glow")} opacity={0.5} />
      </svg>
    );
  }

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" className={className} aria-hidden="true">
      <Defs id={id} horizon={horizon} glowX={glowX} />
      <rect width={W} height={H} fill={u("sky")} />
      <ellipse cx={glowX} cy={horizon} rx={1000} ry={320} fill={u("glow")} />
      <circle cx={glowX + 260} cy={horizon - 330} r={34} fill="#F3F4F6" opacity={0.08} />
      <g transform={facing}>
      {towers}
      <rect x={0} y={horizon - 160} width={W} height={200} fill={u("haze")} />
      {water && (
        <g>
          <rect x={0} y={horizon} width={W} height={H - horizon} fill={u("water")} />
          <g transform={`translate(0 ${horizon * 2}) scale(1 -1)`} opacity={0.22} mask={u("ripple")}>{towers}</g>
          <ellipse cx={glowX} cy={horizon + 30} rx={520} ry={60} fill={u("glow")} opacity={0.6} />
          {Array.from({ length: 5 }, (_, i) => (
            <rect key={i} x={120 + r() * 1300} y={horizon + 40 + r() * (H - horizon - 80)} width={24 + r() * 30} height={3} fill="#F3F4F6" opacity={0.35} />
          ))}
        </g>
      )}
      {fore}
      </g>
      <rect width={W} height={H} fill={u("vignette")} />
    </svg>
  );
}

function Defs({ id, horizon }: { id: string; horizon: number; glowX?: number }) {
  return (
    <defs>
      <linearGradient id={`sky${id}`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#0E0F12" />
        <stop offset={horizon / H * 0.7} stopColor="#1A1C20" />
        <stop offset={horizon / H} stopColor="#292C32" />
        <stop offset="1" stopColor="#292C32" />
      </linearGradient>
      <radialGradient id={`glow${id}`} cx="0.5" cy="0.5" r="0.5">
        <stop offset="0" stopColor="#FF1493" stopOpacity="0.42" />
        <stop offset="0.45" stopColor="#FF1493" stopOpacity="0.14" />
        <stop offset="1" stopColor="#FF1493" stopOpacity="0" />
      </radialGradient>
      <linearGradient id={`tower${id}`} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#30333A" />
        <stop offset="1" stopColor="#17181C" />
      </linearGradient>
      <linearGradient id={`far${id}`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#25272D" />
        <stop offset="1" stopColor="#1C1E22" />
      </linearGradient>
      <linearGradient id={`water${id}`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#1F2126" />
        <stop offset="1" stopColor="#0D0E10" />
      </linearGradient>
      <linearGradient id={`ground${id}`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#16171A" />
        <stop offset="1" stopColor="#0B0C0E" />
      </linearGradient>
      <linearGradient id={`floor${id}`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#1C1D21" />
        <stop offset="1" stopColor="#0E0F11" />
      </linearGradient>
      <linearGradient id={`vignette${id}`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#0E0F12" stopOpacity="0.35" />
        <stop offset="0.5" stopColor="#0E0F12" stopOpacity="0" />
        <stop offset="1" stopColor="#0E0F12" stopOpacity="0.45" />
      </linearGradient>
      <pattern id={`lit${id}`} width="14" height="22" patternUnits="userSpaceOnUse">
        <rect x="3" y="5" width="6" height="9" fill="#F3F4F6" opacity="0.13" />
      </pattern>
      <pattern id={`lit2${id}`} width="42" height="44" patternUnits="userSpaceOnUse">
        <rect x="3" y="5" width="6" height="9" fill="#F3F4F6" opacity="0.42" />
        <rect x="17" y="5" width="6" height="9" fill="#F3F4F6" opacity="0.08" />
        <rect x="31" y="27" width="6" height="9" fill="#F3F4F6" opacity="0.3" />
        <rect x="17" y="27" width="6" height="9" fill="#F3F4F6" opacity="0.12" />
      </pattern>
      <pattern id={`litp${id}`} width="56" height="66" patternUnits="userSpaceOnUse">
        <rect x="3" y="5" width="6" height="9" fill="#F3F4F6" opacity="0.26" />
        <rect x="31" y="27" width="6" height="9" fill="#F3F4F6" opacity="0.1" />
        <rect x="45" y="49" width="6" height="9" fill="#FF1493" opacity="0.32" />
      </pattern>
      <linearGradient id={`haze${id}`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#F3F4F6" stopOpacity="0" />
        <stop offset="0.7" stopColor="#F3F4F6" stopOpacity="0.06" />
        <stop offset="1" stopColor="#F3F4F6" stopOpacity="0" />
      </linearGradient>
      <pattern id={`stripes${id}`} width="10" height="14" patternUnits="userSpaceOnUse">
        <rect width="10" height="7" fill="#FFFFFF" />
      </pattern>
      <mask id={`ripple${id}`}>
        <rect x="0" y="0" width={W} height={H} fill={`url(#stripes${id})`} />
      </mask>
    </defs>
  );
}

/**
 * A picture in a frame: a photograph cropped to fill it, or a drawn scene.
 * The frame (aspect ratio, rounding) belongs to the caller, so swapping a
 * drawing for a photograph never moves the layout.
 */
export function Pic({ picture, className, sizes, priority, zoom, showLabel }: {
  picture: Picture; className?: string; sizes?: string; priority?: boolean; zoom?: boolean; showLabel?: boolean;
}) {
  return (
    <div className={`relative overflow-hidden bg-sunk ${className ?? ""}`}>
      {picture.kind === "photo" ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={picture.src} srcSet={picture.srcSet} sizes={picture.srcSet ? sizes ?? "100vw" : undefined} alt={picture.alt}
             loading={priority ? "eager" : "lazy"} decoding="async" fetchPriority={priority ? "high" : undefined}
             className={`absolute inset-0 size-full object-cover ${zoom ? "transition-transform duration-700 ease-out group-hover:scale-[1.04] motion-reduce:transition-none" : ""}`} />
      ) : (
        <Art scene={picture.scene} seed={picture.seed}
             className={`absolute inset-0 size-full ${zoom ? "transition-transform duration-700 ease-out group-hover:scale-[1.04] motion-reduce:transition-none" : ""}`} />
      )}
      {showLabel && picture.label && (
        <span className="absolute bottom-3 end-3 rounded-full bg-ground/80 px-2.5 py-1 text-[11px] text-ink-2 backdrop-blur-sm">{picture.label}</span>
      )}
    </div>
  );
}
