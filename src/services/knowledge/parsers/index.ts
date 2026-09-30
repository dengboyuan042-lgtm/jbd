import type { DocumentOutlineItem } from '@/server/db/schema';
import { detectLanguage, splitSentences } from '@/services/ai/nlp';

export type ParsedPage = {
  /** 1-based */
  page: number;
  text: string;
  heading?: string;
};

export type ParsedDocument = {
  parser: string;
  text: string;
  pages: ParsedPage[];
  pageCount?: number;
  outline: DocumentOutlineItem[];
  language: string;
  metadata: Record<string, unknown>;
};

export type Parser = {
  id: string;
  extensions: string[];
  mimeTypes: string[];
  parse(input: { buffer: Buffer; filename: string; mimeType: string }): Promise<ParsedDocument>;
};

/* ─────────────────────────────── PDF ──────────────────────────────────── */

const pdfParser: Parser = {
  id: 'pdf',
  extensions: ['pdf'],
  mimeTypes: ['application/pdf'],
  async parse({ buffer }) {
    const { extractText, getDocumentProxy } = await import('unpdf');
    const data = new Uint8Array(buffer);
    const pdf = await getDocumentProxy(data);
    const { text: pageTexts, totalPages } = await extractText(pdf, {
      mergePages: false,
    });

    const pages: ParsedPage[] = (pageTexts as string[]).map((raw, i) => ({
      page: i + 1,
      text: normalizeWhitespace(raw),
      heading: firstHeading(raw),
    }));

    const outline: DocumentOutlineItem[] = [];
    try {
      const rawOutline = await pdf.getOutline();
      for (const item of rawOutline ?? []) {
        outline.push({ title: item.title, level: 1 });
        for (const child of item.items ?? []) {
          outline.push({ title: child.title, level: 2 });
        }
      }
    } catch {
      /* outline is optional */
    }
    if (!outline.length) {
      for (const page of pages) {
        if (page.heading) outline.push({ title: page.heading, level: 1, page: page.page });
      }
    }

    let metadata: Record<string, unknown> = {};
    try {
      const meta = await pdf.getMetadata();
      metadata = (meta?.info as Record<string, unknown>) ?? {};
    } catch {
      /* metadata is optional */
    }

    const text = pages.map((p) => p.text).join('\n\n');
    return {
      parser: 'pdf',
      text,
      pages,
      pageCount: totalPages,
      outline: outline.slice(0, 200),
      language: detectLanguage(text),
      metadata,
    };
  },
};

/* ────────────────────────────── DOCX ──────────────────────────────────── */

const docxParser: Parser = {
  id: 'docx',
  extensions: ['docx'],
  mimeTypes: [
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ],
  async parse({ buffer }) {
    const mammoth = (await import('mammoth')).default;
    const { value: html } = await mammoth.convertToHtml({ buffer });
    const { load } = await import('cheerio');
    const $ = load(html);

    const outline: DocumentOutlineItem[] = [];
    $('h1, h2, h3, h4').each((_, el) => {
      const level = Number(el.tagName.slice(1));
      const title = $(el).text().trim();
      if (title) outline.push({ title, level });
    });

    const blocks: string[] = [];
    $('p, li, h1, h2, h3, h4, h5, h6, td').each((_, el) => {
      const text = $(el).text().trim();
      if (text) blocks.push(text);
    });

    const text = blocks.join('\n\n');
    return {
      parser: 'docx',
      text,
      pages: paginateByLength(text),
      outline,
      language: detectLanguage(text),
      metadata: {},
    };
  },
};

/* ────────────────────────────── PPTX ──────────────────────────────────── */

const pptxParser: Parser = {
  id: 'pptx',
  extensions: ['pptx'],
  mimeTypes: [
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  ],
  async parse({ buffer }) {
    const JSZip = (await import('jszip')).default;
    const { XMLParser } = await import('fast-xml-parser');
    const zip = await JSZip.loadAsync(buffer);
    const parser = new XMLParser({ ignoreAttributes: false });

    const slideFiles = Object.keys(zip.files)
      .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
      .sort(
        (a, b) =>
          Number(a.match(/slide(\d+)/)![1]) - Number(b.match(/slide(\d+)/)![1]),
      );

    const pages: ParsedPage[] = [];
    const outline: DocumentOutlineItem[] = [];

    for (let i = 0; i < slideFiles.length; i++) {
      const xml = await zip.file(slideFiles[i])!.async('string');
      const doc = parser.parse(xml);
      const texts: string[] = [];
      collectStrings(doc, 'a:t', texts);
      const slideText = texts.map((t) => t.trim()).filter(Boolean).join('\n');
      const heading = texts[0]?.trim();
      pages.push({ page: i + 1, text: slideText, heading });
      if (heading) outline.push({ title: heading, level: 1, page: i + 1 });
    }

    const text = pages
      .map((p) => `Slide ${p.page}${p.heading ? `: ${p.heading}` : ''}\n${p.text}`)
      .join('\n\n');

    return {
      parser: 'pptx',
      text,
      pages,
      pageCount: pages.length,
      outline,
      language: detectLanguage(text),
      metadata: { slides: pages.length },
    };
  },
};

/* ────────────────────────────── XLSX/CSV ──────────────────────────────── */

const sheetParser: Parser = {
  id: 'sheet',
  extensions: ['xlsx', 'xls', 'csv'],
  mimeTypes: [
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'text/csv',
  ],
  async parse({ buffer }) {
    const XLSX = await import('xlsx');
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const pages: ParsedPage[] = [];
    const outline: DocumentOutlineItem[] = [];

    workbook.SheetNames.forEach((name, i) => {
      const sheet = workbook.Sheets[name];
      const csv = XLSX.utils.sheet_to_csv(sheet, { blankrows: false });
      pages.push({ page: i + 1, text: `# ${name}\n${csv}`, heading: name });
      outline.push({ title: name, level: 1, page: i + 1 });
    });

    const text = pages.map((p) => p.text).join('\n\n');
    return {
      parser: 'sheet',
      text,
      pages,
      pageCount: pages.length,
      outline,
      language: detectLanguage(text),
      metadata: { sheets: workbook.SheetNames },
    };
  },
};

/* ────────────────────────── Markdown / plain text ─────────────────────── */

const textParser: Parser = {
  id: 'text',
  extensions: ['md', 'markdown', 'txt', 'text', 'json', 'log'],
  mimeTypes: ['text/plain', 'text/markdown', 'application/json'],
  async parse({ buffer }) {
    const text = buffer.toString('utf8');
    const outline: DocumentOutlineItem[] = [];
    let offset = 0;
    for (const line of text.split('\n')) {
      const match = line.match(/^(#{1,4})\s+(.+)$/);
      if (match) outline.push({ title: match[2].trim(), level: match[1].length, offset });
      offset += line.length + 1;
    }
    return {
      parser: 'text',
      text,
      // Markdown has real structure — section on headings so citations point
      // at a heading rather than an arbitrary character offset.
      pages: outline.length ? paginateByHeading(text) : paginateByLength(text),
      outline,
      language: detectLanguage(text),
      metadata: {},
    };
  },
};

/* ──────────────────────────────── images ─────────────────────────────── */

/**
 * Images are stored and indexed by their metadata. Full OCR requires a vision
 * model or OCR engine; when `AI_DRIVER` points at a vision-capable provider
 * the ingest pipeline sends the image for description instead.
 */
const imageParser: Parser = {
  id: 'image',
  extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'heic'],
  mimeTypes: ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/bmp'],
  async parse({ buffer, filename }) {
    const dimensions = readImageSize(buffer);
    const text = [
      `Image: ${filename}`,
      dimensions ? `Dimensions: ${dimensions.width}×${dimensions.height}` : '',
    ]
      .filter(Boolean)
      .join('\n');
    return {
      parser: 'image',
      text,
      pages: [{ page: 1, text }],
      outline: [],
      language: 'en',
      metadata: { ...dimensions, requiresVision: true },
    };
  },
};

/* ─────────────────────────────── registry ────────────────────────────── */

const PARSERS: Parser[] = [
  pdfParser,
  docxParser,
  pptxParser,
  sheetParser,
  textParser,
  imageParser,
];

export const MEDIA_EXTENSIONS = ['mp3', 'wav', 'm4a', 'ogg', 'webm', 'mp4', 'mov'];

export function parserFor(filename: string, mimeType: string): Parser | null {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  return (
    PARSERS.find((p) => p.extensions.includes(ext)) ??
    PARSERS.find((p) => p.mimeTypes.includes(mimeType)) ??
    (mimeType.startsWith('text/') ? textParser : null)
  );
}

export function supportedExtensions(): string[] {
  return [...new Set([...PARSERS.flatMap((p) => p.extensions), ...MEDIA_EXTENSIONS])];
}

export async function parseDocument(input: {
  buffer: Buffer;
  filename: string;
  mimeType: string;
}): Promise<ParsedDocument> {
  const parser = parserFor(input.filename, input.mimeType);
  if (!parser) {
    throw new Error(
      `No parser for "${input.filename}" (${input.mimeType}). Supported: ${supportedExtensions().join(', ')}`,
    );
  }
  return parser.parse(input);
}

/* ─────────────────────────────── helpers ─────────────────────────────── */

function normalizeWhitespace(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function firstHeading(text: string): string | undefined {
  const line = text
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l.length > 3 && l.length < 90);
  return line;
}

/** Documents without intrinsic pages get synthetic ones for stable citations. */
function paginateByLength(text: string, perPage = 2600): ParsedPage[] {
  const sentences = splitSentences(text);
  if (!sentences.length) return text ? [{ page: 1, text }] : [];
  const pages: ParsedPage[] = [];
  let buffer = '';
  for (const sentence of sentences) {
    if (buffer.length + sentence.length > perPage && buffer) {
      pages.push({ page: pages.length + 1, text: buffer.trim() });
      buffer = '';
    }
    buffer += `${sentence} `;
  }
  if (buffer.trim()) pages.push({ page: pages.length + 1, text: buffer.trim() });
  return pages;
}

/** Split Markdown into one page per heading block. */
function paginateByHeading(text: string): ParsedPage[] {
  const pages: ParsedPage[] = [];
  let heading: string | undefined;
  let buffer: string[] = [];

  const flush = () => {
    const body = buffer.join('\n').trim();
    if (body) pages.push({ page: pages.length + 1, text: body, heading });
    buffer = [];
  };

  for (const line of text.split('\n')) {
    const match = line.match(/^(#{1,3})\s+(.+)$/);
    if (match) {
      flush();
      heading = match[2].trim();
    }
    buffer.push(line);
  }
  flush();
  return pages.length ? pages : paginateByLength(text);
}

function collectStrings(node: unknown, key: string, out: string[]): void {
  if (node == null) return;
  if (Array.isArray(node)) {
    for (const item of node) collectStrings(item, key, out);
    return;
  }
  if (typeof node !== 'object') return;
  for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
    if (k === key) {
      if (typeof v === 'string') out.push(v);
      else if (Array.isArray(v)) v.forEach((x) => typeof x === 'string' && out.push(x));
      else if (v && typeof v === 'object' && '#text' in (v as object)) {
        out.push(String((v as Record<string, unknown>)['#text']));
      }
    } else {
      collectStrings(v, key, out);
    }
  }
}

/** Header-only image dimension reader for PNG / JPEG / GIF / WEBP. */
function readImageSize(buffer: Buffer): { width: number; height: number } | null {
  try {
    if (buffer.subarray(0, 8).toString('hex') === '89504e470d0a1a0a') {
      return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
    }
    if (buffer[0] === 0xff && buffer[1] === 0xd8) {
      let offset = 2;
      while (offset < buffer.length) {
        if (buffer[offset] !== 0xff) break;
        const marker = buffer[offset + 1];
        const length = buffer.readUInt16BE(offset + 2);
        if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
          return {
            height: buffer.readUInt16BE(offset + 5),
            width: buffer.readUInt16BE(offset + 7),
          };
        }
        offset += 2 + length;
      }
    }
    if (buffer.subarray(0, 3).toString('ascii') === 'GIF') {
      return { width: buffer.readUInt16LE(6), height: buffer.readUInt16LE(8) };
    }
    if (buffer.subarray(8, 12).toString('ascii') === 'WEBP') {
      if (buffer.subarray(12, 16).toString('ascii') === 'VP8X') {
        return {
          width: 1 + buffer.readUIntLE(24, 3),
          height: 1 + buffer.readUIntLE(27, 3),
        };
      }
    }
  } catch {
    /* best effort */
  }
  return null;
}
