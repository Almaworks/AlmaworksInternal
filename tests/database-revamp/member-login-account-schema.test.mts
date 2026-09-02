import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("../../supabase/schemas/canonical_schema.sql", import.meta.url),
  "utf8",
).replaceAll('"', "").toLowerCase();

const escapePattern = (value: string) => value.replaceAll(/[.*+?^${}()|[\]\\]/gu, "\\$&");

const commands = [
  {
    name: "preview_member_login_removal",
    signature: "uuid",
    declaration: "p_profile_id uuid",
  },
  {
    name: "prepare_member_login_removal",
    signature: "uuid, text",
    declaration: "p_profile_id uuid, p_reason text",
  },
  {
    name: "attach_replacement_auth_identity",
    signature: "uuid, uuid",
    declaration: "p_profile_id uuid, p_auth_user_id uuid",
  },
] as const;

test("member login account commands expose only the intended authenticated RPC surface", () => {
  for (const command of commands) {
    const escapedSignature = escapePattern(command.signature);
    const escapedDeclaration = escapePattern(command.declaration);
    const functionPattern = new RegExp(
      `create or replace function public\\.${command.name}\\(${escapedDeclaration}\\)`,
      "u",
    );
    const revokePattern = new RegExp(
      `revoke all on function public\\.${command.name}\\(${escapedSignature}\\) from public, anon`,
      "u",
    );
    const grantPattern = new RegExp(
      `grant execute on function public\\.${command.name}\\(${escapedSignature}\\) to authenticated, postgres`,
      "u",
    );

    assert.match(source, functionPattern, `${command.name} has the required exact signature`);
    assert.match(source, revokePattern, `${command.name} is unavailable to PUBLIC and anon`);
    assert.match(source, grantPattern, `${command.name} is executable by authenticated callers and postgres`);
    assert.doesNotMatch(
      source,
      new RegExp(`grant .* on function public\\.${command.name}\\(${escapedSignature}\\) to service_role`, "u"),
      `${command.name} does not make service_role the application authorization path`,
    );
  }
});
