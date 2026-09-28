import type { OutreachEmailCommand, OutreachEmailMessage, OutreachEmailTemplate, OutreachEmailWorkspaceResponse } from "../../src/outreach-email/types.ts";
import { renderOutreachEmailTemplate } from "../../src/outreach-email/model.ts";

/** Fictional preview state only. Never calls a delivery endpoint. */
export function previewMutation(workspace: OutreachEmailWorkspaceResponse, command: OutreachEmailCommand): OutreachEmailWorkspaceResponse {
  const now = new Date().toISOString();
  if (command.action === "archive_template") return { ...workspace, templates: workspace.templates.map(t => t.templateId === command.templateId ? { ...t, archivedAt: now } : t) };
  if (command.action === "save_template") {
    const template: OutreachEmailTemplate = { templateId: command.templateId ?? crypto.randomUUID(), source: "saved", name: command.name, subjectTemplate: command.subjectTemplate, bodyTemplate: command.bodyTemplate, archivedAt: null, createdAt: now, updatedAt: now };
    return { ...workspace, templates: command.templateId ? workspace.templates.map(t => t.templateId === command.templateId ? {...template,createdAt:t.createdAt} : t) : [...workspace.templates, template] };
  }
  if (command.action === "submit_message") {
    const opportunity = workspace.opportunity;
    if (!opportunity) return workspace;
    const rendered = renderOutreachEmailTemplate({subjectTemplate:command.subject,bodyTemplate:command.body,values:{contact_name:opportunity.recipientName,company_name:opportunity.companyName ?? "your organization",semester_name:opportunity.semesterName}});
    const message: OutreachEmailMessage = { messageId:crypto.randomUUID(), opportunityId:opportunity.opportunityId,templateId:command.templateId,recipientName:opportunity.recipientName,recipientEmail:opportunity.recipientEmail,sender:workspace.configuration.sender ?? "Preview sender",...rendered,status:command.scheduledAt ? "scheduled" : "accepted",createdAt:now,scheduledAt:command.scheduledAt,sentAt:null,acceptedAt:now,deliveredAt:null,cancelledAt:null,providerCheckedAt:now,providerId:crypto.randomUUID(),providerStatus:command.scheduledAt ? "scheduled" : "accepted",lastError:null,activityId:null,idempotencyExpiresAt:new Date(Date.now()+24*60*60*1000).toISOString(),canCancel:command.scheduledAt!==null,canRefresh:true,canRetry:false };
    return {...workspace,messages:[message,...workspace.messages]};
  }
  return {...workspace,messages:workspace.messages.map(m => {
    if (m.messageId !== command.messageId) return m;
    if (command.action === "cancel_message") return {...m,status:"cancelled",providerStatus:"canceled",canCancel:false,canRetry:false,cancelledAt:now,providerCheckedAt:now};
    if (command.action === "retry_message") return {...m,status:m.scheduledAt ? "scheduled" : "accepted",canRetry:false,acceptedAt:now,lastError:null};
    return {...m,providerCheckedAt:now};
  })};
}
