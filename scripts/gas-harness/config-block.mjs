/**
 * PROD and DEMO must be identical outside their CONFIGURATION block
 * (from the CONFIGURATION banner up to the HTTP HANDLERS banner).
 */
const BANNER = '/* ═══════════════════════════════════════════════════════════\n';

export function splitConfig(src) {
  const start = src.indexOf(BANNER + '   CONFIGURATION');
  const end = src.indexOf(BANNER + '   HTTP HANDLERS');
  if (start === -1 || end === -1 || end < start) throw new Error('CONFIGURATION / HTTP HANDLERS banners not found');
  return { before: src.slice(0, start), config: src.slice(start, end), after: src.slice(end) };
}
