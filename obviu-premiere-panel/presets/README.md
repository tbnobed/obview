# Export presets (built-in "Export quality" options)

Any `.epr` file dropped in this folder shows up automatically in the **Export
quality** dropdown of the panel's "Send your cut" dialog. The file name (without
`.epr`) becomes the label, e.g. `Obviu 1080p (recommended).epr` → "Obviu 1080p
(recommended)". Editors just pick a quality — no hunting for a preset file.

Why bundle them here: Premiere's UXP export API (`EncoderManager.exportSequence`)
only accepts an `.epr` preset path — there is no way to pass raw encoder settings
from code. The plugin's own folder is the one location UXP can read without a
per-machine permission prompt, so shipping the `.epr` files here makes them
instantly selectable for every editor who installs the plugin.

## Why these settings (Obviu re-encodes uploads)

Obviu's server re-encodes every upload into streaming H.264 MP4 proxies
(1080p/720p, `yuv420p`, AAC, `+faststart`) for the review player. So your export
is a **master**, and the sweet spot is a clean, high-quality **H.264 MP4** — near
visually lossless, but far smaller/faster to upload than ProRes over the WAN
link. Uploading giant intermediates just wastes upload time since the extra data
is discarded during transcode.

## Recommended presets to bundle

Create these in Premiere → Export panel → **Format: H.264**, then click **Save
Preset** and drop the resulting `.epr` into this folder.

| Preset name                     | Resolution   | Frame rate   | Bitrate (VBR, 2-pass)       | Audio            |
| ------------------------------- | ------------ | ------------ | --------------------------- | ---------------- |
| `Obviu 1080p (recommended)`     | 1920×1080    | Match source | Target 16 / Max 24 Mbps     | AAC 320k 48k st. |
| `Obviu 4K`                      | 3840×2160    | Match source | Target 45 / Max 60 Mbps     | AAC 320k 48k st. |
| `Obviu 1080p Vertical (social)` | 1080×1920    | Match source | Target 16 / Max 24 Mbps     | AAC 320k 48k st. |
| `Obviu Match Source`            | Match source | Match source | High (Adaptive High)        | AAC 320k 48k st. |

Common settings: Profile **High**, Level **5.2** (or Auto), **Progressive**,
"Use Maximum Render Quality" on if the box has GPU headroom.

The fastest way to get guaranteed-valid `.epr` files for the exact AME build in
use is to duplicate a known-good preset (e.g. an existing working `.epr`) and
adjust resolution/bitrate, rather than hand-authoring the XML — `.epr` internals
are exporter/version-specific and fragile when written by hand.
