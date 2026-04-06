/**
 * Equal-share CSS grid for call gallery: 1→100%, 2→50/50, 3→⅓ each, 4→2×2, 5+→uniform ⌈√n⌉ columns.
 * Used live; server merge uses the same geometry in recordingMultitrackMerge.ts.
 */
export function getEqualCallGridStyle(totalParticipants) {
  const n = Math.min(12, Math.max(1, totalParticipants));
  const rowTrack = "minmax(0, 1fr)";
  if (n === 1) {
    return {
      gridTemplateColumns: "minmax(0, 1fr)",
      gridTemplateRows: rowTrack,
    };
  }
  if (n === 2) {
    return {
      gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
      gridTemplateRows: rowTrack,
    };
  }
  if (n === 3) {
    return {
      gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
      gridTemplateRows: rowTrack,
    };
  }
  if (n === 4) {
    return {
      gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
      gridTemplateRows: "repeat(2, minmax(0, 1fr))",
    };
  }
  const cols = Math.ceil(Math.sqrt(n));
  const rows = Math.ceil(n / cols);
  return {
    gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
    gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
  };
}
