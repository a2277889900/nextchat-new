
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

  const enc = new TextEncoder();
  const byteLen = (s: string) => enc.encode(s).length;

  return {
    async check() {
      try {
        const url = this.path(`get/${encodeURIComponent(storeKey)}`, proxyUrl);
        const res = await fetch(url, {
          method: "GET",
          headers: baseHeaders,
        });
        console.log("[Upstash] check", res.status, res.statusText, "url:", url);
        return res.ok;
      } catch (e) {
        console.error("[Upstash] failed to check", e);
        return false;
      }
    },

    async redisGet(key: string) {
      const safeKey = encodeURIComponent(key);
      const url = this.path(`get/${safeKey}`, proxyUrl);

      const res = await fetch(url, {
        method: "GET",
        headers: baseHeaders,
      });

      console.log("[Upstash] GET key =", key, "url:", url, res.status, res.statusText);

      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        throw new Error(
          `[Upstash] GET ${key} failed: ${res.status} ${res.statusText} ${errText}`,
        );
      }

      const resJson = (await res.json()) as { result?: string | null };
      const value = typeof resJson?.result === "string" ? resJson.result : "";
      console.log("[Upstash] GET result length =", value.length, "bytes =", byteLen(value));
      return value;
    },

    async redisSet(key: string, value: string) {
      const safeKey = encodeURIComponent(key);
      const url = this.path(`set/${safeKey}`, proxyUrl);

      const res = await fetch(url, {
        method: "POST",
        headers: {
          ...baseHeaders,
          "Content-Type": "application/json; charset=utf-8",
        },
        body: JSON.stringify({ value }),
      });

      console.log(
        "[Upstash] SET key =",
        key,
        "len =", value.length,
        "bytes =", byteLen(value),
        "url:", url,
        res.status,
        res.statusText,
      );

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

      console.log("[Upstash] get() chunkCount =", chunkCount);

      const keys = Array.from({ length: chunkCount }, (_, i) => chunkIndexKey(i));
      console.log("[Upstash] get() keys =", keys);

      const chunksArr = await Promise.all(keys.map((k) => this.redisGet(k)));

      chunksArr.forEach((c, i) =>
        console.log(
          `[Upstash] get() chunk[${i}] charLen=${c.length} byteLen=${byteLen(c)}`,
        ),
      );

      const joined = chunksArr.join("");
      console.log(
        "[Upstash] get() joined charLen =",
        joined.length,
        "byteLen =",
        byteLen(joined),
      );

      return joined;
    },

    async set(_: string, value: string) {
      // 先完整分片再寫入，避免 chunkCount 與實際片數不一致
      const parts = Array.from(chunks(value));
      console.log("[Upstash] set() total parts =", parts.length);

      for (let i = 0; i < parts.length; i++) {
        const key = chunkIndexKey(i);
        const part = parts[i];
        await this.redisSet(key, part);
      }

      await this.redisSet(chunkCountKey, String(parts.length));
      console.log("[Upstash] set() chunkCountKey =", chunkCountKey, "=", parts.length);
    },

    headers() {
      // 保留原方法以維持舊呼叫介面
      return baseHeaders;
    },

    path(segment: string, proxyUrl: string = "") {
      // 乾淨處理：不強制加尾斜線，避免路由把最後一段當成空 segment
      const basePrefix = "/api/upstash";

      const base =
        (proxyUrl ? proxyUrl.replace(/\/+$/g, "") : "") + basePrefix;

      const seg = segment.replace(/^\/+|\/+$/g, "");

      // 用 query 帶 endpoint，並且 encode
      const url = `${base}/${seg}?endpoint=${encodeURIComponent(config.endpoint)}`;

      return url;
    },
  };
}
