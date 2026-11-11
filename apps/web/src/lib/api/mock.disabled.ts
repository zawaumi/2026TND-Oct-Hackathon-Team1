import type { ApiClient } from "./types";

/**
 * 本番ビルドでモックの代わりに読み込まれる空の部品（next.config.ts の resolveAlias）。
 * client.ts は本番ではモックを使わないので、ここが呼ばれることはない。
 */
export const mockClient: ApiClient = new Proxy({} as ApiClient, {
  get: (_target, name) =>
    name === "then" ? undefined : () => Promise.reject(new Error("モックは本番ビルドでは使えません")),
});
