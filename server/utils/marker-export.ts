interface MarkerComment {
  content: string;
  authorName: string;
  timestamp: number | null;
  createdAt: Date | string;
}

// Options shared by the marker exports. `fps` may be fractional (23.976,
// 29.97, 59.94). `startTimecode` is the source's real start TC
// ("HH:MM:SS:FF"; a ";" before FF marks drop-frame) — when present, every
// exported time becomes startTC + comment offset so markers land on the
// editor's actual timecode instead of running time from zero.
export interface MarkerExportOpts {
  fps?: number;
  startTimecode?: string | null;
}

const TC_RE = /^(\d{2}):(\d{2}):(\d{2})([:;])(\d{2})$/;

function pad(n: number, len = 2): string {
  return String(n).padStart(len, '0');
}

// True for the NTSC family (23.976 / 29.97 / 59.94 etc.) where the exact
// rate is fractional and FCP XML wants ntsc=TRUE with a whole-number timebase.
function isFractionalFps(fps: number): boolean {
  return Math.abs(fps - Math.round(fps)) > 0.001;
}

// Drop-frame only exists for the fractional 30/60 fps family.
function supportsDropFrame(fps: number): boolean {
  const nominal = Math.round(fps);
  return isFractionalFps(fps) && (nominal === 30 || nominal === 60);
}

// Real frame count -> SMPTE timecode string, with proper drop-frame
// renumbering (2 frame numbers skipped per minute — 4 at 59.94 — except
// every 10th minute) when `dropFrame` is set.
export function framesToTimecode(frames: number, fps: number, dropFrame = false): string {
  const nominal = Math.round(fps);
  let f = Math.max(0, Math.round(frames));
  const drop = dropFrame && supportsDropFrame(fps);
  if (drop) {
    const dropCount = nominal / 15; // 2 @ 29.97, 4 @ 59.94
    const framesPer10Min = Math.round(fps * 600); // 17982 @ 29.97
    const framesPerMin = nominal * 60 - dropCount; // 1798 @ 29.97
    const d = Math.floor(f / framesPer10Min);
    const m = f % framesPer10Min;
    f += 9 * dropCount * d;
    if (m > dropCount) f += dropCount * Math.floor((m - dropCount) / framesPerMin);
  }
  const ff = f % nominal;
  const s = Math.floor(f / nominal) % 60;
  const m = Math.floor(f / (nominal * 60)) % 60;
  const h = Math.floor(f / (nominal * 3600));
  return `${pad(h)}:${pad(m)}:${pad(s)}${drop ? ';' : ':'}${pad(ff)}`;
}

// SMPTE timecode string -> real frame count. Honors drop-frame numbering
// when the string uses ";" (or `dropFrame` is forced). Returns null for
// anything that doesn't look like a timecode.
export function timecodeToFrames(tc: string, fps: number): number | null {
  const m = TC_RE.exec(tc.trim());
  if (!m) return null;
  const [, hh, mm, ss, sep, ff] = m;
  const h = Number(hh), mi = Number(mm), s = Number(ss), f = Number(ff);
  const nominal = Math.round(fps);
  if (mi > 59 || s > 59 || f >= nominal) return null;
  let frames = (h * 3600 + mi * 60 + s) * nominal + f;
  if (sep === ';' && supportsDropFrame(fps)) {
    const dropCount = nominal / 15;
    const totalMinutes = h * 60 + mi;
    frames -= dropCount * (totalMinutes - Math.floor(totalMinutes / 10));
  }
  return frames;
}

export function secondsToTimecode(
  totalSeconds: number,
  fps = 30,
  startTimecode?: string | null,
): string {
  const dropFrame = !!startTimecode && startTimecode.includes(';');
  const startFrames = startTimecode ? timecodeToFrames(startTimecode, fps) ?? 0 : 0;
  const frames = startFrames + Math.round(Math.max(0, totalSeconds) * fps);
  return framesToTimecode(frames, fps, dropFrame);
}

function secondsToFrames(seconds: number, fps = 30): number {
  return Math.round(Math.max(0, seconds) * fps);
}

// ---- helpers for reading the real rate / embedded TC out of the ffprobe
// ---- JSON captured at processing time (video_processing.media_info).

// Exact frame rate from the first real video stream ("30000/1001" -> 29.97…).
export function fpsFromMediaInfo(mediaInfo: any): number | null {
  try {
    const streams = mediaInfo?.streams;
    if (!Array.isArray(streams)) return null;
    const v = streams.find(
      (s: any) => s?.codec_type === 'video' && s?.disposition?.attached_pic !== 1,
    );
    const raw = v?.avg_frame_rate || v?.r_frame_rate;
    if (typeof raw !== 'string') return null;
    const [num, den] = raw.split('/').map(Number);
    const fps = den ? num / den : Number(raw);
    return Number.isFinite(fps) && fps >= 1 && fps <= 240 ? fps : null;
  } catch {
    return null;
  }
}

// Embedded start timecode: format tags first, then any stream (QuickTime
// keeps it on a tmcd data stream). Cameras and NLE exports usually write one.
export function timecodeFromMediaInfo(mediaInfo: any): string | null {
  try {
    const candidates: unknown[] = [mediaInfo?.format?.tags?.timecode];
    const streams = mediaInfo?.streams;
    if (Array.isArray(streams)) {
      for (const s of streams) candidates.push(s?.tags?.timecode);
    }
    for (const c of candidates) {
      if (typeof c === 'string' && TC_RE.test(c.trim())) return c.trim();
    }
    return null;
  } catch {
    return null;
  }
}

// Resolve the real fps / start TC / duration for an export. Preference
// order: what we measured or were told at upload time (DB) beats client
// query hints, which beat the legacy 30fps default.
//  - fps: exact stream rate from ffprobe (handles 23.976/29.97) > the
//    integer frame_rate column > ?fps= query > 30.
//  - start TC: files.start_timecode (panel-authoritative) > timecode tag
//    embedded in the media itself > none (exports start at zero, as before).
//  - duration: ?duration= query (player-measured) > duration column > 60.
export function resolveMarkerExportOpts(args: {
  startTimecode?: string | null;
  mediaInfo?: any;
  frameRateColumn?: number | null;
  durationColumn?: number | null;
  queryFps?: unknown;
  queryDuration?: unknown;
}): { fps: number; startTimecode: string | null; duration: number } {
  const rawFps = parseInt(String(args.queryFps));
  const queryFps = isNaN(rawFps) || rawFps < 1 || rawFps > 120 ? null : rawFps;
  const colFps =
    typeof args.frameRateColumn === 'number' &&
    args.frameRateColumn >= 1 &&
    args.frameRateColumn <= 240
      ? args.frameRateColumn
      : null;
  const fps = fpsFromMediaInfo(args.mediaInfo) ?? colFps ?? queryFps ?? 30;

  const ownTc =
    typeof args.startTimecode === 'string' && TC_RE.test(args.startTimecode.trim())
      ? args.startTimecode.trim()
      : null;
  const startTimecode = ownTc ?? timecodeFromMediaInfo(args.mediaInfo);

  const rawDuration = parseFloat(String(args.queryDuration));
  const queryDuration =
    isNaN(rawDuration) || rawDuration < 0 ? null : Math.min(rawDuration, 86400);
  const colDuration =
    typeof args.durationColumn === 'number' && args.durationColumn > 0
      ? Math.min(args.durationColumn, 86400)
      : null;
  const duration = queryDuration ?? colDuration ?? 60;

  return { fps, startTimecode, duration };
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function sanitizeLine(str: string): string {
  return str.replace(/[\r\n]+/g, ' ').replace(/[\x00-\x1f]/g, '').trim();
}

export function generateFCPXML(
  filename: string,
  duration: number,
  comments: MarkerComment[],
  opts: MarkerExportOpts = {},
): string {
  const fps = opts.fps || 30;
  const startTc = opts.startTimecode || null;
  const dropFrame = !!startTc && startTc.includes(';');
  const totalFrames = secondsToFrames(duration, fps);
  // FCP7 XML wants a whole-number timebase plus an NTSC flag for the
  // fractional family (23.976/29.97/59.94).
  const timebase = Math.round(fps);
  const ntsc = isFractionalFps(fps) ? 'TRUE' : 'FALSE';
  const startFrames = startTc ? timecodeToFrames(startTc, fps) ?? 0 : 0;
  const startString = startTc || '00:00:00:00';

  // Sequence-level markers (timeline ruler markers). Point markers use
  // out=-1, which is the Final Cut Pro 7 / Premiere convention. We deliberately
  // do NOT emit a <clipitem>/<file>: with no real media <pathurl> Premiere
  // imports the clip as OFFLINE (red), and a <clipitem id> built from the
  // filename contains spaces, which makes Premiere reject the whole file with
  // an empty "File Import Failure". An empty sequence that only carries markers
  // imports cleanly and drops the markers straight onto the timeline ruler.
  //
  // Marker <in> values stay RELATIVE to the sequence start — the <timecode>
  // block below carries the real start TC, so Premiere/Resolve place the
  // sequence (and every marker on it) at the source's actual timecode.
  const markers = comments
    .filter(c => c.timestamp !== null && c.timestamp !== undefined)
    .sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0))
    .map(c => {
      const inFrames = secondsToFrames(c.timestamp!, fps);
      const markerName = sanitizeLine(`[${c.authorName}] ${c.content}`).substring(0, 255);
      return `
    <marker>
      <name>${escapeXml(markerName)}</name>
      <comment>${escapeXml(sanitizeLine(c.content))}</comment>
      <in>${inFrames}</in>
      <out>-1</out>
    </marker>`;
    })
    .join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE xmeml>
<xmeml version="4">
  <sequence id="obviu-sequence-1">
    <name>${escapeXml(filename)}</name>
    <duration>${totalFrames}</duration>
    <rate>
      <timebase>${timebase}</timebase>
      <ntsc>${ntsc}</ntsc>
    </rate>
    <media>
      <video>
        <format>
          <samplecharacteristics>
            <rate>
              <timebase>${timebase}</timebase>
              <ntsc>${ntsc}</ntsc>
            </rate>
            <width>1920</width>
            <height>1080</height>
          </samplecharacteristics>
        </format>
      </video>
    </media>
    <timecode>
      <rate>
        <timebase>${timebase}</timebase>
        <ntsc>${ntsc}</ntsc>
      </rate>
      <string>${startString}</string>
      <frame>${startFrames}</frame>
      <displayformat>${dropFrame ? 'DF' : 'NDF'}</displayformat>
    </timecode>${markers}
  </sequence>
</xmeml>`;
}

export function generateEDL(
  filename: string,
  duration: number,
  comments: MarkerComment[],
  opts: MarkerExportOpts = {},
): string {
  const fps = opts.fps || 30;
  const startTc = opts.startTimecode || null;
  const dropFrame = !!startTc && startTc.includes(';');

  const lines: string[] = [];
  lines.push(`TITLE: ${sanitizeLine(filename)}`);
  lines.push(`FCM: ${dropFrame ? 'DROP FRAME' : 'NON-DROP FRAME'}`);
  lines.push('');

  const sorted = comments
    .filter(c => c.timestamp !== null && c.timestamp !== undefined)
    .sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0));

  sorted.forEach((c, i) => {
    const editNum = String(i + 1).padStart(3, '0');
    const srcIn = secondsToTimecode(c.timestamp!, fps, startTc);
    const srcOut = secondsToTimecode(c.timestamp! + 1, fps, startTc);

    lines.push(`${editNum}  AX       V     C        ${srcIn} ${srcOut} ${srcIn} ${srcOut}`);
    lines.push(`* FROM CLIP NAME: ${sanitizeLine(filename)}`);
    lines.push(`* COMMENT: ${sanitizeLine(`[${c.authorName}] ${c.content}`)}`);
    lines.push('');
  });

  return lines.join('\n');
}

export function generateCSV(
  comments: MarkerComment[],
  opts: MarkerExportOpts = {},
): string {
  const fps = opts.fps || 30;
  const startTc = opts.startTimecode || null;

  const rows: string[] = [];
  rows.push('Timecode,Seconds,Author,Comment,Date');

  const sorted = comments
    .filter(c => c.timestamp !== null && c.timestamp !== undefined)
    .sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0));

  sorted.forEach(c => {
    const tc = secondsToTimecode(c.timestamp!, fps, startTc);
    const escapedContent = `"${c.content.replace(/"/g, '""')}"`;
    const escapedAuthor = `"${c.authorName.replace(/"/g, '""')}"`;
    const date = new Date(c.createdAt).toISOString().split('T')[0];
    rows.push(`${tc},${c.timestamp},${escapedAuthor},${escapedContent},${date}`);
  });

  return rows.join('\n');
}
