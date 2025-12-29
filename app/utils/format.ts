export function prettyObject(msg: any) {
  const obj = msg;
  if (typeof msg !== "string") {
    msg = JSON.stringify(msg, null, "  ");
  }
  if (msg === "{}") {
    return obj.toString();
  }
  if (msg.startsWith("```json")) {
    return msg;
  }
  return ["```json", msg, "```"].join("\n");
}

export function* chunks(s: string, maxBytes = 900 * 1024) {
  const encoder = new TextEncoder();
  let offset = 0;
  while (offset < s.length) {
    let end = Math.min(s.length, offset + maxBytes);
    let chunk = s.slice(offset, end);
    while (encoder.encode(chunk).length > maxBytes && end > offset) {
      end--;
      chunk = s.slice(offset, end);
    }
    yield chunk;
    offset = end;
  }
}
