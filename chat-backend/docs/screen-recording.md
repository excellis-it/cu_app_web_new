# Server-side screen & call recording (mediasoup + FFmpeg)

This README describes how **group call / screen recording** works in the chat backend: per-track capture, offline grid merge, configuration, and the **timeline alignment** fix for participants who join mid-recording.

## Table of contents

- [Architecture](#architecture)
- [Key files & environment variables](#key-files--environment-variables)
- [End-to-end flow](#end-to-end-flow)
- [Timeline alignment (late joiner tiles)](#timeline-alignment-late-joiner-tiles)
- [Operational notes](#operational-notes)

## Architecture

**Default path (recommended): multitrack recording**

- Enabled when `RECORDING_USE_MULTITRACK` is **not** set to `false` (default: on).
- For each relevant **producer** (audio/video), the server opens a plain transport and runs a dedicated **FFmpeg** process writing e.g. `track_<producerId>_video.mp4` / `_audio.mp4` under the session temp directory.
- New participants **attach** as new tracks; the session **does not** restart FFmpeg for the whole room (avoids gaps when someone joins).
- On **stop**, a **manifest** lists every track with paths, `delaySec` (seconds after recording start when that track began), optional `endSec`, and video metadata.
- **`mergeMultitrackManifestToMp4`** runs **offline** FFmpeg: black base canvas, **grid of video cells**, **mixed audio** (`adelay` + `amix`), output e.g. `raw.mp4`, then upload / processing continues as before.

**Legacy path**

- Set `RECORDING_USE_MULTITRACK=false` for the older single-compositor / restart-on-join behavior (documented in code comments in `recordingManager.ts`).

**Screen-specific options**

- `RECORDING_SCREEN_PRIMARY_VIDEO_ONLY` — only one video + all audio (lighter).
- `RECORDING_SCREEN_RESTART_ON_PRODUCER_JOIN` — legacy-style restarts for screen scope (usually off when multitrack is on).

## Key files & environment variables

| Concern | File |
|--------|------|
| Per-track FFmpeg, manifest, stop → merge | `src/mediasoup/recordingManager.ts` |
| Offline grid merge (`filter_complex`) | `src/mediasoup/recordingMultitrackMerge.ts` |

| Variable | Role |
|----------|------|
| `RECORDING_USE_MULTITRACK` | `false` = legacy; default multitrack |
| `FFMPEG_PATH` | Path to `ffmpeg` (and derived `ffprobe` for merge) |
| `RECORDING_OUTPUT_FPS` | Merge / encode FPS (default 10) |
| `RECORDING_CANVAS_WIDTH` / `HEIGHT` | Call recording canvas |
| `RECORDING_SCREEN_CANVAS_WIDTH` / `HEIGHT` | Screen recording canvas (smaller default) |
| `RECORDING_APPLY_180_ROTATION` | Apply 180° fix when manifest says so |
| `RECORDING_LIBX264_THREADS` | x264 thread count (0 = auto) |
| `RECORDING_INPUT_MAX_DELAY_US` | SDP/RTP reorder delay (jitter) |
| `RECORDING_FFMPEG_NICE` | Lower FFmpeg CPU priority (Unix) |

See `recordingManager.ts` at the top for the full list and defaults.

## End-to-end flow

1. **Start** — User starts screen (or call) recording; backend creates a multitrack session, allocates RTP ports, starts FFmpeg per initial producer.
2. **Mid-call** — Additional producers get new PlainTransports + FFmpeg; `delaySec` is recorded relative to session start.
3. **Stop** — Per-track processes exit; files flushed; manifest written with `totalDurationSec` and all tracks.
4. **Merge** — `mergeMultitrackManifestToMp4`: verify files → **ffprobe** video durations → build aligned grid + audio → `raw.mp4`.
5. **Post** — Upload to object storage, optional transcode, chat message update, etc.

---

## Timeline alignment (late joiner tiles)

### Problem

The final `raw.mp4` sometimes showed **only the first user’s tile**. A second user joining mid-session did not appear, even when merge logged **two** video tracks. The failure was in the **FFmpeg grid merge**, not only RTP quality.

### Root cause

The merge used `overlay` with **`enable='between(t, delay, end)'`**, where `t` is the **output** timeline (0 … `totalDurationSec`), and `delay` is when that producer’s track **started on the session clock**.

Each track file’s decoded video has **PTS starting near 0** (time since *that file* started), not since the room recording started.

For a late joiner with `delay ≈ 28s`:

- At output `t = 28`, the overlay turned **on**.
- That stream’s PTS was still ~0–1s (start of **their** file).
- No mapping from output `t` to stream PTS → **blank cell** at the correct wall time.

### What we changed

**File:** `src/mediasoup/recordingMultitrackMerge.ts`

1. **`probeStreamDurationSec`** — `ffprobe` each video file’s `format=duration` before building filters.
2. **`buildAlignedMergeVideoBranch`** — For each cell:
   - Compute `contentWindow = min(probedDuration, endBound - delay, T - delay)` (with a small minimum trim length).
   - `trim` that much from the file after `setpts=PTS-STARTPTS`.
   - Scale / pad / rotation as before.
   - **`tpad=start_duration=delay:start_mode=add:color=black`** — black on the master timeline until the participant’s video should appear.
   - **`tpad=stop_mode=clone:stop_duration=tailPad`** — hold last frame so the branch length is exactly **`T`**.
3. **`buildGridOverlayChain`** — **Remove** `enable=` from `overlay`; cells are full-length and aligned, so use plain `overlay=x=…:y=…`.
4. **`mergeMultitrackManifestToMp4`** — `Promise.all` probes, pass **`videoProbedDurationsSec`** into the grid builder.

**Debug logs:** `[recording:merge:align] video track timeline` includes `delaySec`, `windowLenSec`, `tailPadSec`, `masterT`, `probedSec`.

### Result

Late joiners **show from `t = delay`** because each tile stream is explicitly **time-shifted** to the session timeline instead of gating overlay time with mismatched PTS.

---

## Operational notes

- **RTP drops**, `Connection timed out` on SDP, **`Non-monotonous DTS`**, **`RTP: missed`** affect **quality and length** of source files; they are separate from grid visibility. Tune buffers, `RECORDING_INPUT_MAX_DELAY_US`, CPU (`nice`, thread counts), and network.
- **ffprobe** must be installable alongside **ffmpeg** (same path convention: replace `ffmpeg` with `ffprobe` in `FFMPEG_PATH`).
