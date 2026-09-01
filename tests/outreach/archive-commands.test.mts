import assert from "node:assert/strict";
import test from "node:test";

import * as contactCommands from "../../src/outreach/server/contact-commands.ts";

const semesterId = "4403d7a5-1ff5-4be9-b96c-323893c9ac68";
const opportunityId = "f89fdf50-3d96-4993-8966-d16579d21652";
const contactId = "a89fdf50-3d96-4993-8966-d16579d21652";
const updatedAt = "2027-02-14T09:00:00.000Z";

type ArchiveResult = { data: { id: string } | null; error: { message: string } | null };
type ArchiveClient = {
  archiveSemester(input: { semesterId: string; opportunityId: string; contactId: string; expectedUpdatedAt: string }): Promise<ArchiveResult>;
  archiveGlobal(input: { contactId: string; expectedUpdatedAt: string }): Promise<ArchiveResult>;
};

test("semester removal archives only the selected semester opportunity", async () => {
  const moduleWithArchiveCommand = contactCommands as typeof contactCommands & {
    createArchiveOutreachContactCommand?: (
      authorize: (request: Request, semester: string) => Promise<ArchiveClient>,
    ) => (input: { request: Request; semesterId: string; opportunityId: string; contactId: string; updatedAt: string; scope: "semester" | "global" }) => Promise<unknown>;
  };
  assert.equal(typeof moduleWithArchiveCommand.createArchiveOutreachContactCommand, "function");
  if (moduleWithArchiveCommand.createArchiveOutreachContactCommand === undefined) return;

  const events: string[] = [];
  const archive = moduleWithArchiveCommand.createArchiveOutreachContactCommand(async (_request, semester) => {
    events.push(`authorize:${semester}`);
    return {
      archiveSemester: async (input) => { events.push(`semester:${input.opportunityId}:${input.contactId}:${input.expectedUpdatedAt}`); return { data: { id: input.opportunityId }, error: null }; },
      archiveGlobal: async () => { events.push("global"); return { data: { id: contactId }, error: null }; },
    };
  });

  const result = await archive({ request: new Request("https://example.test"), semesterId, opportunityId, contactId, updatedAt, scope: "semester" });
  assert.deepEqual(events, [`authorize:${semesterId}`, `semester:${opportunityId}:${contactId}:${updatedAt}`]);
  assert.deepEqual(result, { ok: true, value: { scope: "semester", semesterId, opportunityId, contactId } });
});

test("global removal archives the durable contact without deleting semester history", async () => {
  const moduleWithArchiveCommand = contactCommands as typeof contactCommands & {
    createArchiveOutreachContactCommand?: (
      authorize: (request: Request, semester: string) => Promise<ArchiveClient>,
    ) => (input: { request: Request; semesterId: string; opportunityId: string; contactId: string; updatedAt: string; scope: "semester" | "global" }) => Promise<unknown>;
  };
  assert.equal(typeof moduleWithArchiveCommand.createArchiveOutreachContactCommand, "function");
  if (moduleWithArchiveCommand.createArchiveOutreachContactCommand === undefined) return;

  const events: string[] = [];
  const archive = moduleWithArchiveCommand.createArchiveOutreachContactCommand(async () => ({
    archiveSemester: async () => { events.push("semester"); return { data: { id: opportunityId }, error: null }; },
    archiveGlobal: async (input) => { events.push(`global:${input.contactId}:${input.expectedUpdatedAt}`); return { data: { id: input.contactId }, error: null }; },
  }));

  const result = await archive({ request: new Request("https://example.test"), semesterId, opportunityId, contactId, updatedAt, scope: "global" });
  assert.deepEqual(events, [`global:${contactId}:${updatedAt}`]);
  assert.deepEqual(result, { ok: true, value: { scope: "global", semesterId, opportunityId, contactId } });
});
