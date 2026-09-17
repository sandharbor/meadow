import fs from 'node:fs';
import path from 'node:path';

// Closed vocabulary: creating a folder must not silently authorize a new caller.
export const AREA_CALLERS = new Map([
  ['bundles', 'bundles'], ['bundle/sourcing', 'sourcing'], ['bundle/curation', 'curation'],
  ['bundle/generation', 'generation'], ['bundle/review', 'review'], ['bundle/sharing', 'sharing'],
]);
export const INTERFACE_GUIDANCE = `This area's deliberately narrow public interface.

Prefer durable data produced by one area and consumed by the next.
Keep cross-area calls few and purposeful. Preserve the usual flow:
sourcing → curation → generation → review → sharing.

Export capabilities and contracts, not implementation conveniences.`;
export const WIDTH_MESSAGE = 'Please consider whether this interface is getting too wide for its app area. Keep areas isolated, prefer leaving durable data for the next area over back-and-forth calls, and preserve sourcing → curation → generation → review → sharing. Split responsibilities instead of raising the limit.';
export function canonical(file) { return fs.existsSync(file) ? fs.realpathSync(file) : path.resolve(file); }
export function inside(root, file) {
  const relative = path.relative(root, file);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}
export function ownership(file, roots) {
  for (const root of roots) {
    if (!inside(root, file)) continue;
    const parts = path.relative(root, file).split(path.sep);
    if (parts[0] === 'areas') {
      const area = parts[1] === 'bundle' ? parts.slice(1, 3).join('/') : parts[1];
      return { root, area, caller: AREA_CALLERS.get(area), interface: path.join(root, 'areas', area, 'exported.ts') };
    }
    return { root, caller: parts[0] === 'shared' && parts[1] === 'app-shell' ? 'appShell' : undefined };
  }
  return {};
}
export function publicName(name, typeOnly, web) {
  for (const caller of [...AREA_CALLERS.values(), 'appShell']) {
    const capital = caller[0].toUpperCase() + caller.slice(1);
    if (typeOnly && new RegExp(`^${capital}Type[A-Z][A-Za-z0-9]*$`).test(name)) return caller;
    if (typeOnly) continue;
    if (new RegExp(`^${caller}(Command|Query)[A-Z][A-Za-z0-9]*$`).test(name)) return caller;
    if (web && new RegExp(`^(?:${capital}Component|use${capital}State)[A-Z][A-Za-z0-9]*$`).test(name)) return caller;
    if (!web && caller === 'appShell' && /^appShellRouter[A-Z][A-Za-z0-9]*$/.test(name)) return caller;
  }
  return null;
}
export function resolveLocal(fromFile, specifier) {
  if (!specifier.startsWith('.')) return null;
  const base = path.resolve(path.dirname(fromFile), specifier);
  const ext = path.extname(base);
  const stem = base.slice(0, -ext.length);
  const candidates = /\.[cm]?jsx?$/.test(ext)
    ? [stem + '.ts', stem + '.tsx', stem + '.mts', stem + '.cts', base]
    : [base, ...['.ts', '.tsx', '.js', '.jsx', '.mjs', '/index.ts', '/index.tsx', '/index.js'].map(suffix => base + suffix)];
  return canonical(candidates.find(file => fs.existsSync(file) && fs.statSync(file).isFile()) ?? base);
}
export function isAppAlias(specifier) {
  return /^(?:\/|#|[@~]\/|@(?:app|areas|shared|src)\/|(?:app|areas|shared|src)\/)/.test(specifier);
}
