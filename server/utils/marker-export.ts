interface MarkerComment {
  content: string;
  authorName: string;
  timestamp: number | null;
  createdAt: Date | string;
}

function pad(n: number, len = 2): string {
  return String(n).padStart(len, '0');
}

export function secondsToTimecode(totalSeconds: number, fps = 30): string {
  const totalFrames = Math.round(Math.max(0, totalSeconds) * fps);
  const f = totalFrames % fps;
  const totalSecs = Math.floor(totalFrames / fps);
  const s = totalSecs % 60;
  const m = Math.floor(totalSecs / 60) % 60;
  const h = Math.floor(totalSecs / 3600);
  return `${pad(h)}:${pad(m)}:${pad(s)}:${pad(f)}`;
}

function secondsToFrames(seconds: number, fps = 30): number {
  return Math.round(Math.max(0, seconds) * fps);
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
  fps = 30
): string {
  const totalFrames = secondsToFrames(duration, fps);
  const timebase = fps;

  // Sequence-level markers (timeline ruler markers). Point markers use
  // out=-1, which is the Final Cut Pro 7 / Premiere convention. We deliberately
  // do NOT emit a <clipitem>/<file>: with no real media <pathurl> Premiere
  // imports the clip as OFFLINE (red), and a <clipitem id> built from the
  // filename contains spaces, which makes Premiere reject the whole file with
  // an empty "File Import Failure". An empty sequence that only carries markers
  // imports cleanly and drops the markers straight onto the timeline ruler.
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
      <ntsc>FALSE</ntsc>
    </rate>
    <media>
      <video>
        <format>
          <samplecharacteristics>
            <rate>
              <timebase>${timebase}</timebase>
              <ntsc>FALSE</ntsc>
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
        <ntsc>FALSE</ntsc>
      </rate>
      <string>00:00:00:00</string>
      <frame>0</frame>
      <displayformat>NDF</displayformat>
    </timecode>${markers}
  </sequence>
</xmeml>`;
}

export function generateEDL(
  filename: string,
  duration: number,
  comments: MarkerComment[],
  fps = 30
): string {
  const lines: string[] = [];
  lines.push(`TITLE: ${sanitizeLine(filename)}`);
  lines.push(`FCM: NON-DROP FRAME`);
  lines.push('');

  const sorted = comments
    .filter(c => c.timestamp !== null && c.timestamp !== undefined)
    .sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0));

  sorted.forEach((c, i) => {
    const editNum = String(i + 1).padStart(3, '0');
    const srcIn = secondsToTimecode(c.timestamp!, fps);
    const srcOut = secondsToTimecode(c.timestamp! + 1, fps);
    const recIn = secondsToTimecode(c.timestamp!, fps);
    const recOut = secondsToTimecode(c.timestamp! + 1, fps);

    lines.push(`${editNum}  AX       V     C        ${srcIn} ${srcOut} ${recIn} ${recOut}`);
    lines.push(`* FROM CLIP NAME: ${sanitizeLine(filename)}`);
    lines.push(`* COMMENT: ${sanitizeLine(`[${c.authorName}] ${c.content}`)}`);
    lines.push('');
  });

  return lines.join('\n');
}

export function generateCSV(
  comments: MarkerComment[],
  fps = 30
): string {
  const rows: string[] = [];
  rows.push('Timecode,Seconds,Author,Comment,Date');

  const sorted = comments
    .filter(c => c.timestamp !== null && c.timestamp !== undefined)
    .sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0));

  sorted.forEach(c => {
    const tc = secondsToTimecode(c.timestamp!, fps);
    const escapedContent = `"${c.content.replace(/"/g, '""')}"`;
    const escapedAuthor = `"${c.authorName.replace(/"/g, '""')}"`;
    const date = new Date(c.createdAt).toISOString().split('T')[0];
    rows.push(`${tc},${c.timestamp},${escapedAuthor},${escapedContent},${date}`);
  });

  return rows.join('\n');
}
