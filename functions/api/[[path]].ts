import { createBackendApp, type BackendEnv, type BackendExecutionContext } from "../../packages/backend/src/app";

export type CloudflareEnv = BackendEnv;

type PagesFunctionContext<Env> = {
  request: Request;
  env: Env;
  waitUntil: (promise: Promise<unknown>) => void;
};

type PagesFunction<Env> = (context: PagesFunctionContext<Env>) => Response | Promise<Response>;

const app = createBackendApp();

export const onRequest: PagesFunction<CloudflareEnv> = async (context) => {
  const executionContext: BackendExecutionContext = {
    waitUntil: context.waitUntil,
  };

  return app.fetch(context.request, context.env, executionContext);
};
