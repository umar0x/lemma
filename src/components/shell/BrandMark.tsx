export function BrandMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" aria-hidden="true">
      <rect width="512" height="512" rx="112" ry="112" fill="#1E4A3A" />
      <path d="M168,125 L226,125 L254,305 L390,305 L390,369 L168,369 Z" fill="#F2E8D6" />
      <g transform="translate(254,305) rotate(-50)">
        <path d="M0,0 L-42,-14 Q-47,0 -42,14 Z" fill="#BD9654" />
      </g>
    </svg>
  );
}
