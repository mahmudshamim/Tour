// Shared brand glyph — mountain peak + sun. Inherits color via currentColor,
// so it sits on the green logo tile (dark ink) and the favicon (white).
export default function TripMark({ size = 28 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="22.5" cy="9.5" r="3.1" fill="currentColor" />
      <path
        d="M3 24.5 L12 9.5 L17.5 19 L21.5 13 L29 24.5 Z"
        fill="currentColor"
      />
    </svg>
  );
}
