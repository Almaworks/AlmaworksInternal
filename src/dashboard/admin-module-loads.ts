export type AdminModuleLoad =
  | "capabilities"
  | "member-audit"
  | "members"
  | "pending-users"
  | "semester"
  | "startups";

export const adminModuleLoads = {
  overview: ["capabilities", "semester"],
  members: ["capabilities", "members", "member-audit", "semester"],
  startups: ["capabilities", "members", "semester", "startups"],
  access: ["capabilities", "members", "pending-users", "semester"],
  "friday-program": ["semester"],
} as const satisfies Record<string, readonly AdminModuleLoad[]>;
