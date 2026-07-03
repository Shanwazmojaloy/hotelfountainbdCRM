'use client';

// Warm Ivory ProgressRing — ink track + configurable accent (default gold).
// `color` accepts any CSS color; label rendered in IBM Plex Mono.
export default function ProgressRing({
  progress = 0,
  size = 64,
  strokeWidth = 6,
  color = '#DFFF45',
  trackColor = 'rgba(255,255,255,.12)',
  className = '',
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const pct = Math.max(0, Math.min(100, Number(progress) || 0));
  const offset = circumference - (pct / 100) * circumference;

  return (
    <div
      className={`relative flex items-center justify-center ${className}`}
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} className="rotate-[-90deg]">
        <circle
          r={radius}
          cx={size / 2}
          cy={size / 2}
          fill="none"
          stroke={trackColor}
          strokeWidth={strokeWidth}
        />
        <circle
          r={radius}
          cx={size / 2}
          cy={size / 2}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 1s cubic-bezier(0.4,0,0.2,1)' }}
        />
      </svg>
      <span
        className="absolute font-bold"
        style={{
          fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
          fontSize: size * 0.26,
          color: 'var(--iv-ink)',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {Math.round(pct)}%
      </span>
    </div>
  );
}
