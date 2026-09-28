import assert from "node:assert/strict";
import test from "node:test";
import { emailBodyParts, emailBodyHtml } from "../../src/outreach-email/links.ts";
test("renders labeled HTTPS links and escapes untrusted text", () => {
  assert.equal(emailBodyHtml('Fill [form](https://example.com/?a=1&b=2).\n<script>'), 'Fill <a href="https://example.com/?a=1&amp;b=2">form</a>.<br>\n&lt;script&gt;');
  assert.equal(emailBodyParts('[x](javascript:alert)').some(p => p.href), false);
  assert.equal(emailBodyParts('[x](https://user:pass@example.com)').some(p => p.href), false);
});
