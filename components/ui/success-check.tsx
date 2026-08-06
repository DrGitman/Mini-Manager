export function SuccessCheck({ size = 52 }: { size?: number }) {
  const r = (size / 2) - 2
  const circumference = 2 * Math.PI * r

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      style={{ animation: 'check-pop 0.4s cubic-bezier(0.34,1.56,0.64,1) both' }}
    >
      {/* Circle */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="#22c55e"
        strokeWidth="2.5"
        style={{
          strokeDasharray: circumference,
          animation: `draw-circle 0.5s ease-in-out both`,
        }}
      />
      {/* Checkmark */}
      <polyline
        points={`${size * 0.27},${size * 0.52} ${size * 0.45},${size * 0.68} ${size * 0.73},${size * 0.36}`}
        fill="none"
        stroke="#22c55e"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{
          strokeDasharray: 48,
          animation: `draw-check 0.35s ease-in-out 0.45s both`,
        }}
      />
    </svg>
  )
}
