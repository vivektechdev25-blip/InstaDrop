import type { Page } from "playwright";

/**
 * Extracted out of playwrightTier.ts (2026-08-05) so the own-private-
 * content flow (privateContentService.ts, authenticated via session
 * cookie) can reuse the exact same DOM-parsing logic - the audio-fix,
 * full-resolution image recovery, and carousel-slide collection all
 * apply identically to an authenticated page render, not just the
 * anonymous public one. Pure extraction, no behavior change: every
 * function here is byte-for-byte what playwrightTier.ts had inline
 * before, just moved and re-exported.
 */

export const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
// Paired with the UA above, not independent of it: the desktop UA +
// 1280x900 viewport combination is what makes Instagram serve the
// progressive (audio-inclusive) MP4 this scraper depends on - a mobile UA
// was tried and regressed audio (see docs/KNOWN_ISSUES.md). Exported so
// browserManager.withBrowserContext() is the only place that applies them,
// rather than each flow hardcoding its own copy.
export const VIEWPORT = { width: 1280, height: 900 } as const;
export const NAVIGATION_TIMEOUT_MS = 20000;
export const POST_LOAD_WAIT_MS = 2500;
export const SLIDE_CLICK_WAIT_MS = 900;
export const MAX_CAROUSEL_SLIDES = 20;

// Confirmed live 2026-08-04 against a real nonexistent shortcode - this is
// the actual current copy ("Post isn't available" / "The link may be
// broken, or the profile may have been removed."), not the classic "Sorry,
// this page isn't available" copy a first guess would produce (see
// docs/KNOWN_ISSUES.md). Shared since both flows can hit a deleted/
// mistyped shortcode.
export const NOT_FOUND_MARKER = "Post isn't available";

export interface PageMeta {
  ogImage: string | null;
  ogDescription: string | null;
  ogImageWidth: string | null;
  ogImageHeight: string | null;
}

export async function readPageMeta(page: Page): Promise<PageMeta> {
  // String body, not a closure: tsx/esbuild wraps evaluate() closures with
  // a `__name` helper that only exists in the Node-side module scope, so
  // Playwright's stringified-closure-in-browser call throws `__name is not
  // defined` at runtime. A string body sidesteps that entirely (confirmed
  // live 2026-08-04).
  return page.evaluate<PageMeta>(`
    (() => {
      const get = (selector) => document.querySelector(selector)?.getAttribute("content") ?? null;
      return {
        ogImage: get('meta[property="og:image"]'),
        ogDescription: get('meta[property="og:description"]') ?? get('meta[name="description"]'),
        ogImageWidth: get('meta[property="og:image:width"]'),
        ogImageHeight: get('meta[property="og:image:height"]'),
      };
    })()
  `);
}

/**
 * Every progressive video URL the page offers, in page order, deduplicated.
 *
 * Confirmed live 2026-08-05: the DASH-adaptive video Chromium requests
 * during page load is video-only - vp9, zero audio streams, verified via
 * ffprobe. Instagram separately embeds a "progressive" (single-file,
 * pre-muxed) rendition in one of the page's server-rendered
 * `<script type="application/json" data-sjs>` relay-data blobs, under a
 * `video_versions` array, even for logged-out visitors who never get the
 * interactive `<video>` element mounted.
 *
 * Returns every entry rather than only the first (2026-10-15). The first
 * entry is not reliably the muxed one: production served silent videos
 * because the entry it picked carried no audio track, while the same page
 * fetched from a different network offered three entries that all did.
 * Nothing in the entry distinguishes them - `type`, the `vencode_tag` and
 * even the decoded asset name were identical between an audio-bearing and
 * a silent URL - so the caller probes the actual bytes instead, via
 * selectVideoUrlWithAudio().
 *
 * Deep-searches every relay-data script tag rather than assuming a fixed
 * JSON path, since Instagram's internal component nesting isn't a stable
 * contract - only the presence of a `video_versions` array is relied on.
 * Returns an empty array (not a thrown error) when nothing is found, since
 * this is best-effort - image and carousel posts never have this data.
 */
export async function findProgressiveVideoUrls(page: Page): Promise<string[]> {
  const urls = await page.evaluate<string[]>(`
    (() => {
      const scripts = Array.from(
        document.querySelectorAll('script[type="application/json"][data-sjs]')
      );
      const found = [];

      function collectVideoVersions(node, depth) {
        if (depth > 14 || node === null || typeof node !== "object") return;
        if (Array.isArray(node.video_versions)) {
          for (const version of node.video_versions) {
            if (version && typeof version.url === "string") found.push(version.url);
          }
        }
        for (const key of Object.keys(node)) {
          collectVideoVersions(node[key], depth + 1);
        }
      }

      for (const script of scripts) {
        try {
          collectVideoVersions(JSON.parse(script.textContent || ""), 0);
        } catch {
          // Not every data-sjs script tag is well-formed JSON we care
          // about - skip and keep searching the rest.
        }
      }
      return found;
    })()
  `);

  return [...new Set(urls)];
}

/**
 * The audio-only streams listed in the page's DASH manifest, best first.
 *
 * Measured 2026-10-16: from a datacenter network (production, Railway)
 * Instagram can offer no rendition with both picture and sound - every
 * `video_versions` entry and every captured stream was video-only - so
 * picking the right file is not enough. The page data still carries a
 * `video_dash_manifest` (MPD XML) whose audio AdaptationSet points at a
 * separate AAC stream; the download service joins that to the video.
 * It is read from the page data rather than captured off the network,
 * because the muted autoplay never requests the audio at all.
 *
 * Best-effort like the function above: an empty array when there is no
 * manifest, no audio set, or the XML does not parse.
 */
export async function findDashAudioUrls(page: Page): Promise<string[]> {
  // String body for the same reason as readPageMeta().
  const urls = await page.evaluate<string[]>(`
    (() => {
      const scripts = Array.from(
        document.querySelectorAll('script[type="application/json"][data-sjs]')
      );
      const found = [];

      function readManifest(xmlText) {
        const xml = new DOMParser().parseFromString(xmlText, "application/xml");
        if (xml.querySelector("parsererror")) return;
        for (const set of Array.from(xml.getElementsByTagName("AdaptationSet"))) {
          const setType = (set.getAttribute("contentType") || set.getAttribute("mimeType") || "").toLowerCase();
          for (const rep of Array.from(set.getElementsByTagName("Representation"))) {
            const type = setType + " " + (rep.getAttribute("mimeType") || "").toLowerCase();
            if (!type.includes("audio")) continue;
            const base = rep.getElementsByTagName("BaseURL")[0];
            const url = base && base.textContent ? base.textContent.trim() : "";
            if (!/^https:\\/\\//.test(url)) continue;
            found.push({ url, bandwidth: Number(rep.getAttribute("bandwidth")) || 0 });
          }
        }
      }

      function walk(node, depth) {
        if (depth > 14 || node === null || typeof node !== "object") return;
        if (typeof node.video_dash_manifest === "string") {
          try { readManifest(node.video_dash_manifest); } catch {}
        }
        for (const key of Object.keys(node)) walk(node[key], depth + 1);
      }

      for (const script of scripts) {
        try {
          walk(JSON.parse(script.textContent || ""), 0);
        } catch {
          // Not every data-sjs tag is JSON we care about.
        }
      }
      found.sort((a, b) => b.bandwidth - a.bandwidth);
      return found.map((entry) => entry.url);
    })()
  `);

  return [...new Set(urls.map(stripByteRangeParams))];
}


// An MP4's track list lives in the `moov` box. Instagram's progressive files
// are faststart (moov before mdat, measured at ~36KB), so the first chunk is
// enough to read the track list without downloading a 20MB video.
const AUDIO_PROBE_BYTES = 400_000;
const AUDIO_PROBE_TIMEOUT_MS = 8000;
// Each probe is one ranged request. Instagram offers three entries in
// practice, and the right one has always been among the first few.
const MAX_AUDIO_PROBES = 4;
// The page refetches the same few streams repeatedly; a handful is plenty.
export const MAX_CAPTURED_MEDIA = 8;

/**
 * Reads an MP4's `moov` box and reports whether it declares an audio track.
 *
 * Returns null - not false - when that cannot be determined (request failed,
 * or `moov` wasn't inside the fetched prefix). The caller treats "unknown"
 * very differently from "definitely silent": a URL we couldn't inspect is
 * still a better answer than one we know has no sound.
 */
/** What an MP4's `moov` box says the file actually contains. */
export interface Mp4Tracks {
  video: number;
  audio: number;
}

/**
 * Counts the tracks an MP4 header declares.
 *
 * Returns null - not zero - when that cannot be determined (no `moov` inside
 * the fetched prefix, or a malformed box). Callers must keep "unknown" and
 * "none" apart: a file we could not inspect is still a better answer than one
 * we know is missing what we need.
 */
export function readMp4Tracks(header: Buffer): Mp4Tracks | null {
  let offset = 0;

  while (offset + 8 <= header.length) {
    let size = header.readUInt32BE(offset);
    const type = header.subarray(offset + 4, offset + 8).toString("latin1");
    if (size === 1) {
      if (offset + 16 > header.length) return null;
      size = Number(header.readBigUInt64BE(offset + 8));
    }
    if (size < 8) return null;

    if (type === "moov") {
      // A truncated moov may still list tracks in the part never fetched.
      if (offset + size > header.length) return null;

      const moov = header.subarray(offset, offset + size);
      const tracks: Mp4Tracks = { video: 0, audio: 0 };
      // Each track declares its kind in an `hdlr` box, whose handler type
      // ("vide" / "soun") sits 12 bytes past the box type.
      for (let index = 0; index + 16 <= moov.length; index += 1) {
        if (moov.subarray(index, index + 4).toString("latin1") !== "hdlr") continue;
        const handler = moov.subarray(index + 12, index + 16).toString("latin1");
        if (handler === "vide") tracks.video += 1;
        if (handler === "soun") tracks.audio += 1;
      }
      return tracks;
    }

    offset += size;
  }

  return null;
}

/** Whether an MP4 header declares an audio track; null when undetermined. */
export function findAudioTrackInMp4Header(header: Buffer): boolean | null {
  const tracks = readMp4Tracks(header);
  return tracks === null ? null : tracks.audio > 0;
}

/** Fetches just enough of the file to inspect its track list. */
export async function probeMp4Tracks(url: string): Promise<Mp4Tracks | null> {
  try {
    const response = await fetch(url, {
      headers: { Range: `bytes=0-${AUDIO_PROBE_BYTES - 1}` },
      signal: AbortSignal.timeout(AUDIO_PROBE_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    return readMp4Tracks(Buffer.from(await response.arrayBuffer()));
  } catch {
    // A probe is an optimisation, never a reason to fail the request.
    return null;
  }
}

/** Whether the file at `url` contains an audio track; null when undetermined. */
export async function probeHasAudioTrack(url: string): Promise<boolean | null> {
  const tracks = await probeMp4Tracks(url);
  return tracks === null ? null : tracks.audio > 0;
}

/** One inspected candidate, kept together for logging and ranking. */
interface RankedCandidate {
  url: string;
  tracks: Mp4Tracks | null;
  /** False for the DASH streams captured off the page, which may be audio-only. */
  progressive: boolean;
}

/** Describes a candidate without leaking its signed query string. */
function describe({ url, tracks }: RankedCandidate): string {
  let host = "unparseable";
  let tag = "?";
  try {
    const parsed = new URL(url);
    host = parsed.hostname;
    // efg carries public encoding metadata (the rendition's codec profile),
    // not anything bearer-like. Only that one field is read, and only when it
    // is a string, so nothing else from the query can reach the log.
    const efg = parsed.searchParams.get("efg");
    if (efg) {
      const { vencode_tag: vencodeTag } = JSON.parse(Buffer.from(efg, "base64").toString());
      if (typeof vencodeTag === "string") tag = vencodeTag.slice(0, 80);
    }
  } catch {
    // Diagnostics must never throw.
  }
  const composition = tracks === null ? "unknown" : `${tracks.video}v/${tracks.audio}a`;
  return `${host} [${tag}] ${composition}`;
}

/**
 * Picks the media URL to hand back, preferring one whose bytes actually
 * contain both a video and an audio track.
 *
 * Instagram's `video_versions` entries are indistinguishable from their
 * metadata - same `type`, same `vencode_tag`, same decoded asset name - yet
 * the same reel can yield a muxed rendition on one network and a silent one
 * on another. Picking by index is what shipped silent downloads; picking by
 * what the file actually contains is the only check that holds everywhere.
 *
 * The DASH streams captured from the page are a last resort and are probed
 * too, because `content-type` does not identify them: Instagram serves its
 * audio-only DASH representation as `video/mp4`, so trusting the header can
 * hand the user a file with no picture at all. Anything with no video track
 * is therefore never returned as the video.
 *
 * Order of preference: a file with both tracks; then a progressive entry that
 * could not be probed (it is a video rendition either way, and might carry
 * audio); then any file known to have a video track; and only then a captured
 * stream that could not be probed.
 */
export async function selectVideoUrlWithAudio(
  progressiveCandidates: string[],
  capturedCandidates: string[]
): Promise<string | null> {
  const { muxed, chosen } = await rankVideoCandidates(progressiveCandidates, capturedCandidates);
  return muxed ?? chosen;
}

/** What the page offers as a video, and whether the picked file has sound. */
export interface VideoSelection {
  url: string;
  /** Set only when `url` has no audio track and a separate stream was found. */
  audioUrl?: string;
  /**
   * True only when `url` was measured to have no audio track and no
   * separate stream was found: the download will be silent. "Could not
   * tell" is false - an unprobeable rendition may well carry sound.
   */
  silent: boolean;
}

/**
 * selectVideoUrlWithAudio(), plus a fallback for when no file has both
 * tracks: pair the best video-only file with a separate audio-only stream -
 * from the DASH manifest first, then any captured stream measured to be
 * audio-only - for the download service to join. Each audio candidate is
 * probed: it must hold an audio track and no video, so a mislabelled
 * stream can never stand in for the sound.
 */
export async function selectVideoAndAudio(
  progressiveCandidates: string[],
  capturedCandidates: string[],
  dashAudioCandidates: string[]
): Promise<VideoSelection | null> {
  const { muxed, chosen, ranked } = await rankVideoCandidates(progressiveCandidates, capturedCandidates);
  if (muxed) return { url: muxed, silent: false };
  if (!chosen) return null;

  let audioUrl: string | undefined;
  for (const url of dashAudioCandidates.slice(0, MAX_AUDIO_PROBES)) {
    const tracks = await probeMp4Tracks(url);
    if (tracks !== null && tracks.video === 0 && tracks.audio > 0) {
      audioUrl = url;
      break;
    }
  }
  audioUrl ??= ranked.find(
    (entry) => entry.tracks !== null && entry.tracks.video === 0 && entry.tracks.audio > 0
  )?.url;

  if (audioUrl) {
    console.warn("[mediaExtraction] pairing the video-only file with a separate audio stream; the download will join them");
    return { url: chosen, audioUrl, silent: false };
  }

  const chosenTracks = ranked.find((entry) => entry.url === chosen)?.tracks ?? null;
  const silent = chosenTracks !== null && chosenTracks.audio === 0;
  console.warn(
    `[mediaExtraction] no separate audio stream found either (${dashAudioCandidates.length} in the DASH manifest); ` +
      (silent ? "the video will be silent" : "the chosen file could not be probed, so it may still carry sound")
  );
  return { url: chosen, silent };
}

/** Instagram's own word on whether this page may play sound. */
export interface AudioAvailability {
  hasAudio: boolean | null;
  /** True when Instagram muted the sound for this requester - not "the post has none". */
  shouldMuteAudio: boolean | null;
  muteReason: string | null;
  /** Licensed music from Instagram's library is attached. */
  licensedMusic: boolean;
}

/**
 * Reads `has_audio`, `should_mute_audio` and `should_mute_audio_reason`
 * from the page data, and whether licensed music is attached.
 *
 * Measured 2026-10-16 on a reel with licensed music: from India,
 * `should_mute_audio=false`, a muxed rendition and an audio stream. From
 * production in the US, `has_audio=false should_mute_audio=true`, reason
 * "This music can't be played due to recent licensing changes with the
 * rights holder.", and only video-only renditions with no audio stream at
 * all. This is how "the post has no sound" is told apart from "Instagram
 * muted it for this server's country" - the case region recovery exists for.
 */
export async function readAudioAvailability(page: Page): Promise<AudioAvailability> {
  // Best-effort, like the log line this replaced: flags that cannot be read
  // are unknown flags, never a failed scrape. String body for the same
  // reason as readPageMeta().
  return page.evaluate<AudioAvailability>(`
    (() => {
      const found = {};
      const keys = ["has_audio", "should_mute_audio", "should_mute_audio_reason"];
      let licensedMusic = false;
      function walk(node, depth) {
        if (depth > 18 || node === null || typeof node !== "object") return;
        for (const key of Object.keys(node)) {
          if (keys.includes(key) && !(key in found)) found[key] = node[key];
          if (key === "music_asset_info" && node[key]) licensedMusic = true;
          walk(node[key], depth + 1);
        }
      }
      for (const script of document.querySelectorAll('script[type="application/json"][data-sjs]')) {
        try { walk(JSON.parse(script.textContent || ""), 0); } catch {}
      }
      const bool = (value) => (typeof value === "boolean" ? value : null);
      const reason = found.should_mute_audio_reason;
      return {
        hasAudio: bool(found.has_audio),
        shouldMuteAudio: bool(found.should_mute_audio),
        muteReason: typeof reason === "string" && reason.trim() ? reason.trim().slice(0, 200) : null,
        licensedMusic,
      };
    })()
  `).catch(() => ({ hasAudio: null, shouldMuteAudio: null, muteReason: null, licensedMusic: false }));
}

/** For logs: booleans, the short reason and the music flag - never a URL. */
export function formatAudioAvailability(availability: AudioAvailability): string {
  const reason = availability.muteReason === null ? "none" : JSON.stringify(availability.muteReason);
  return (
    `instagram says: has_audio=${availability.hasAudio} should_mute_audio=${availability.shouldMuteAudio} ` +
    `should_mute_audio_reason=${reason} licensed_music=${availability.licensedMusic}`
  );
}

interface CandidateRanking {
  /** The first candidate with both a video and an audio track. */
  muxed: string | null;
  /** The best fallback when there is no muxed candidate. */
  chosen: string | null;
  ranked: RankedCandidate[];
}

async function rankVideoCandidates(
  progressiveCandidates: string[],
  capturedCandidates: string[]
): Promise<CandidateRanking> {
  const ranked: RankedCandidate[] = [];

  // Progressive renditions first: they are h264+aac and play anywhere, while
  // the captured DASH streams are vp9 and video-only in every reel measured.
  const ordered = [
    ...progressiveCandidates.slice(0, MAX_AUDIO_PROBES).map((url) => ({ url, progressive: true })),
    ...capturedCandidates.slice(0, MAX_AUDIO_PROBES).map((url) => ({ url, progressive: false })),
  ];

  for (const { url, progressive } of ordered) {
    const tracks = await probeMp4Tracks(url);
    if (tracks !== null && tracks.video > 0 && tracks.audio > 0) return { muxed: url, chosen: url, ranked };
    ranked.push({ url, tracks, progressive });
  }

  // An unprobeable progressive entry still comes from video_versions, so it is
  // a video rendition that might carry audio - worth more than one measured to
  // have none. An unprobeable captured stream is ranked last instead, because
  // it could be the audio-only DASH representation, which is not a video at all.
  const chosen =
    ranked.find((entry) => entry.progressive && entry.tracks === null) ??
    ranked.find((entry) => entry.tracks !== null && entry.tracks.video > 0) ??
    ranked.find((entry) => entry.tracks === null) ??
    null;

  if (ranked.length > 0) {
    // This is the state that silently shipped soundless downloads. Log what
    // each candidate actually was - host, encode tag and track counts, never
    // the signed URL - so the next occurrence is diagnosable from the logs.
    console.warn(
      `[mediaExtraction] no candidate had both video and audio; inspected ${ranked.length}: ` +
        ranked.map(describe).join(" | ")
    );
  }

  return { muxed: null, chosen: chosen?.url ?? null, ranked };
}
export function stripByteRangeParams(videoUrl: string): string {
  const parsed = new URL(videoUrl);
  parsed.searchParams.delete("bytestart");
  parsed.searchParams.delete("byteend");
  return parsed.toString();
}

export interface FullResImageMatch {
  url: string;
  width: number;
  height: number;
}

/**
 * Finds the real, uncropped rendition of the post's cover image by
 * matching the CDN media ID shared between og:image and the actual <img>
 * element Instagram renders for the post (e.g. alt="Photo by X on DATE.").
 * Confirmed live 2026-08-04: for a post whose og:image was a 640x640
 * crop, this found the same asset rendered at 1350x1688 (its real
 * resolution) via a matching media ID in the src. Returns null if no DOM
 * match is found (e.g. video posts, where the post's <img> isn't the
 * cover photo) - callers should fall back to og:image in that case.
 */
export async function findFullResolutionImage(
  page: Page,
  ogImageUrl: string
): Promise<FullResImageMatch | null> {
  const mediaId = extractMediaAssetId(ogImageUrl);
  if (!mediaId) return null;

  const candidates = await page.evaluate<FullResImageMatch[]>(`
    Array.from(document.querySelectorAll("img"))
      .filter((img) => img.src.includes(${JSON.stringify(mediaId)}))
      .map((img) => ({ url: img.src, width: img.naturalWidth, height: img.naturalHeight }))
  `);

  if (candidates.length === 0) return null;

  return candidates.reduce((largest, candidate) =>
    candidate.width * candidate.height > largest.width * largest.height ? candidate : largest
  );
}

/**
 * Instagram CDN image filenames look like {assetId}_{containerId}_{hash}_n.jpg
 * - the same two leading numeric segments are shared across every
 * resolution/crop rendition of the same underlying photo.
 */
export function extractMediaAssetId(cdnUrl: string): string | null {
  const filename = new URL(cdnUrl).pathname.split("/").pop() ?? "";
  const match = filename.match(/^(\d+_\d+)_/);
  return match?.[1] ?? null;
}

const COVER_DATE_PATTERN = /\bon\s+([A-Za-z]+\s+\d{1,2},\s*\d{4})/;

/**
 * og:description follows "N likes, M comments - username on <DATE>: ...".
 * Used to tell this post's own carousel slides apart from unrelated
 * "more posts from this account" thumbnails elsewhere on the page, which
 * share the same alt-text pattern but a different date.
 */
export function extractCoverDate(ogDescription: string | null): string | null {
  if (!ogDescription) return null;
  const match = ogDescription.match(COVER_DATE_PATTERN);
  const rawDate = match?.[1];
  return rawDate ? normalizeDateText(rawDate) : null;
}

/**
 * Confirmed live 2026-08-04: og:description and <img alt> dates can
 * disagree on zero-padding for the same post - "August 9, 2025" (from
 * og:description) vs. "August 09, 2025" (from an <img alt>) - so an exact
 * substring match silently drops real slides. Stripping a single leading
 * zero from any day-of-month number normalizes both to the same text.
 */
export function normalizeDateText(rawDate: string): string {
  return rawDate.replace(/\b0(\d)\b/, "$1").replace(/,/g, "").trim().toLowerCase();
}

export interface CarouselSlideCandidate {
  url: string;
  width: number;
  height: number;
  alt: string;
}

/**
 * Reads whatever "Photo by .../Video by ..." <img> elements are currently
 * in the DOM (Instagram preloads a window of carousel slides - confirmed
 * live) - unfiltered here so date-normalization (see normalizeDateText())
 * can run on the Node side against each candidate's own alt text, not
 * inside the injected browser script.
 */
export function readPostImages(page: Page): Promise<CarouselSlideCandidate[]> {
  return page.evaluate<CarouselSlideCandidate[]>(`
    Array.from(document.querySelectorAll("img"))
      .filter((img) => /^Photo by |^Video by /.test(img.alt || ""))
      .map((img) => ({ url: img.src, width: img.naturalWidth, height: img.naturalHeight, alt: img.alt }))
  `);
}

export function matchesCoverDate(alt: string, normalizedCoverDate: string): boolean {
  const match = alt.match(COVER_DATE_PATTERN);
  const rawDate = match?.[1];
  return rawDate ? normalizeDateText(rawDate) === normalizedCoverDate : false;
}

/**
 * Confirmed live 2026-08-04 against 9 real carousel posts: Instagram
 * preloads carousel slide <img> elements straight into the DOM - no click
 * needed to read the first ~2. Every real example found this session had
 * exactly 2 slides, so clicking "Next" further (to test whether a sliding
 * preload window reveals slide 3+) is implemented as a reasonable
 * extrapolation but is NOT itself confirmed - flagged honestly in
 * docs/KNOWN_ISSUES.md rather than claimed as verified.
 *
 * `force: true` on the click: Instagram's anonymous-visitor signup nudge
 * dialog (role="dialog", "Sign up for Instagram to stay in the loop.")
 * overlaps the Next button and blocks a normal click with a 30s
 * actionability timeout - confirmed live via Playwright's own trace. For
 * an authenticated session this dialog likely never appears at all (it's
 * specifically the anonymous-visitor nudge), but force:true is harmless
 * either way and keeps this function identical for both callers.
 */
export async function collectCarouselSlides(
  page: Page,
  coverDate: string | null,
  primaryImageUrl: string
): Promise<string[]> {
  if (!coverDate) return [primaryImageUrl];
  const normalizedCoverDate: string = coverDate;

  const bestByAssetId = new Map<string, CarouselSlideCandidate>();
  const assetOrder: string[] = [];

  function mergeCandidates(candidates: CarouselSlideCandidate[]) {
    for (const candidate of candidates) {
      if (!matchesCoverDate(candidate.alt, normalizedCoverDate)) continue;

      const assetId = extractMediaAssetId(candidate.url);
      if (!assetId) continue;

      const existing = bestByAssetId.get(assetId);
      if (!existing) {
        assetOrder.push(assetId);
        bestByAssetId.set(assetId, candidate);
      } else if (candidate.width * candidate.height > existing.width * existing.height) {
        bestByAssetId.set(assetId, candidate);
      }
    }
  }

  mergeCandidates(await readPostImages(page));
  if (assetOrder.length === 0) return [primaryImageUrl];

  while (assetOrder.length < MAX_CAROUSEL_SLIDES) {
    const nextButton = page.locator('button[aria-label="Next" i]').first();
    const isNextVisible = await nextButton.isVisible().catch(() => false);
    if (!isNextVisible) break;

    await nextButton.click({ force: true }).catch(() => {});
    await page.waitForTimeout(SLIDE_CLICK_WAIT_MS);

    const beforeCount = assetOrder.length;
    mergeCandidates(await readPostImages(page));
    if (assetOrder.length === beforeCount) break;
  }

  return assetOrder.map((assetId) => bestByAssetId.get(assetId)!.url);
}

// The trailing `: "caption"` group is optional - confirmed live 2026-08-06
// against real reels that a post with no caption at all makes Instagram
// omit that whole segment from og:description, leaving just
// "N likes, M comments - username on <date>" with no colon. The previous
// pattern required a colon unconditionally, so it failed to match at all
// on those posts - losing the username along with the (nonexistent)
// caption, which is what caused PreviewCard's header to show "@unknown"
// while the raw, unparsed og:description (still containing the real
// username as plain text) fell through to the caption paragraph instead.
const OG_DESCRIPTION_PATTERN = /-\s*([a-zA-Z0-9_.]+)\s+on\s+[^:\n]+?(?::\s*"?([\s\S]*))?$/;

export function parseOgDescription(ogDescription: string | null): {
  username: string;
  caption: string;
} {
  if (!ogDescription) return { username: "", caption: "" };

  const match = ogDescription.match(OG_DESCRIPTION_PATTERN);
  if (!match) return { username: "", caption: ogDescription.trim() };

  const username = match[1] ?? "";
  const captionRaw = match[2] ?? "";
  return { username, caption: captionRaw.replace(/"\s*\.?\s*$/, "").trim() };
}
