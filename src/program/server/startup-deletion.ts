export class StartupDeletionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StartupDeletionError";
  }
}

export interface StartupDeletionRequest {
  startupOrganizationId: string;
  confirmationName: string;
}

export function parseStartupDeletionRequest(value: unknown): StartupDeletionRequest {
  if (typeof value !== "object" || value === null) {
    throw new StartupDeletionError("A deletion request is required.");
  }
  const input = value as Record<string, unknown>;
  if (typeof input.startupOrganizationId !== "string" || input.startupOrganizationId.trim().length === 0) {
    throw new StartupDeletionError("startupOrganizationId is required.");
  }
  if (typeof input.confirmationName !== "string" || input.confirmationName.trim().length === 0) {
    throw new StartupDeletionError("Type the startup name to confirm permanent deletion.");
  }
  return {
    startupOrganizationId: input.startupOrganizationId.trim(),
    confirmationName: input.confirmationName.trim(),
  };
}
