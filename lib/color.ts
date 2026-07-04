/**
 * 高度計の colorForAltitude と同じ補間ロジック。
 * ライトテーマ(白地)での可読性のため、sky側は #7FB5A6 → #4C8A75 に深めている。
 */
export function colorForAltitude(alt: number): string {
  const g = { r: 0xc1, g: 0x5a, b: 0x3a };
  const s = { r: 0x4c, g: 0x8a, b: 0x75 };
  const t = Math.max(0, Math.min(100, alt)) / 100;
  const r = Math.round(g.r + (s.r - g.r) * t);
  const gg = Math.round(g.g + (s.g - g.g) * t);
  const b = Math.round(g.b + (s.b - g.b) * t);
  return `rgb(${r},${gg},${b})`;
}

export function colorForAltitudeAlpha(alt: number, alpha: number): string {
  const g = { r: 0xc1, g: 0x5a, b: 0x3a };
  const s = { r: 0x4c, g: 0x8a, b: 0x75 };
  const t = Math.max(0, Math.min(100, alt)) / 100;
  const r = Math.round(g.r + (s.r - g.r) * t);
  const gg = Math.round(g.g + (s.g - g.g) * t);
  const b = Math.round(g.b + (s.b - g.b) * t);
  return `rgba(${r},${gg},${b},${alpha})`;
}
