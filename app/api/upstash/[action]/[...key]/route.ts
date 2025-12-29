
import { NextRequest, NextResponse } from "next/server";

export const runtime = "edge";
export const dynamic = "force-dynamic";

function cleanEndpoint(endpoint: string) {
  return endpoint.replace(/\/+$/g, "");
}

function requireEndpoint(req: NextRequest) {
  const url = new URL(req.url);
  const endpoint = url.searchParams.get("endpoint");
  if (!endpoint) throw new Error("Missing query param: endpoint");
  const host = new URL(endpoint).hostname;
  if (!host.endsWith(".upstash.io")) {
    throw new Error(`forbidden endpoint: ${host}`);
  }
  return cleanEndpoint(endpoint);
}

function buildUpstashUrl(endpoint: string, action: "get" | "set", keySegs: string[]) {
  const segs = keySegs.map((s) => encodeURIComponent(s)).join("/");
  return `${endpoint}/${action}/${segs}`;
}

function bearerFrom(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  return { Authorization: auth, Accept: "application/json" };
}

export async function OPTIONS() {
  return NextResponse.json({ body: "OK" }, { status: 200 });
}

/**
 * GET 只允許 get/:key，轉發為 Upstash GET /get/:key
 */
export async function GET(req: NextRequest, { params }: { params: { action: string; key: string[] } }) {
  try {
    const endpoint = requireEndpoint(req);
    const { action, key } = params;

    if (action !== "get") {
      return NextResponse.json(
        { error: true, msg: `GET only supports action "get", got "${action}"` },
        { status: 405 },
      );
    }

    const targetUrl = buildUpstashUrl(endpoint, "get", key);

    const upstream = await fetch(targetUrl, {
      method: "GET",
      headers: bearerFrom(req),
    });

    const text = await upstream.text();
    console.log("[Upstash Proxy][GET]", targetUrl, upstream.status, upstream.statusText);

    return new Response(text, {
      status: upstream.status,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });
  } catch (e: any) {
    console.error("[Upstash Proxy][GET] error", e);
    return NextResponse.json({ error: true, msg: String(e?.message ?? e) }, { status: 500 });
  }
}

/**
 * POST 支援：
 * - set/:key  -> 讀 JSON { value } 或 raw text；以 raw body 轉發到 Upstash POST /set/:key
 * - get/:key  -> 容許 POST 也能查值（會轉成 Upstash GET）
 */
export async function POST(req: NextRequest, { params }: { params: { action: string; key: string[] } }) {
  try {
    const endpoint = requireEndpoint(req);
    const { action, key } = params;

    if (action === "set") {
      const contentType = req.headers.get("content-type") || "";
      let rawValue = "";

      if (contentType.includes("application/json")) {
        const bodyJson = (await req.json().catch(() => null)) as { value?: any } | null;
        if (!bodyJson || typeof bodyJson.value === "undefined") {
          return NextResponse.json({ error: true, msg: "JSON body must include { value }" }, { status: 400 });
        }
        rawValue = typeof bodyJson.value === "string" ? bodyJson.value : JSON.stringify(bodyJson.value);
      } else {
        // 允許直接以 text 送值
        rawValue = await req.text();
        if (!rawValue) {
          return NextResponse.json({ error: true, msg: "Request body is empty" }, { status: 400 });
        }
      }

      const targetUrl = buildUpstashUrl(endpoint, "set", key);

      const upstream = await fetch(targetUrl, {
        method: "POST",
        headers: bearerFrom(req),
        body: rawValue,
      });

      const text = await upstream.text();
      console.log(
        "[Upstash Proxy][POST set]",
        targetUrl,
        { charLen: rawValue.length },
        upstream.status,
        upstream.statusText,
      );

      return new Response(text, {
        status: upstream.status,
        headers: { "Content-Type": "application/json; charset=utf-8" },
      });
    }

    // 容許 POST get，實際改用 Upstash GET
    if (action === "get") {
      const targetUrl = buildUpstashUrl(endpoint, "get", key);

      const upstream = await fetch(targetUrl, {
        method: "GET",
        headers: bearerFrom(req),
      });

      const text = await upstream.text();
      console.log("[Upstash Proxy][POST->GET get]", targetUrl, upstream.status, upstream.statusText);

      return new Response(text, {
        status: upstream.status,
        headers: { "Content-Type": "application/json; charset=utf-8" },
      });
    }

    return NextResponse.json({ error: true, msg: `forbidden action "${action}"` }, { status: 403 });
  } catch (e: any) {
    console.error("[Upstash Proxy][POST] error", e);
    return NextResponse.json({ error: true, msg: String(e?.message ?? e) }, { status: 500 });
  }
}
