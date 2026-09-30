import { detectLanguage } from '@/services/ai/nlp';
import type { ParsedDocument, ParsedPage } from './parsers';

export type WebImport = ParsedDocument & {
  title: string;
  url: string;
  kind: 'webpage' | 'youtube';
  /** present for media: transcript cues with timestamps */
  cues?: { start: number; end: number; text: string }[];
  siteName?: string;
  author?: string;
  publishedAt?: string;
};

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

export function youtubeId(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname === 'youtu.be') return u.pathname.slice(1) || null;
    if (!/(^|\.)youtube\.com$/.test(u.hostname)) return null;
    if (u.pathname === '/watch') return u.searchParams.get('v');
    const m = u.pathname.match(/^\/(?:embed|shorts|live)\/([\w-]{6,})/);
    return m?.[1] ?? null;
  } catch {
    return null;
  }
}

export async function importUrl(rawUrl: string): Promise<WebImport> {
  const url = normalizeUrl(rawUrl);
  const videoId = youtubeId(url);
  return videoId ? importYouTube(url, videoId) : importWebpage(url);
}

function normalizeUrl(input: string): string {
  const trimmed = input.trim();
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const url = new URL(withScheme);
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('Only http and https URLs can be imported.');
  }
  return url.toString();
}

/* ─────────────────────────────── web pages ───────────────────────────── */

async function importWebpage(url: string): Promise<WebImport> {
  const res = await fetch(url, {
    headers: { 'user-agent': UA, accept: 'text/html,application/xhtml+xml' },
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`Could not fetch ${url} — HTTP ${res.status}`);
  const html = await res.text();

  const { load } = await import('cheerio');
  const $ = load(html);

  const meta = (names: string[]) => {
    for (const name of names) {
      const v =
        $(`meta[property="${name}"]`).attr('content') ??
        $(`meta[name="${name}"]`).attr('content');
      if (v) return v.trim();
    }
    return undefined;
  };

  const title =
    meta(['og:title', 'twitter:title']) ?? $('title').first().text().trim() ?? url;

  $('script, style, noscript, iframe, svg, form, nav, footer, header, aside').remove();
  $('[aria-hidden="true"], .advertisement, .ads, .cookie, .newsletter').remove();

  // Density-based main-content selection.
  const candidates = ['article', 'main', '[role="main"]', '.post-content', '.article-body', '#content', 'body'];
  let best: ReturnType<typeof $> = $('body');
  let bestScore = 0;
  for (const selector of candidates) {
    const el: ReturnType<typeof $> = $(selector).first();
    if (!el.length) continue;
    const text = el.text().replace(/\s+/g, ' ').trim();
    const links = el.find('a').text().length;
    const score = text.length - links * 1.5;
    if (score > bestScore) {
      bestScore = score;
      best = el;
    }
  }

  const outline: ParsedDocument['outline'] = [];
  best.find('h1, h2, h3').each((_, el) => {
    const level = Number((el as { tagName: string }).tagName.slice(1));
    const text = $(el).text().trim();
    if (text) outline.push({ title: text, level });
  });

  const blocks: string[] = [];
  best.find('h1, h2, h3, h4, p, li, blockquote, pre, td').each((_, el) => {
    const t = $(el).text().replace(/\s+/g, ' ').trim();
    if (t.length > 1) blocks.push(t);
  });
  const text = dedupeLines(blocks).join('\n\n');

  if (text.length < 120) {
    throw new Error(
      'That page returned almost no readable text — it may require JavaScript or be behind a login.',
    );
  }

  const pages: ParsedPage[] = sectionise(text, outline.map((o) => o.title));

  return {
    parser: 'web',
    kind: 'webpage',
    url,
    title,
    text,
    pages,
    pageCount: pages.length,
    outline,
    language: meta(['og:locale'])?.slice(0, 2) ?? detectLanguage(text),
    siteName: meta(['og:site_name']) ?? new URL(url).hostname,
    author: meta(['author', 'article:author']),
    publishedAt: meta(['article:published_time', 'date']),
    metadata: {
      description: meta(['og:description', 'description']),
      image: meta(['og:image']),
    },
  };
}

function dedupeLines(lines: string[]): string[] {
  const seen = new Set<string>();
  return lines.filter((line) => {
    const key = line.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function sectionise(text: string, headings: string[]): ParsedPage[] {
  if (!headings.length) {
    const paragraphs = text.split('\n\n');
    const pages: ParsedPage[] = [];
    let buffer: string[] = [];
    for (const p of paragraphs) {
      buffer.push(p);
      if (buffer.join('\n\n').length > 2400) {
        pages.push({ page: pages.length + 1, text: buffer.join('\n\n') });
        buffer = [];
      }
    }
    if (buffer.length) pages.push({ page: pages.length + 1, text: buffer.join('\n\n') });
    return pages;
  }

  const pages: ParsedPage[] = [];
  let remaining = text;
  let currentHeading: string | undefined;
  for (const heading of headings) {
    const index = remaining.indexOf(heading);
    if (index === -1) continue;
    const before = remaining.slice(0, index).trim();
    if (before) {
      pages.push({ page: pages.length + 1, text: before, heading: currentHeading });
    }
    remaining = remaining.slice(index);
    currentHeading = heading;
  }
  if (remaining.trim()) {
    pages.push({ page: pages.length + 1, text: remaining.trim(), heading: currentHeading });
  }
  return pages.length ? pages : [{ page: 1, text }];
}

/* ─────────────────────────────── YouTube ─────────────────────────────── */

async function importYouTube(url: string, videoId: string): Promise<WebImport> {
  const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const res = await fetch(watchUrl, {
    headers: { 'user-agent': UA, 'accept-language': 'en-US,en;q=0.9' },
  });
  if (!res.ok) throw new Error(`Could not load the video page — HTTP ${res.status}`);
  const html = await res.text();

  const title =
    html.match(/<meta name="title" content="([^"]+)"/)?.[1] ??
    html.match(/<title>([^<]+)<\/title>/)?.[1]?.replace(/ - YouTube$/, '') ??
    'YouTube video';
  const author = html.match(/"ownerChannelName":"([^"]+)"/)?.[1];
  const lengthSeconds = Number(html.match(/"lengthSeconds":"(\d+)"/)?.[1] ?? 0);

  const cues = await fetchYouTubeCaptions(html);
  if (!cues.length) {
    throw new Error(
      'No captions are available for this video. Download the audio and upload it to transcribe it instead.',
    );
  }

  // 45-second reading blocks keep timestamp citations precise but readable.
  const pages: ParsedPage[] = [];
  let buffer: typeof cues = [];
  const flush = () => {
    if (!buffer.length) return;
    pages.push({
      page: pages.length + 1,
      text: buffer.map((c) => c.text).join(' '),
      heading: formatClock(buffer[0].start),
    });
    buffer = [];
  };
  for (const cue of cues) {
    buffer.push(cue);
    if (cue.end - buffer[0].start > 45) flush();
  }
  flush();

  const text = cues.map((c) => c.text).join(' ');

  return {
    parser: 'youtube',
    kind: 'youtube',
    url: watchUrl,
    title: decodeEntities(title),
    text,
    pages,
    pageCount: pages.length,
    outline: [],
    language: detectLanguage(text),
    cues,
    author: author ? decodeEntities(author) : undefined,
    siteName: 'YouTube',
    metadata: { videoId, durationSec: lengthSeconds || cues.at(-1)?.end },
  };
}

async function fetchYouTubeCaptions(html: string) {
  const match = html.match(/"captionTracks":(\[.*?\])/);
  if (!match) return [];
  let tracks: { baseUrl: string; languageCode: string; kind?: string }[];
  try {
    tracks = JSON.parse(match[1].replace(/\\u0026/g, '&').replace(/\\"/g, '"'));
  } catch {
    return [];
  }
  const track =
    tracks.find((t) => t.languageCode?.startsWith('en') && t.kind !== 'asr') ??
    tracks.find((t) => t.languageCode?.startsWith('en')) ??
    tracks[0];
  if (!track?.baseUrl) return [];

  const res = await fetch(track.baseUrl, { headers: { 'user-agent': UA } });
  if (!res.ok) return [];
  const xml = await res.text();

  const cues: { start: number; end: number; text: string }[] = [];
  const re = /<text start="([\d.]+)" dur="([\d.]+)"[^>]*>([\s\S]*?)<\/text>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const start = Number(m[1]);
    const dur = Number(m[2]);
    const text = decodeEntities(m[3].replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
    if (text) cues.push({ start, end: start + dur, text });
  }
  return cues;
}

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

function formatClock(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const pad = (n: number) => String(n).padStart(2, '0');
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}
