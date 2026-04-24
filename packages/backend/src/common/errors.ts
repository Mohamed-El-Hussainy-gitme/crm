import { jsonResponse } from "./http.js";

export class HttpError extends Error {
  constructor(
    message: string,
    public readonly status = 500,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export function isHttpError(error: unknown): error is HttpError {
  return error instanceof HttpError;
}

export function errorResponse(error: unknown): Response {
  if (isHttpError(error)) {
    return jsonResponse(
      {
        message: error.message,
        details: error.details,
      },
      { status: error.status },
    );
  }

  console.error(error);

  return jsonResponse(
    {
      message: "Internal server error",
    },
    { status: 500 },
  );
}
