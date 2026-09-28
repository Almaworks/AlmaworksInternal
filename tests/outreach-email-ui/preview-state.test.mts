import test from "node:test";
import assert from "node:assert/strict";
import { previewMutation } from "../../components/outreach-email/preview-state.ts";
import { isOutreachEmailWorkspace } from "../../components/outreach-email/presentation.ts";
import type { OutreachEmailWorkspaceResponse } from "../../src/outreach-email/types.ts";
const base: OutreachEmailWorkspaceResponse = { semesterId:"s", configuration:{available:true,sender:"Team <team@example.test>",timeZone:"UTC",unavailableReason:null}, opportunity:{opportunityId:"o",recipientEmail:"person@example.test",recipientName:"Pat",companyName:"Firm",semesterName:"Fall"},templates:[],starterTemplates:[],messages:[],supportedPlaceholders:["contact_name"] };
test("preview builds complete unique messages without existing history and supports cancel", () => {
 const command = {action:"submit_message" as const,semesterId:"s",opportunityId:"o",templateId:null,idempotencyKey:"k",subject:"Hi {{contact_name}}",body:"Hello",scheduledAt:"2026-10-01T12:00:00.000Z"};
 const once=previewMutation(base,command);
 assert.equal(isOutreachEmailWorkspace(once),true);
 assert.equal(once.messages[0].subject,"Hi Pat");
 const twice=previewMutation(once,{...command,idempotencyKey:"k2"});
 assert.notEqual(twice.messages[0].messageId,twice.messages[1].messageId);
 const cancelled=previewMutation(twice,{action:"cancel_message",semesterId:"s",messageId:twice.messages[0].messageId});
 assert.equal(cancelled.messages[0].status,"cancelled");
 assert.equal(cancelled.messages[1].status,"scheduled");
});
test("preview template edits preserve identity and archive preserves copy", () => {
 const saved=previewMutation(base,{action:"save_template",semesterId:"s",name:"Invite",subjectTemplate:"Hi",bodyTemplate:"Body"});
 const row=saved.templates[0];
 const edited=previewMutation(saved,{action:"save_template",semesterId:"s",templateId:row.templateId,expectedUpdatedAt:row.updatedAt!,name:"Edited",subjectTemplate:"Hi",bodyTemplate:"New body"});
 assert.equal(edited.templates.length,1);
 const archived=previewMutation(edited,{action:"archive_template",semesterId:"s",templateId:row.templateId,expectedUpdatedAt:edited.templates[0].updatedAt!});
 assert.equal(archived.templates[0].bodyTemplate,"New body");
 assert.ok(archived.templates[0].archivedAt);
});
