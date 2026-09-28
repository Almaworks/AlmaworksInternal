import {
  authorizeAdminAccessRequest,
  createAdminAccessHandlers,
} from "@/src/dashboard/admin-access";

const handlers = createAdminAccessHandlers(authorizeAdminAccessRequest);

export const GET = handlers.GET;
