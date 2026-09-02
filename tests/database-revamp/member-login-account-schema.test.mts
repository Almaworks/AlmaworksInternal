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

const functionSource = (name: string) => {
  const start = source.indexOf(`create or replace function public.${name}`);
  assert.notEqual(start, -1, `${name} exists before its concurrency contract is inspected`);
  const end = source.indexOf("\n$$;", start);
  assert.notEqual(end, -1, `${name} has a complete function body`);
  return source.slice(start, end);
};

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

test("member login mutations serialize state and assign causal audit order", () => {
  const prepare = functionSource("prepare_member_login_removal");
  const attach = functionSource("attach_replacement_auth_identity");

  const profileLock = prepare.indexOf("for update;");
  const membershipLock = prepare.search(
    /perform membership\.id[\s\S]*?order by membership\.id[\s\S]*?for update;/u,
  );
  const priorStateRead = prepare.indexOf("jsonb_object_agg(membership.id::text, membership.status::text)");
  const membershipUpdate = prepare.indexOf("update public.semester_memberships membership");

  assert.ok(profileLock >= 0, "preparation locks the durable profile");
  assert.ok(membershipLock > profileLock, "preparation locks memberships after the profile");
  assert.ok(priorStateRead > membershipLock, "preparation reads prior statuses only after all membership locks");
  assert.ok(membershipUpdate > priorStateRead, "preparation updates memberships only after capturing locked prior states");
  assert.match(prepare, /greatest\(\s*clock_timestamp\(\),[\s\S]*?interval '1 microsecond'/u);
  assert.match(prepare, /insert into public\.program_audit_events \([\s\S]*?created_at[\s\S]*?v_account_event_created_at/u);

  assert.match(attach, /from auth\.users auth_user[\s\S]*?where auth_user\.id = p_auth_user_id[\s\S]*?for update;/u);
  assert.match(attach, /v_placeholder_profile_id is distinct from p_auth_user_id/u);
  assert.match(attach, /v_placeholder_role is distinct from 'startup'::public\.user_role/u);
  assert.match(attach, /v_placeholder_status is distinct from 'pending'/u);
  assert.match(attach, /v_placeholder_is_active is distinct from true/u);
  assert.match(attach, /v_placeholder_semester_id is not null/u);
  assert.match(attach, /v_placeholder_created_at is distinct from v_placeholder_updated_at/u);
  assert.match(attach, /v_placeholder_email[\s\S]*?v_auth_email/u);
  assert.match(attach, /v_retained_email[\s\S]*?v_auth_email/u);
  assert.doesNotMatch(attach, /raw_user_meta_data/u);
  assert.match(attach, /greatest\(\s*clock_timestamp\(\),[\s\S]*?interval '1 microsecond'/u);
  assert.match(attach, /insert into public\.program_audit_events \([\s\S]*?created_at[\s\S]*?v_account_event_created_at/u);
});
