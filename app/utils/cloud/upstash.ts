
import { STORAGE_KEY } from "@/app/constant";
import { SyncStore } from "@/app/store/sync";
import { chunks } from "../format";

export type UpstashConfig = SyncStore["upstash"];
export type UpStashClient = ReturnType<typeof createUpstashClient>;

export function createUpstashClient(store: SyncStore) {
  const config = store.upstash;
  const storeKey = config.username.length === 0 ? STORAGE_KEY : config.username;
  const chunkCountKey = `${storeKey}-chunk-count`;
  const chunkIndexKey = (i: number) => `${storeKey}-chunk-${i}`;

  const proxyUrl =
    store.useProxy && store.proxyUrl.length > 0 ? store.proxyUrl : undefined;

  const baseHeaders: Record<string, string> = {
    Authorization: `Bearer ${config.apiKey}`,
    Accept: "application/json",
  };

  return {
    async check() {
      try {
        const res = await fetch(this.path(`get/${storeKey}`, proxyUrl), {
          method: "GET",
          headers: baseHeaders,
        });
        console.log("[Upstash] check", res.status, res.statusText);
        return res.ok;
      } catch (e) {
        console.error("[Upstash] failed to check", e);
        return false;
      }
    },

    async redisGet(key: string) {
      const res = await fetch(this.path(`get/${key}`, proxyUrl), {
        method: "GET",
        headers: baseHeaders,
      });

      console.log("[Upstash] get key =", key, res.status, res.statusText);

      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        throw new Error(
          `[Upstash] GET ${key} failed: ${res.status} ${res.statusText} ${errText}`,
        );
      }

      const resJson = (await res.json()) as { result?: string | null };
      return typeof resJson?.result === "string" ? resJson.result : "";
    },

    async redisSet(key: string, value: string) {
      const res = await fetch(this.path(`set/${key}`, proxyUrl), {
        method: "POST",
        headers: {
          ...baseHeaders,
          "Content-Type": "application/json; charset=utf-8",
        },
        body: JSON.stringify({ value }),
      });

      console.log("[Upstash] set key =", key, res.status, res.statusText);

      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        throw new Error(
          `[Upstash] SET ${key} failed: ${res.status} ${res.statusText} ${errText}`,
        );
      }
    },

    async get() {
      const chunkCountRaw = await this.redisGet(chunkCountKey);
      const chunkCount = Number(chunkCountRaw);

      if (!Number.isInteger(chunkCount) || chunkCount <= 0) {
        console.warn("[Upstash] invalid chunkCount:", chunkCountRaw);
        return "";
      }

      const chunksArr = await Promise.all(
        Array.from({ length: chunkCount }, (_, i) =>
          this.redisGet(chunkIndexKey(i)),
        ),
      );

      return chunksArr.join("");
    },

    async set(_: string, value: string) {
      let index = 0;
      for (const chunk of chunks(value)) {
        await this.redisSet(chunkIndexKey(index), chunk);
        index += 1;
      }
      await this.redisSet(chunkCountKey, index.toString());
    },

    headers() {
      // 保留原方法以維持舊呼叫介面
      return baseHeaders;
    },

    path(path: string, proxyUrl: string = "") {
      if (!path.endsWith("/")) {
        path += "/";
      }
      if (path.startsWith("/")) {
        path = path.slice(1);
      }

      if (proxyUrl.length > 0 && !proxyUrl.endsWith("/")) {
        proxyUrl += "/";
      }

      const pathPrefix = "/api/upstash/";

      try {
        const u = new URL((proxyUrl || "") + pathPrefix + path);
        // add query params
        u.searchParams.append("endpoint", config.endpoint);
        return u.toString();
      } catch {
        // Fallback：避免 URL 解析失敗
        return (
          pathPrefix +
          path +
          "?endpoint=" +
          encodeURIComponent(config.endpoint)
        );
      }
    },
  };
}
