// Upload validation: size, declared MIME type AND the file signature ("magic bytes"). The browser-supplied
// type and filename are never trusted. Storage buckets additionally enforce size/MIME limits server-side.

export type FileKind = "pdf" | "logo" | "document" | "blogImage";
export type FileCheck =
  | { ok: true; bytes: Uint8Array; mime: string; ext: string; size: number }
  | { ok: false; error: "file_missing" | "file_too_large" | "file_invalid_type" | "file_active_content" };

const LIMITS: Record<FileKind, number> = { pdf: 5 * 1024 * 1024, logo: 1024 * 1024, document: 10 * 1024 * 1024, blogImage: 2 * 1024 * 1024 };

const startsWith = (b: Uint8Array, sig: number[], offset = 0) => sig.every((v, i) => b[offset + i] === v);

export function sniff(b: Uint8Array): { mime: string; ext: string } | null {
  if (startsWith(b, [0x25, 0x50, 0x44, 0x46, 0x2d])) return { mime: "application/pdf", ext: "pdf" };                 // %PDF-
  if (startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { mime: "image/png", ext: "png" };
  if (startsWith(b, [0xff, 0xd8, 0xff])) return { mime: "image/jpeg", ext: "jpg" };
  if (startsWith(b, [0x52, 0x49, 0x46, 0x46]) && startsWith(b, [0x57, 0x45, 0x42, 0x50], 8)) return { mime: "image/webp", ext: "webp" }; // RIFF....WEBP
  return null;
}

const ALLOWED: Record<FileKind, string[]> = {
  pdf: ["application/pdf"],
  logo: ["image/png", "image/jpeg", "image/webp"],
  document: ["application/pdf", "image/png", "image/jpeg"],
  blogImage: ["image/png", "image/jpeg", "image/webp"]
};

/** PDFs that embed scripts, launch actions or attachments are refused (conservative resume policy). */
export function hasActivePdfContent(b: Uint8Array): boolean {
  const text = new TextDecoder("latin1").decode(b);
  return /\/(JavaScript|JS|Launch|EmbeddedFile|RichMedia)\b/.test(text);
}

export async function validateUpload(file: File | null | undefined, kind: FileKind): Promise<FileCheck> {
  if (!file || typeof file === "string" || file.size === 0) return { ok: false, error: "file_missing" };
  if (file.size > LIMITS[kind]) return { ok: false, error: "file_too_large" };
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.byteLength > LIMITS[kind]) return { ok: false, error: "file_too_large" };
  const type = sniff(bytes);
  if (!type || !ALLOWED[kind].includes(type.mime)) return { ok: false, error: "file_invalid_type" };
  if (type.mime === "application/pdf" && hasActivePdfContent(bytes)) return { ok: false, error: "file_active_content" };
  return { ok: true, bytes, mime: type.mime, ext: type.ext, size: bytes.byteLength };
}

/** A display-safe version of a client-supplied filename (stored only as a label, never as the path). */
export function safeFileName(name: string): string {
  return name.replace(/[^\w.\- ()]+/g, "_").slice(0, 120) || "file";
}
