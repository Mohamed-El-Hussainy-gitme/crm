import test from "node:test";
import assert from "node:assert/strict";
import { clearStoredSession, hasMinimumRole, readStoredSession, storeSession } from "../lib/session.ts";

function installWindowMock() {
  const storage = new Map<string, string>();
  const listeners = new Map<string, EventListener[]>();

  const windowMock = {
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value);
      },
      removeItem: (key: string) => {
        storage.delete(key);
      },
    },
    dispatchEvent: (event: Event) => {
      const handlers = listeners.get(event.type) ?? [];
      handlers.forEach((handler) => handler(event));
      return true;
    },
    addEventListener: (type: string, handler: EventListener) => {
      listeners.set(type, [...(listeners.get(type) ?? []), handler]);
    },
    removeEventListener: (type: string, handler: EventListener) => {
      listeners.set(type, (listeners.get(type) ?? []).filter((entry) => entry !== handler));
    },
    CustomEvent,
  } as unknown as Window & typeof globalThis;

  Object.assign(globalThis, { window: windowMock, CustomEvent: globalThis.CustomEvent || CustomEvent });
  return {
    storage,
    cleanup() {
      // @ts-expect-error test cleanup
      delete globalThis.window;
    },
  };
}

test("storeSession persists only the normalized user payload", () => {
  const mock = installWindowMock();
  const session = storeSession({
    user: {
      id: "u_1",
      email: "admin@example.com",
      fullName: "Admin User",
      role: "ADMIN",
    },
  });

  assert.ok(session);
  assert.equal(session?.user.role, "ADMIN");
  assert.equal(readStoredSession()?.user.email, "admin@example.com");
  assert.equal(hasMinimumRole("ADMIN", "SALES_MANAGER"), true);

  mock.cleanup();
});

test("clearStoredSession removes the stored browser state", () => {
  const mock = installWindowMock();
  storeSession({
    user: {
      id: "u_2",
      email: "rep@example.com",
      fullName: "Sales Rep",
      role: "SALES_REP",
    },
  });

  clearStoredSession();
  assert.equal(readStoredSession(), null);

  mock.cleanup();
});
