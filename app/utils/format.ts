
/**
 * 將物件或字串美化為可讀 JSON 區塊。
 */
export function prettyObject(msg: any) {
  const original = msg;

  if (typeof msg !== "string") {
    try {
      msg = JSON.stringify(msg, null, "  ");
    } catch {
      return String(original);
    }
  }

  if (msg === "{}") {
    return "```json\n{}\n```";
  }

  if (msg.startsWith("```json")) {
    return msg;
  }

  return ["```json", msg, "```"].join("\n");
}

/**
 * UTF-8 安全分片：
 * - 逐個 Unicode code point 計算 UTF-8 位元組長度
 * - 確保每片 byte 長度 <= maxBytes
 * - 不切斷 surrogate pair / emoji
 */
export function* chunks(s: string, maxBytes: number = 700 * 1024): Generator<string> {
  const encoder = new TextEncoder();

  let chunkChars: string[] = [];
  let chunkByteLen = 0;

  for (const ch of s) {
    const chBytes = encoder.encode(ch).length;
    if (chunkByteLen + chBytes > maxBytes) {
      yield chunkChars.join("");
      chunkChars = [];
      chunkByteLen = 0;
    }
    chunkChars.push(ch);
    chunkByteLen += chBytes;
  }

  if (chunkChars.length > 0) {
    yield chunkChars.join("");
  }
}
``
