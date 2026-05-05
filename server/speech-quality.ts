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
// Whisper hallucinations on music/silence usually have unique-token
// ratios well under 10% (the same handful of words repeating).
// Real English speech follows Zipf's law: function words dominate, so
// a 1000-word transcript naturally lands around 15–20% unique. Picking
// a hard threshold here false-positives real long transcripts, so we
// only fire when the ratio is genuinely degenerate AND the transcript
// is short enough that the low ratio can't be explained by length.
const HARD_UNIQUE_TOKEN_RATIO = 0.08; // always suspicious below this
const SHORT_UNIQUE_TOKEN_RATIO = 0.15; // suspicious only on short transcripts
const SHORT_TRANSCRIPT_WORDS = 150;
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

  // Two-tier unique-token check. Only fires on transcripts that are
  // either degenerately repetitive (< 8% unique) OR short-and-repetitive
  // (< 15% unique with under 150 words). Long natural-speech transcripts
  // can sit at 12–18% unique purely because of function-word frequency,
  // so a single fixed threshold across all lengths produced false
  // positives on real videos.
  const tooRepetitive =
    wordCount >= 20 &&
    (uniqueTokenRatio < HARD_UNIQUE_TOKEN_RATIO ||
      (wordCount < SHORT_TRANSCRIPT_WORDS &&
        uniqueTokenRatio < SHORT_UNIQUE_TOKEN_RATIO));
  if (tooRepetitive) {
    return {
      hasSpeech: false,
      reason: `Transcript appears to be repetitive noise (only ${Math.round(
        uniqueTokenRatio * 100,
      )}% unique words across ${wordCount} words). Likely no meaningful speech.`,
      metrics,
    };
  }

  return { hasSpeech: true, metrics };
}
