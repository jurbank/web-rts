import { expect, test } from "vite-plus/test";
import { FORMAT_VERSION, formatVersionSchema } from "../src/index.ts";

test("accepts only the current format version", () => {
  expect(formatVersionSchema.safeParse(FORMAT_VERSION).success).toBe(true);
  expect(formatVersionSchema.safeParse(FORMAT_VERSION + 1).success).toBe(false);
});
