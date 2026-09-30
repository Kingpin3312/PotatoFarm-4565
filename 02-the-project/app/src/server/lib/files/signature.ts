/**
 * Magic numbers for the three types WhatsApp takes from us.
 * Kept free of the database so it can be unit-tested.
 */
export function matchesType(head: Uint8Array, mimeType: string): boolean {
  const starts = (...b: number[]) => b.every((x, i) => head[i] === x);
  switch (mimeType) {
    case "application/pdf": return starts(0x25, 0x50, 0x44, 0x46); // %PDF
    case "image/jpeg": return starts(0xff, 0xd8, 0xff);
    case "image/png": return starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
    default: return false;
  }
}
