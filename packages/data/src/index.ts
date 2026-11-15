import { z } from "zod";

export const FORMAT_VERSION = 1;

export const formatVersionSchema = z.literal(FORMAT_VERSION);
