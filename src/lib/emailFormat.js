const { parse: parseHtml } = require('node-html-parser');

const MAX_PAGE_CHARS = 3500; // leaves headroom under Telegram's 4096 cap for the header/footer we add around it
const COMPACT_SUBJECT_MAX = 80;

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeAttr(str) {
  return escapeHtml(str).replace(/"/g, '&quot;');
}

const BLOCK_TAGS = new Set(['p', 'div', 'tr', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'table', 'blockquote']);
const SKIP_TAGS = new Set(['script', 'style', 'head', 'title', 'img']);
const BOLD_TAGS = new Set(['b', 'strong']);
const ITALIC_TAGS = new Set(['i', 'em']);
const STRIKE_TAGS = new Set(['s', 'strike', 'del']);

/** Recursively converts a parsed HTML node tree into Telegram-safe HTML
 * (only <b>, <i>, <u>, <s>, <a href>, <code>, <pre> survive — everything
 * else is unwrapped to its text/children). */
function convertNode(node) {
  if (node.nodeType === 3) {
    // Text node
    return escapeHtml(node.rawText).replace(/\s+/g, ' ');
  }
  if (node.nodeType !== 1) return '';

  const tag = (node.tagName || '').toLowerCase();
  if (SKIP_TAGS.has(tag)) return '';

  const innerParts = (node.childNodes || []).map(convertNode);
  let inner = innerParts.join('');

  if (tag === 'br') return '\n';
  if (BOLD_TAGS.has(tag)) return `<b>${inner}</b>`;
  if (ITALIC_TAGS.has(tag)) return `<i>${inner}</i>`;
  if (tag === 'u') return `<u>${inner}</u>`;
  if (STRIKE_TAGS.has(tag)) return `<s>${inner}</s>`;
  if (tag === 'code') return `<code>${inner}</code>`;
  if (tag === 'pre') return `<pre>${inner}</pre>`;
  if (tag === 'a') {
    const href = node.getAttribute('href');
    if (!href || !/^https?:\/\//i.test(href)) return inner || '';
    const label = inner.trim() || escapeHtml(href);
    return `<a href="${escapeAttr(href)}">${label}</a>`;
  }

  if (BLOCK_TAGS.has(tag)) return inner + '\n';
  return inner;
}

function htmlToTelegramHtml(html) {
  const root = parseHtml(html, { comment: false });
  const body = root.querySelector('body') || root;
  const converted = (body.childNodes || []).map(convertNode).join('');
  return collapseWhitespace(converted);
}

/** Bare URLs in plain-text emails become real tappable hyperlinks too. */
function plainTextToTelegramHtml(text) {
  const escaped = escapeHtml(text);
  const linkified = escaped.replace(/(https?:\/\/[^\s<>"]+)/g, (url) => {
    // url is already HTML-escaped at this point (escapeHtml ran first),
    // so it's safe to drop straight into the href.
    return `<a href="${url}">${url}</a>`;
  });
  return collapseWhitespace(linkified);
}

function collapseWhitespace(str) {
  return str
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Builds the one-liner shown when an email first arrives. */
function buildCompactLine(fromName, subject) {
  const cleanSubject = (subject || '(no subject)').trim();
  const truncated =
    cleanSubject.length > COMPACT_SUBJECT_MAX
      ? cleanSubject.slice(0, COMPACT_SUBJECT_MAX - 1) + '…'
      : cleanSubject;
  return `✉️ ${escapeHtml(fromName)} — ${escapeHtml(truncated)}`;
}

/**
 * Splits Telegram-safe HTML body into pages under MAX_PAGE_CHARS, breaking
 * on paragraph boundaries first. Never splits inside an HTML tag — if a
 * single paragraph is pathologically long, it hard-wraps but always backs
 * up to the last safe ">" boundary so no page ends mid-tag.
 */
function paginate(bodyHtml) {
  if (!bodyHtml) return ['(no readable content)'];

  const paragraphs = bodyHtml.split(/\n{2,}/).filter((p) => p.length > 0);
  const pages = [];
  let current = '';

  const pushCurrent = () => {
    if (current.trim()) pages.push(current.trim());
    current = '';
  };

  for (const para of paragraphs) {
    const candidate = current ? `${current}\n\n${para}` : para;
    if (candidate.length <= MAX_PAGE_CHARS) {
      current = candidate;
      continue;
    }
    // Current paragraph won't fit alongside what's accumulated — flush first.
    pushCurrent();
    if (para.length <= MAX_PAGE_CHARS) {
      current = para;
      continue;
    }
    // A single paragraph exceeds one page on its own — hard-wrap it,
    // always cutting at the last complete ">" before the limit so we
    // never split an <a href="..."> tag in half.
    let remaining = para;
    while (remaining.length > MAX_PAGE_CHARS) {
      let cut = remaining.lastIndexOf('>', MAX_PAGE_CHARS);
      if (cut < MAX_PAGE_CHARS * 0.5) cut = MAX_PAGE_CHARS; // no safe boundary found — cut anyway
      pages.push(remaining.slice(0, cut + 1).trim());
      remaining = remaining.slice(cut + 1);
    }
    current = remaining;
  }
  pushCurrent();

  return pages.length ? pages : ['(no readable content)'];
}

module.exports = {
  htmlToTelegramHtml,
  plainTextToTelegramHtml,
  buildCompactLine,
  paginate,
  escapeHtml,
  MAX_PAGE_CHARS,
};
