export interface QualitySegment {
  start: number;
  end: number;
  text: string;
  avgLogprob?: number | null;
  noSpeechProb?: number | null;
}

export interface SpeechQualityResult {
  hasSpeech: boolean;
  reason?: string;
  metrics: {
    segmentCount: number;
    wordCount: number;
    spokenSeconds: number;
    avgNoSpeechProb: number | null;
    avgLogprob: number | null;
    repetitionRatio: number;
    uniqueTokenRatio: number;
  };
}

const NO_SPEECH_THRESHOLD = 0.6;
const LOGPROB_THRESHOLD = -1.0;
const MIN_WORDS = 8;
const MIN_UNIQUE_TOKEN_RATIO = 0.25;
const MAX_TOP_PHRASE_RATIO = 0.5;

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s']/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
}

export function assessSpeechQuality(
  segments: QualitySegment[] | null | undefined,
): SpeechQualityResult {
  const segs = segments || [];
  const segmentCount = segs.length;

  if (segmentCount === 0) {
    return {
      hasSpeech: false,
      reason: "No speech detected in audio.",
      metrics: {
        segmentCount: 0,
        wordCount: 0,
        spokenSeconds: 0,
        avgNoSpeechProb: null,
        avgLogprob: null,
        repetitionRatio: 0,
        uniqueTokenRatio: 0,
      },
    };
  }

  const fullText = segs.map((s) => s.text || "").join(" ").trim();
  const tokens = tokenize(fullText);
  const wordCount = tokens.length;
  const spokenSeconds = segs.reduce(
    (acc, s) => acc + Math.max(0, (s.end || 0) - (s.start || 0)),
    0,
  );

  const noSpeechVals = segs
    .map((s) => s.noSpeechProb)
    .filter((v): v is number => typeof v === "number" && !Number.isNaN(v));
  const avgNoSpeechProb =
    noSpeechVals.length > 0
      ? noSpeechVals.reduce((a, b) => a + b, 0) / noSpeechVals.length
      : null;

  const logprobVals = segs
    .map((s) => s.avgLogprob)
    .filter((v): v is number => typeof v === "number" && !Number.isNaN(v));
  const avgLogprob =
    logprobVals.length > 0
      ? logprobVals.reduce((a, b) => a + b, 0) / logprobVals.length
      : null;

  // Phrase-repetition: how dominated is the transcript by a single line?
  // Whisper hallucinations on music tend to repeat the same line many times.
  const phraseCounts = new Map<string, number>();
  for (const s of segs) {
    const key = (s.text || "").trim().toLowerCase();
    if (!key) continue;
    phraseCounts.set(key, (phraseCounts.get(key) || 0) + 1);
  }
  let topPhraseCount = 0;
  for (const c of phraseCounts.values()) if (c > topPhraseCount) topPhraseCount = c;
  const repetitionRatio = segmentCount > 0 ? topPhraseCount / segmentCount : 0;

  const uniqueTokens = new Set(tokens);
  const uniqueTokenRatio = wordCount > 0 ? uniqueTokens.size / wordCount : 0;

  const metrics = {
    segmentCount,
    wordCount,
    spokenSeconds,
    avgNoSpeechProb,
    avgLogprob,
    repetitionRatio,
    uniqueTokenRatio,
  };

  if (avgNoSpeechProb !== null && avgNoSpeechProb > NO_SPEECH_THRESHOLD) {
    return {
      hasSpeech: false,
      reason: `No clear speech detected (avg no-speech probability ${avgNoSpeechProb.toFixed(
        2,
      )}). The audio appears to be silent or music-only.`,
      metrics,
    };
  }

  if (avgLogprob !== null && avgLogprob < LOGPROB_THRESHOLD) {
    return {
      hasSpeech: false,
      reason: `Transcription confidence too low (avg log-probability ${avgLogprob.toFixed(
        2,
      )}). The audio likely contains no intelligible speech.`,
      metrics,
    };
  }

  if (wordCount < MIN_WORDS) {
    return {
      hasSpeech: false,
      reason: `Transcript too short to summarize (${wordCount} word${
        wordCount === 1 ? "" : "s"
      } detected).`,
      metrics,
    };
  }

  if (segmentCount >= 4 && repetitionRatio >= MAX_TOP_PHRASE_RATIO) {
    return {
      hasSpeech: false,
      reason: `Transcript appears to be a hallucination — the same phrase repeats in ${Math.round(
        repetitionRatio * 100,
      )}% of segments. Likely no real speech in the audio.`,
      metrics,
    };
  }

  if (wordCount >= 20 && uniqueTokenRatio < MIN_UNIQUE_TOKEN_RATIO) {
    return {
      hasSpeech: false,
      reason: `Transcript appears to be repetitive noise (only ${Math.round(
        uniqueTokenRatio * 100,
      )}% unique words). Likely no meaningful speech.`,
      metrics,
    };
  }

  return { hasSpeech: true, metrics };
}
