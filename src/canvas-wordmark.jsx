export default function CanvasWordmark({ width = 82, height = 32, color = "#000814", style }) {
  return (
    <svg
      aria-label="Canvas"
      role="img"
      viewBox="0 0 82 32"
      width={width}
      height={height}
      style={{ display: "block", color, flexShrink: 0, ...style }}
    >
      <text
        x="0"
        y="25"
        fill="currentColor"
        fontFamily="AvertaDemoPE-ExtraBold, Averta Demo PE, Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
        fontSize="26"
        fontStyle="italic"
        fontWeight="700"
        letterSpacing="-0.4"
      >
        Canvas
      </text>
    </svg>
  );
}
