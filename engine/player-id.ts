/** Infer a PES player ID from the nearest five-digit directory segment in a source path. */
export function inferPesPlayerIdFromPath(folder: string): string | null {
  const segments = folder.split(/[\\/]+/).filter(Boolean);
  for (let index = segments.length - 1; index >= 0; index--) {
    if (/^[0-9]{5}$/.test(segments[index])) return segments[index];
  }
  return null;
}
