/**
 * Byte-aware string helpers. Bounds in scripts and contracts are expressed in
 * UTF-8 bytes (what actually hits the wire and the database), not characters.
 */

export function byteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

export function withinBytes(maxBytes: number): (value: string) => boolean {
  return (value: string): boolean => byteLength(value) <= maxBytes;
}

/**
 * Truncates a string so its UTF-8 encoding fits within `maxBytes`. Never
 * splits a surrogate pair (which would produce invalid UTF-16).
 */
export function truncateToBytes(value: string, maxBytes: number): string {
  if (byteLength(value) <= maxBytes) {
    return value;
  }

  const encoder = new TextEncoder();
  let bytes = 0;
  let out = "";

  for (const char of value) {
    const charBytes = encoder.encode(char).length;
    if (bytes + charBytes > maxBytes) {
      break;
    }
    bytes += charBytes;
    out += char;
  }

  return out;
}
