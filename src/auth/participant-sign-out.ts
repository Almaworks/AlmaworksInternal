export interface ParticipantSignOutClient {
  auth: {
    signOut(options: { scope: "local" }): Promise<{ error: { message: string } | null }>;
  };
}

export async function signOutParticipant(
  client: ParticipantSignOutClient,
  navigate: (href: string) => void,
): Promise<void> {
  const { error } = await client.auth.signOut({ scope: "local" });
  if (error) throw new Error(error.message);
  navigate("/");
}
