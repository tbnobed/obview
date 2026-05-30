import PDFDocument from "pdfkit";
import { spawn } from "child_process";
import { promises as fsp } from "fs";
import { existsSync } from "fs";
import os from "os";
import path from "path";
import { secondsToTimecode } from "./marker-export";

export interface PdfComment {
  id: string;
  authorName: string;
  content: string;
  timestamp: number | null;
  inPoint?: number | null;
  outPoint?: number | null;
  annotations?: string | null;
  isResolved?: boolean;
  parentId?: string | null;
  createdAt: Date | string;
}

interface Annotation {
  type: "freehand" | "circle" | "rect" | "arrow";
  color?: string;
  points?: number[][];
  x?: number;
  y?: number;
  x2?: number;
  y2?: number;
  width?: number;
  height?: number;
  radiusX?: number;
  radiusY?: number;
}

// Avatar palette (mirrors the kind of muted, distinct hues used in the UI).
const AVATAR_COLORS = [
  "#ef4444", "#f97316", "#f59e0b", "#10b981", "#06b6d4",
  "#3b82f6", "#6366f1", "#8b5cf6", "#ec4899", "#14b8a6",
];

function avatarColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function formatDateTime(d: Date | string): string {
  const date = new Date(d);
  if (isNaN(date.getTime())) return "";
  const datePart = date.toLocaleDateString("en-US", { month: "numeric", day: "numeric", year: "2-digit" });
  const timePart = date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return `${datePart} at ${timePart}`;
}

function timecodeLabel(c: PdfComment, fps: number): string | null {
  if (c.inPoint != null && c.outPoint != null && c.outPoint > c.inPoint) {
    return `${secondsToTimecode(c.inPoint, fps)} - ${secondsToTimecode(c.outPoint, fps)}`;
  }
  if (c.timestamp != null) return secondsToTimecode(c.timestamp, fps);
  return null;
}

// Minimal JPEG dimension parser (no external deps). Returns {width,height} or null.
function jpegSize(buf: Buffer): { width: number; height: number } | null {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let offset = 2;
  while (offset < buf.length) {
    if (buf[offset] !== 0xff) {
      offset++;
      continue;
    }
    const marker = buf[offset + 1];
    // SOF markers carrying frame dimensions.
    if (
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf)
    ) {
      const height = buf.readUInt16BE(offset + 5);
      const width = buf.readUInt16BE(offset + 7);
      return { width, height };
    }
    const len = buf.readUInt16BE(offset + 2);
    if (len <= 0) break;
    offset += 2 + len;
  }
  return null;
}

// Extract a single frame at `ts` seconds from `sourcePath` to `outPath`.
// Mirrors the keyframe-seek pattern (`-ss` before `-i`) used elsewhere.
function extractFrame(sourcePath: string, ts: number, outPath: string, isImage: boolean): Promise<boolean> {
  return new Promise((resolve) => {
    const args = isImage
      ? ["-y", "-i", sourcePath, "-frames:v", "1", "-vf", "scale=640:-2", "-q:v", "4", outPath]
      : ["-y", "-ss", String(Math.max(0, ts)), "-i", sourcePath, "-frames:v", "1", "-vf", "scale=640:-2", "-q:v", "4", outPath];
    const ff = spawn("ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] });
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(ok);
    };
    const timer = setTimeout(() => {
      try { ff.kill("SIGKILL"); } catch {}
      finish(false);
    }, 15000);
    ff.on("close", (code) => finish(code === 0 && existsSync(outPath)));
    ff.on("error", () => finish(false));
  });
}

function parseAnnotations(raw: string | null | undefined): Annotation[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// Draw annotation shapes onto the PDF over a placed image rect.
// Normalized (0-1) coords are mapped into [ox,oy] + size.
function drawAnnotations(
  doc: PDFKit.PDFDocument,
  anns: Annotation[],
  ox: number,
  oy: number,
  w: number,
  h: number,
) {
  for (const a of anns) {
    const color = a.color || "#ef4444";
    doc.save();
    doc.lineWidth(2).strokeColor(color);
    const px = (n: number) => ox + n * w;
    const py = (n: number) => oy + n * h;
    if (a.type === "freehand" && a.points && a.points.length > 1) {
      // Bound point count so a pathological annotation can't generate a huge path.
      const pts = a.points.length > 2000 ? a.points.slice(0, 2000) : a.points;
      doc.moveTo(px(pts[0][0]), py(pts[0][1]));
      for (let i = 1; i < pts.length; i++) {
        doc.lineTo(px(pts[i][0]), py(pts[i][1]));
      }
      doc.stroke();
    } else if (a.type === "rect" && a.x != null && a.y != null) {
      const rw = (a.width ?? 0) * w;
      const rh = (a.height ?? 0) * h;
      doc.rect(px(a.x), py(a.y), rw, rh).stroke();
    } else if (a.type === "circle" && a.x != null && a.y != null) {
      const rx = (a.radiusX ?? 0) * w;
      const ry = (a.radiusY ?? 0) * h;
      if (rx > 0 && ry > 0) doc.ellipse(px(a.x), py(a.y), rx, ry).stroke();
    } else if (a.type === "arrow" && a.x != null && a.y != null && a.x2 != null && a.y2 != null) {
      const x1 = px(a.x), y1 = py(a.y), x2 = px(a.x2), y2 = py(a.y2);
      doc.moveTo(x1, y1).lineTo(x2, y2).stroke();
      const angle = Math.atan2(y2 - y1, x2 - x1);
      const head = 8;
      doc.moveTo(x2, y2)
        .lineTo(x2 - head * Math.cos(angle - Math.PI / 6), y2 - head * Math.sin(angle - Math.PI / 6))
        .moveTo(x2, y2)
        .lineTo(x2 - head * Math.cos(angle + Math.PI / 6), y2 - head * Math.sin(angle + Math.PI / 6))
        .stroke();
    }
    doc.restore();
  }
}

export async function generateCommentPDF(opts: {
  filename: string;
  comments: PdfComment[];
  fps: number;
  sourcePath: string | null;
  fileType: string;
}): Promise<Buffer> {
  const { filename, comments, fps, sourcePath, fileType } = opts;

  const replies = new Map<string, PdfComment[]>();
  for (const c of comments) {
    if (c.parentId) {
      const arr = replies.get(c.parentId) || [];
      arr.push(c);
      replies.set(c.parentId, arr);
    }
  }
  Array.from(replies.values()).forEach((arr) => {
    arr.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  });

  const topLevel = comments
    .filter((c) => !c.parentId)
    .sort((a, b) => {
      const at = a.timestamp, bt = b.timestamp;
      if (at == null && bt == null) return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      if (at == null) return 1;
      if (bt == null) return -1;
      return at - bt;
    });

  // Cap the number of frame extractions per document to bound ffmpeg work,
  // memory, and request time on files with many annotated comments.
  const MAX_THUMBNAILS = 80;

  // Pre-extract frames for comments that have annotations (bounded work).
  const canExtract = sourcePath && (fileType === "video" || fileType === "image");
  const tmpDir = canExtract ? await fsp.mkdtemp(path.join(os.tmpdir(), "obviu-pdf-")) : null;
  const frameByComment = new Map<string, { buf: Buffer; width: number; height: number; anns: Annotation[] }>();

  try {
  if (canExtract && tmpDir) {
    const isImage = fileType === "image";
    let idx = 0;
    for (const c of topLevel) {
      if (idx >= MAX_THUMBNAILS) break;
      const anns = parseAnnotations(c.annotations);
      // Extract a frame for every comment anchored to the media: any timestamped
      // (or ranged) comment on a video, and all comments on an image. Drawing
      // annotations, when present, are overlaid on top.
      const hasTime = c.timestamp != null || c.inPoint != null;
      if (!isImage && !hasTime) continue;
      const ts = c.timestamp ?? c.inPoint ?? 0;
      const outPath = path.join(tmpDir, `frame-${idx++}.jpg`);
      const ok = await extractFrame(sourcePath!, ts, outPath, isImage);
      if (!ok) continue;
      try {
        const buf = await fsp.readFile(outPath);
        const size = jpegSize(buf);
        if (size && size.width > 0 && size.height > 0) {
          frameByComment.set(c.id, { buf, width: size.width, height: size.height, anns });
        }
      } catch {
        /* ignore */
      }
    }
  }

  const doc = new PDFDocument({ size: "LETTER", margin: 50, bufferPages: true });
  const chunks: Buffer[] = [];
  doc.on("data", (d) => chunks.push(d as Buffer));
  const done = new Promise<Buffer>((resolve) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
  });

  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;
  const contentWidth = right - left;
  const bottom = doc.page.height - doc.page.margins.bottom;

  // ---- Header ----
  doc.fillColor("#111827").font("Helvetica-Bold").fontSize(18).text(filename, left, doc.y, { width: contentWidth });
  doc.moveDown(0.2);
  doc.font("Helvetica").fontSize(10).fillColor("#6b7280");
  const count = topLevel.length;
  doc.text(
    `${count} comment${count === 1 ? "" : "s"}  ·  Sorted by timecode  ·  Generated ${formatDateTime(new Date())}`,
    { width: contentWidth },
  );
  doc.moveDown(0.6);
  doc.moveTo(left, doc.y).lineTo(right, doc.y).lineWidth(1).strokeColor("#e5e7eb").stroke();
  doc.moveDown(0.8);

  const ensureSpace = (needed: number) => {
    if (doc.y + needed > bottom) doc.addPage();
  };

  const drawAvatar = (name: string, x: number, y: number, d: number) => {
    const r = d / 2;
    doc.save();
    doc.circle(x + r, y + r, r).fill(avatarColor(name));
    doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(d * 0.4);
    doc.text(initials(name), x, y + r - d * 0.22, { width: d, align: "center" });
    doc.restore();
  };

  let number = 0;
  for (const c of topLevel) {
    number++;
    ensureSpace(60);
    const blockTop = doc.y;
    const avatarD = 26;
    const textX = left + avatarD + 12;
    const textW = contentWidth - avatarD - 12;

    drawAvatar(c.authorName, left, blockTop, avatarD);

    // Author + date (left), number (right)
    doc.font("Helvetica-Bold").fontSize(10.5).fillColor("#111827");
    doc.text(c.authorName, textX, blockTop, { continued: true, width: textW });
    doc.font("Helvetica").fontSize(9).fillColor("#9ca3af");
    doc.text(`   ${formatDateTime(c.createdAt)}`, { width: textW });

    doc.font("Helvetica-Bold").fontSize(9).fillColor("#9ca3af");
    doc.text(`#${number}`, textX, blockTop, { width: textW, align: "right" });

    // Timecode + resolved pill
    const tc = timecodeLabel(c, fps);
    let lineY = doc.y + 2;
    if (tc) {
      doc.font("Helvetica-Bold").fontSize(9.5).fillColor("#2563eb");
      doc.text(tc, textX, lineY, { continued: false });
    }
    if (c.isResolved) {
      doc.font("Helvetica-Bold").fontSize(8).fillColor("#059669");
      doc.text("RESOLVED", textX, lineY, { width: textW, align: "right" });
    }

    // Content
    doc.font("Helvetica").fontSize(10.5).fillColor("#1f2937");
    doc.text(c.content, textX, doc.y + 2, { width: textW });

    // Frame thumbnail with annotation overlay
    const frame = frameByComment.get(c.id);
    if (frame) {
      const dispW = Math.min(300, textW);
      const dispH = dispW * (frame.height / frame.width);
      ensureSpace(dispH + 10);
      const imgX = textX;
      const imgY = doc.y + 6;
      try {
        doc.image(frame.buf, imgX, imgY, { width: dispW, height: dispH });
        doc.save();
        doc.lineWidth(0.5).strokeColor("#d1d5db").rect(imgX, imgY, dispW, dispH).stroke();
        doc.restore();
        drawAnnotations(doc, frame.anns, imgX, imgY, dispW, dispH);
        doc.y = imgY + dispH;
      } catch {
        /* skip image on failure */
      }
    }

    // Replies
    const childReplies = replies.get(c.id) || [];
    for (const r of childReplies) {
      ensureSpace(40);
      const rTop = doc.y + 6;
      const rAvatarD = 18;
      const rIndent = textX + 14;
      const rTextX = rIndent + rAvatarD + 8;
      const rTextW = right - rTextX;
      drawAvatar(r.authorName, rIndent, rTop, rAvatarD);
      doc.font("Helvetica-Bold").fontSize(9.5).fillColor("#374151");
      doc.text(r.authorName, rTextX, rTop, { continued: true, width: rTextW });
      doc.font("Helvetica").fontSize(8.5).fillColor("#9ca3af");
      doc.text(`   ${formatDateTime(r.createdAt)}`, { width: rTextW });
      doc.font("Helvetica").fontSize(9.5).fillColor("#4b5563");
      doc.text(r.content, rTextX, doc.y + 1, { width: rTextW });
    }

    doc.moveDown(0.6);
    ensureSpace(20);
    doc.moveTo(left, doc.y).lineTo(right, doc.y).lineWidth(0.5).strokeColor("#f3f4f6").stroke();
    doc.moveDown(0.6);
  }

  if (topLevel.length === 0) {
    doc.font("Helvetica").fontSize(11).fillColor("#9ca3af").text("No comments on this file.", left, doc.y);
  }

  doc.end();
  const result = await done;
  return result;
  } finally {
    if (tmpDir) {
      fsp.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    }
  }
}
