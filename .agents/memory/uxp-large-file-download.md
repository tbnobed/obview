---
name: UXP large-file download/import
description: Why the Premiere panel must stream downloads to disk in blocks instead of buffering the whole file in memory.
---

# UXP large-file download → import

When downloading a media file in the Premiere panel to import it, do NOT read the
whole response into one in-memory buffer.

**Rule:** stream `res.body.getReader()`, normalize each chunk to a `Uint8Array`
(chunks can be raw ArrayBuffers — `.length` is `undefined` on those), accumulate
to a flush threshold (~8 MB), then `outFile.write(merged.buffer, { append: wroteAny })`
so the file grows on disk. Keep a single-`arrayBuffer()` fallback when no stream
reader exists. After writing, sanity-check on-disk size against `Content-Length`
and throw if it mismatches.

**Why:** building one `new Uint8Array(received)` for the full file (a) overflows
the max typed-array length / OOMs on large media and (b) threw
"Invalid typed array length: undefined" because a non-`Uint8Array` chunk made
`received` math break. Large files "always failed to import" as a result.

**How to apply:** any UXP download-then-write path (import, version pull, etc.).
Append-mode incremental writes + size verification is the safe pattern; the
percentage bar needs the server to expose `Content-Length` cross-origin
(Access-Control-Expose-Headers on /api/v1).
