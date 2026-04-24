import { ZodSchema, ZodError } from "zod";

export type ValidationFailure = {
  message: string;
  fieldErrors: Record<string, string>;
};

export type ValidationResult<T> =
  | { success: true; data: T }
  | { success: false; error: ValidationFailure };

function fromZodError(error: ZodError): ValidationFailure {
  const fieldErrors: Record<string, string> = {};

  for (const issue of error.issues) {
    const key = issue.path.join(".") || "form";
    if (!fieldErrors[key]) {
      fieldErrors[key] = issue.message;
    }
  }

  return {
    message: error.issues[0]?.message || "Validation failed",
    fieldErrors,
  };
}

export function validateSchema<T>(schema: ZodSchema<T>, input: unknown): ValidationResult<T> {
  const result = schema.safeParse(input);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, error: fromZodError(result.error) };
}

export function fieldError(errors: Record<string, string>, key: string) {
  return errors[key] || "";
}
