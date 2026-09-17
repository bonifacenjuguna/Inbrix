/** Decodes Gmail API's URL-safe base64 body data. */
function decodeBase64Url(data) {
  if (!data) return '';
  const normalized = data.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(normalized, 'base64').toString('utf8');
}

function getHeader(headers, name) {
  const found = (headers || []).find((h) => h.name.toLowerCase() === name.toLowerCase());
  return found ? found.value : '';
}

/**
 * Walks a Gmail MIME payload tree and returns the best html and/or plain
 * text bodies found. Prefers text/html (it carries real hyperlinks); falls
 * back to text/plain and auto-linkifies bare URLs later in emailFormat.js.
 */
function extractBodies(payload) {
  let html = '';
  let text = '';

  function walk(part) {
    if (!part) return;
    const mimeType = part.mimeType || '';
    if (mimeType === 'text/html' && part.body && part.body.data) {
      html += decodeBase64Url(part.body.data);
    } else if (mimeType === 'text/plain' && part.body && part.body.data) {
      text += decodeBase64Url(part.body.data);
    } else if (part.parts) {
      // Prefer the first alternative that yields html; still walk all
      // branches so multipart/mixed attachments-plus-body both get seen.
      for (const child of part.parts) walk(child);
    } else if (mimeType.startsWith('multipart/') === false && part.body && part.body.data && !html && !text) {
      // Unknown single-part mime type with a body (rare) — treat as text.
      text += decodeBase64Url(part.body.data);
    }
  }

  walk(payload);
  return { html, text };
}

/** Parses a "Name <email@x.com>" header into its parts. Falls back gracefully
 * for bare "email@x.com" headers. */
function parseFromHeader(value) {
  const match = /^(.*?)<(.+?)>$/.exec(value || '');
  if (match) {
    const name = match[1].trim().replace(/^"|"$/g, '');
    return { name: name || match[2].trim(), email: match[2].trim() };
  }
  return { name: (value || '').trim(), email: (value || '').trim() };
}

module.exports = { decodeBase64Url, getHeader, extractBodies, parseFromHeader };
