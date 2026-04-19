'use client';

export default function ProgressRing({ progress = 0, size = 64, strokeWidth = 6, className = "" }) {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (progress / 100) * circumference;

  return (
    <div className={`progress-ring w-[${size}px] h-[${size}px] flex items-center justify-center ${className}`}>
      <svg width={size} height={size} className="rotate-[-90deg]">
        {/* Background track */}
        <circle
          r={radius}
          cx={size / 2}
          cy={size / 2}
          fill="none"
          stroke="url(#gradient)"
          strokeWidth={strokeWidth}
          className="opacity-30"
        />
        {/* Progress arc */}
        <circle
          r={radius}
          cx={size / 2}
          cy={size / 2}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={offset}
          className="transition-all duration-1000 origin-center"
          pathLength={1}
        />
        <defs>
          <radialGradient id="gradient" cx="50%" cy="50%">
            <stop offset="0%" stopColor="var(--neon-cyan)" />
            <stop offset="100%" stopColor="var(--neon-teal)" />
          </radialGradient>
        </defs>
      </svg>
      <span className="absolute text-xl font-mono font-bold text-neon-cyan drop-shadow-lg">
        {progress}%
      </span>
    </div>
  );
}

