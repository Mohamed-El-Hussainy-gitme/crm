import { ZodTypeAny } from "zod";

export function parseOrThrow<T extends ZodTypeAny>(schema: T, input: unknown) {
  const result = schema.safeParse(input);
  if (!result.success) {
    const issue = result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(issue || "Validation error");
  }
  return result.data;
}
