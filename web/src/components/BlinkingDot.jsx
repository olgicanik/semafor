// web/src/components/BlinkingDot.jsx
export default function BlinkingDot({ color }) {
  const cls = { GREEN: "dot dot-green", ORANGE: "dot dot-orange",
                RED: "dot dot-red blink", UNKNOWN: "dot dot-grey" }[color] || "dot dot-grey";
  return <span className={cls} aria-label={color} />;
}
