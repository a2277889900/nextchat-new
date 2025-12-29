
/**
 * 將物件或字串美化為可讀 JSON 區塊。
 */
export function prettyObject(msg: any) {
  const original = msg;

  // 若不是字串，序列化為 JSON（縮排兩格）
  if (typeof msg !== "string") {
    try {
      msg = JSON.stringify(msg, null, "  ");
    } catch {
      // 序列化失敗時退回 toString
      return String(original);
    }
  }

  // 空物件的特殊處理
  if (msg === "{}") {
    return "```json\n{}\n```";
  }

  // 已經是 json 區塊則直接返回
  if (msg.startsWith("```json")) {
    return msg;
  }

  return ["```json", msg, "```"].join("\n");
}

/**
 * UTF-8 安全分片：
 * - 逐個 Unicode code point 累積其 UTF-8 位元組長度
 * - 確保每片的 byte 長度 <= maxBytes
 * - 不切斷 surrogate pair / emoji，避免內容被替換或截斷
 *
 * @param s 待分片的字串
 * @param maxBytes 每片的最大位元組數（預設 900KB）
 */
export function* chunks(
  s: string,
  maxBytes: number = 900 * 1024,
): Generator<string> {
  const encoder = new TextEncoder();

  let chunkChars: string[] = [];
  let chunkByteLen = 0;

  // 使用 for...of 以「code point」迭代（避免 surrogate pair 被拆開）
  for (const ch of s) {
    const chBytes = encoder.encode(ch).length;

    // 加入此字後會超過上限 → 先輸出目前片段
    if (chunkByteLen + chBytes > maxBytes) {
      yield chunkChars.join("");
      chunkChars = [];
      chunkByteLen = 0;
    }

    chunkChars.push(ch);
    chunkByteLen += chBytes;
  }

  // 輸出最後一片
  if (chunkChars.length > 0) {
    yield chunkChars.join("");
  }
}
