export interface EmailBodyPart { text: string; href?: string }

// Only labeled HTTP(S) links are supported. Raw HTML remains literal text.
export function emailBodyParts(body: string): EmailBodyPart[] {
  const parts: EmailBodyPart[] = [];
  const pattern = /\[([^\]\r\n]+)\]\((https?:\/\/[^\s()]+)\)/gu;
  let offset = 0;
  for (const match of body.matchAll(pattern)) {
    try {
      const url = new URL(match[2]);
      if (url.username || url.password) continue;
      parts.push({ text: body.slice(offset, match.index) });
      parts.push({ text: match[1], href: url.href });
      offset = match.index + match[0].length;
    } catch { /* Invalid links remain literal text. */ }
  }
  parts.push({ text: body.slice(offset) });
  return parts;
}

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

export function emailBodyHtml(body: string): string {
  return emailBodyParts(body).map(part => part.href
    ? `<a href="${escapeHtml(part.href)}">${escapeHtml(part.text)}</a>`
    : escapeHtml(part.text)).join("").replace(/\r?\n/gu, "<br>\n");
}
