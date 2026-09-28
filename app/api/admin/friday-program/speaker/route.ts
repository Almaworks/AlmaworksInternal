import { createFridaySpeakerHandlers } from "@/src/friday-program/server";

export const PUT = createFridaySpeakerHandlers().PUT;
export const DELETE = createFridaySpeakerHandlers().DELETE;
export const POST = createFridaySpeakerHandlers().POST;
