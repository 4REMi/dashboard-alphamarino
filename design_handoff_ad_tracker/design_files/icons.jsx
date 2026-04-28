// Icon set — small inline SVGs. Stroke-based, 16px default.
const Icon = ({ name, size = 16, className = "" }) => {
  const s = size;
  const stroke = "currentColor";
  const sw = 1.6;
  const common = { width: s, height: s, viewBox: "0 0 24 24", fill: "none", stroke, strokeWidth: sw, strokeLinecap: "round", strokeLinejoin: "round", className };
  switch (name) {
    case "home": return <svg {...common}><path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/></svg>;
    case "compass": return <svg {...common}><circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/></svg>;
    case "wand": return <svg {...common}><path d="M5 19l9-9"/><path d="M14 4l1.5 1.5L17 4l-1.5-1.5z"/><path d="M19 9l1 1 1-1-1-1z"/><path d="M7 5l1 1 1-1-1-1z"/></svg>;
    case "layers": return <svg {...common}><path d="M12 3l9 5-9 5-9-5 9-5z"/><path d="M3 13l9 5 9-5"/><path d="M3 18l9 5 9-5"/></svg>;
    case "chart": return <svg {...common}><path d="M3 3v18h18"/><path d="M7 14l3-3 3 3 5-5"/></svg>;
    case "folder": return <svg {...common}><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>;
    case "settings": return <svg {...common}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3 1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v0a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>;
    case "search": return <svg {...common}><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>;
    case "plus": return <svg {...common}><path d="M12 5v14M5 12h14"/></svg>;
    case "bell": return <svg {...common}><path d="M6 8a6 6 0 1 1 12 0c0 7 3 7 3 9H3c0-2 3-2 3-9z"/><path d="M10 21a2 2 0 0 0 4 0"/></svg>;
    case "help": return <svg {...common}><circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 0 1 5 0c0 1.5-2.5 2-2.5 4"/><path d="M12 17.5h.01"/></svg>;
    case "chev": return <svg {...common}><path d="M9 6l6 6-6 6"/></svg>;
    case "play": return <svg {...common} fill="currentColor" stroke="none"><path d="M7 5l12 7-12 7z"/></svg>;
    case "x": return <svg {...common}><path d="M6 6l12 12M18 6L6 18"/></svg>;
    case "share": return <svg {...common}><path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7"/><path d="M16 6l-4-4-4 4"/><path d="M12 2v14"/></svg>;
    case "save": return <svg {...common}><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><path d="M17 21v-8H7v8M7 3v5h8"/></svg>;
    case "external": return <svg {...common}><path d="M14 3h7v7"/><path d="M21 3l-9 9"/><path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5"/></svg>;
    case "pencil": return <svg {...common}><path d="M4 20h4l11-11-4-4L4 16z"/><path d="M14 6l4 4"/></svg>;
    case "check": return <svg {...common}><path d="M5 12l5 5 9-11"/></svg>;
    case "image": return <svg {...common}><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="M21 15l-5-5L5 21"/></svg>;
    case "upload": return <svg {...common}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M17 8l-5-5-5 5"/><path d="M12 3v12"/></svg>;
    case "spark": return <svg {...common}><path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8"/></svg>;
    case "list": return <svg {...common}><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg>;
    case "filter": return <svg {...common}><path d="M3 5h18l-7 9v6l-4-2v-4z"/></svg>;
    case "clock": return <svg {...common}><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>;
    case "eye": return <svg {...common}><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>;
    case "trending": return <svg {...common}><path d="M3 17l6-6 4 4 8-8"/><path d="M14 7h7v7"/></svg>;
    case "info": return <svg {...common}><circle cx="12" cy="12" r="9"/><path d="M12 8h.01M11 12h1v5h1"/></svg>;
    default: return null;
  }
};
window.Icon = Icon;

// Decorative SVG "video frame" placeholder — striped, deterministic by seed.
const ThumbSVG = ({ seed = 0, brand, label }) => {
  const palettes = [
    ["#1f2a44", "#3a4a6b", "#6b8bff"],
    ["#3a2a1f", "#7a4a2b", "#d99c5c"],
    ["#1f3b2d", "#3f6b4e", "#a3c9a8"],
    ["#3d2034", "#7a4663", "#d9a3b8"],
    ["#1a3441", "#2c5e8f", "#7ab0d8"],
    ["#3a361f", "#a8842b", "#e7c66a"],
  ];
  const p = palettes[seed % palettes.length];
  const stripes = 8;
  const stripeH = 100 / stripes;
  return (
    <svg viewBox="0 0 90 160" preserveAspectRatio="xMidYMid slice" className="thumb-svg">
      <rect width="90" height="160" fill={p[0]}/>
      {Array.from({ length: stripes }).map((_, i) => (
        <rect key={i} x="0" y={i * stripeH * 1.6} width="90" height={stripeH * 1.6} fill={i % 2 ? p[1] : p[0]} opacity={0.55 - (i * 0.04)}/>
      ))}
      <circle cx="22" cy={40 + (seed * 7) % 60} r={10 + (seed % 5)} fill={p[2]} opacity="0.5"/>
      <rect x="50" y={70 + (seed * 3) % 30} width="28" height="36" fill={p[2]} opacity="0.35" rx="3"/>
      <text x="45" y="78" textAnchor="middle" fontFamily="ui-monospace, Menlo, monospace" fontSize="6" fill="rgba(255,255,255,0.65)" letterSpacing="0.5">
        {brand?.toUpperCase?.() || "PLACEHOLDER"}
      </text>
      <text x="45" y="86" textAnchor="middle" fontFamily="ui-monospace, Menlo, monospace" fontSize="4.2" fill="rgba(255,255,255,0.45)">
        {label || "9:16 video frame"}
      </text>
    </svg>
  );
};
window.ThumbSVG = ThumbSVG;
