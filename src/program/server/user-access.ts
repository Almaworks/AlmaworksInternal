import {
  type SetSemesterMemberAccessInput,
} from "./canonical-admin.ts";

type AuthOperationResult = {
  data: { user: { email?: string } | null };
  error: { message: string } | null;
};

type AuthEmailAdmin = {
  getUserById(userId: string): Promise<AuthOperationResult>;
  updateUserById(userId: string, attributes: { email: string }): Promise<AuthOperationResult>;
};

type AuthDeleteAdmin = {
  deleteUser(userId: string): Promise<AuthOperationResult>;
};

type SetAccess = (input: SetSemesterMemberAccessInput) => Promise<unknown>;

export class ReconciliationRequiredError extends Error {
  readonly reconciliationRequired = true;

  constructor(message: string) {
    super(message);
    this.name = "ReconciliationRequiredError";
  }
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : "Database access update failed.";
}

export async function synchronizeAuthEmailAndSemesterAccess({
  authAdmin,
  input,
  setAccess,
}: {
  authAdmin: AuthEmailAdmin;
  input: SetSemesterMemberAccessInput & { email: string };
  setAccess: SetAccess;
}) {
  const lookup = await authAdmin.getUserById(input.profileId);
  if (lookup.error) throw new Error(lookup.error.message);
  const previousEmail = lookup.data.user?.email ?? null;
  const emailChanged = previousEmail?.toLowerCase() !== input.email.toLowerCase();
  if (emailChanged) {
    const authUpdate = await authAdmin.updateUserById(input.profileId, { email: input.email });
    if (authUpdate.error) throw new Error(authUpdate.error.message);
  }

  try {
    return await setAccess(input);
  } catch (cause) {
    if (!emailChanged) throw cause;
    if (previousEmail === null) {
      throw new ReconciliationRequiredError(
        `${message(cause)} Auth email changed, but the prior Auth email is unavailable for rollback.`,
      );
    }
    const rollback = await authAdmin.updateUserById(input.profileId, { email: previousEmail });
    if (rollback.error) {
      throw new ReconciliationRequiredError(
        `${message(cause)} Auth email rollback also failed: ${rollback.error.message}`,
      );
    }
    throw cause;
  }
}

export async function provisionSemesterMemberAccess({
  authAdmin,
  input,
  setAccess,
}: {
  authAdmin: AuthDeleteAdmin;
  input: SetSemesterMemberAccessInput;
  setAccess: SetAccess;
}) {
  try {
    return await setAccess(input);
  } catch (cause) {
    const rollback = await authAdmin.deleteUser(input.profileId);
    if (rollback.error) {
      throw new ReconciliationRequiredError(
        `${message(cause)} Auth user cleanup also failed: ${rollback.error.message}`,
      );
    }
    throw cause;
  }
}
