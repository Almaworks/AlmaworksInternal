import {
  KnownDatabaseRejectionError,
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
  return synchronizeAuthEmailAndDatabaseMutation({
    authAdmin,
    email: input.email,
    mutateDatabase: () => setAccess(input),
    profileId: input.profileId,
  });
}

export async function synchronizeAuthEmailAndDatabaseMutation<T>({
  authAdmin,
  email,
  mutateDatabase,
  profileId,
}: {
  authAdmin: AuthEmailAdmin;
  email: string;
  mutateDatabase: () => Promise<T>;
  profileId: string;
}): Promise<T> {
  const lookup = await authAdmin.getUserById(profileId);
  if (lookup.error) throw new Error(lookup.error.message);
  const previousEmail = lookup.data.user?.email ?? null;
  const emailChanged = previousEmail?.toLowerCase() !== email.toLowerCase();
  if (emailChanged) {
    const authUpdate = await authAdmin.updateUserById(profileId, { email });
    if (authUpdate.error) throw new Error(authUpdate.error.message);
  }

  try {
    return await mutateDatabase();
  } catch (cause) {
    if (!(cause instanceof KnownDatabaseRejectionError)) {
      throw new ReconciliationRequiredError(
        `${message(cause)} The database outcome is unknown; Auth was not rolled back.`,
      );
    }
    if (!emailChanged) throw cause;
    if (previousEmail === null) {
      throw new ReconciliationRequiredError(
        `${message(cause)} Auth email changed, but the prior Auth email is unavailable for rollback.`,
      );
    }
    const rollback = await authAdmin.updateUserById(profileId, { email: previousEmail });
    if (rollback.error) {
      throw new ReconciliationRequiredError(
        `${message(cause)} Auth email rollback also failed: ${rollback.error.message}`,
      );
    }
    throw cause;
  }
}

export async function updateExistingSemesterMemberIdentity({
  authorizeTarget,
  authAdmin,
  input,
  setAccess,
}: {
  authorizeTarget: (input: { profileId: string; semesterId: string }) => Promise<unknown>;
  authAdmin: AuthEmailAdmin;
  input: SetSemesterMemberAccessInput & { email: string };
  setAccess: SetAccess;
}) {
  await authorizeTarget({ profileId: input.profileId, semesterId: input.semesterId });
  return synchronizeAuthEmailAndSemesterAccess({ authAdmin, input, setAccess });
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
  return provisionAuthBackedDatabaseMutation({
    authAdmin,
    mutateDatabase: () => setAccess(input),
    profileId: input.profileId,
  });
}

export async function provisionAuthBackedDatabaseMutation<T>({
  authAdmin,
  mutateDatabase,
  profileId,
}: {
  authAdmin: AuthDeleteAdmin;
  mutateDatabase: () => Promise<T>;
  profileId: string;
}): Promise<T> {
  try {
    return await mutateDatabase();
  } catch (cause) {
    if (!(cause instanceof KnownDatabaseRejectionError)) {
      throw new ReconciliationRequiredError(
        `${message(cause)} The database outcome is unknown; Auth user cleanup was not attempted.`,
      );
    }
    const rollback = await authAdmin.deleteUser(profileId);
    if (rollback.error) {
      throw new ReconciliationRequiredError(
        `${message(cause)} Auth user cleanup also failed: ${rollback.error.message}`,
      );
    }
    throw cause;
  }
}
