export type JsonRecord = Record<string, unknown>;

export function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json; charset=utf-8");

  return new Response(JSON.stringify(body), {
    ...init,
    headers,
  });
}

export function noContentResponse(init: ResponseInit = {}): Response {
  return new Response(null, {
    status: 204,
    ...init,
  });
}

export function methodNotAllowed(allowedMethods: string[]): Response {
  return jsonResponse(
    {
      message: "Method not allowed",
      allowedMethods,
    },
    {
      status: 405,
      headers: {
        allow: allowedMethods.join(", "),
      },
    },
  );
}
