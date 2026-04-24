import { HttpError } from "./errors.js";

export async function readJsonBody<T = unknown>(request: Request): Promise<T> {
  const contentType = request.headers.get("content-type") ?? "";

  if (!contentType.includes("application/json")) {
    throw new HttpError("Expected application/json request body", 415);
  }

  try {
    return (await request.json()) as T;
  } catch {
    throw new HttpError("Invalid JSON request body", 400);
  }
}
