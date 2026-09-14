import { createMentorBookingHandlers } from "@/src/mentor-booking/server";

const handlers = createMentorBookingHandlers();

export const GET = handlers.GET;
export const POST = handlers.POST;
