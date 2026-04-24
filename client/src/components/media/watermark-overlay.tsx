export default function WatermarkOverlay({ label }: { label: string }) {
  const text = (label.length > 80 ? label.slice(0, 77) + "..." : label)
    .replace(/[<>&"']/g, c => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&#39;" }[c] as string));
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="420" height="180">
      <defs>
        <pattern id="wm" patternUnits="userSpaceOnUse" width="420" height="180" patternTransform="rotate(-30)">
          <text x="0" y="100" font-family="ui-sans-serif, system-ui, sans-serif" font-size="18" fill="rgba(255,255,255,0.22)" font-weight="600">
            ${text}
          </text>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#wm)"/>
    </svg>`;
  const url = `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`;
  return (
    <div
      aria-hidden="true"
      data-testid="watermark-overlay"
      className="absolute inset-0 pointer-events-none select-none"
      style={{
        backgroundImage: url,
        backgroundRepeat: "repeat",
        mixBlendMode: "difference",
      }}
    />
  );
}
