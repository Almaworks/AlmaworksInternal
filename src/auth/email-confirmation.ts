// A GET from an email scanner must never consume a one-use invitation or reset.
export function emailConfirmationHtml(tokenHash: string, type: 'invite' | 'recovery'): string {
  const escapedToken = tokenHash.replace(/[&<>"']/gu, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character] ?? character);
  const heading = type === 'invite' ? 'Welcome to Almaworks' : 'Reset your password';
  const description = type === 'invite'
    ? 'Your invitation is ready. Continue to create your password, then we’ll walk you through setting up your profile.'
    : 'Continue to choose a new password for your Almaworks account.';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${heading} · Almaworks</title>
<style>*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;background:#002147;color:#1f2937;font:16px/1.6 system-ui,sans-serif}main{width:100%;max-width:440px;padding:32px;background:white;border-radius:20px}h1{margin:12px 0;font-size:28px;line-height:1.25;color:#002147}.brand{font-weight:700;color:#002147}p{margin:16px 0}button{width:100%;margin:8px 0;padding:14px 16px;border:0;border-radius:10px;background:#002147;color:white;font:inherit;font-weight:600;cursor:pointer}button:focus-visible,a:focus-visible{outline:3px solid #1681ce;outline-offset:4px}footer{margin-top:24px;font-size:14px}a{color:#005b9a}small{display:block;color:#526174}</style></head>
<body><main><div class="brand">Almaworks</div><h1>${heading}</h1><p>${description}</p>
<form method="post" action="/auth/callback"><input type="hidden" name="token_hash" value="${escapedToken}"><input type="hidden" name="type" value="${type}"><button type="submit">Continue to password setup</button></form>
<small>Only continue if you requested this email or expected an Almaworks invitation.</small><footer><a href="/">Back to sign in</a> · <a href="/privacy">Privacy policy</a></footer></main></body></html>`;
}
