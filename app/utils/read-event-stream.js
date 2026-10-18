// Reads a server-sent-events Response to the end, calling `onEvent(name, data)`
// for each event as it arrives. `data` is JSON-parsed when it parses, else the
// raw string. Resolves when the stream closes.
//
// Pairs with `invokeFunction`: supabase-js hands back the raw Response (rather
// than a parsed body) when an Edge Function answers `text/event-stream`, so a
// caller that asked a function to stream does
//
//   const result = await invokeFunction('fn', { ...body, stream: true });
//   if (isEventStream(result)) await readEventStream(result, (name, data) => …);
//   else useJson(result); // a function that doesn't stream still answers JSON
export default async function readEventStream(response, onEvent) {
  const reader = response?.body?.getReader?.();
  if (!reader) throw new Error('readEventStream: response has no readable body');
  const decoder = new TextDecoder();
  let buffer = '';

  const dispatch = (block) => {
    let name = 'message';
    const data = [];
    for (const line of block.split('\n')) {
      if (line.startsWith('event:')) name = line.slice(6).trim();
      else if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''));
    }
    if (!data.length) return;
    const text = data.join('\n');
    let parsed = text;
    try { parsed = JSON.parse(text); } catch { /* not JSON — pass the string */ }
    onEvent(name, parsed);
  };

  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');
    let split;
    while ((split = buffer.indexOf('\n\n')) !== -1) {
      dispatch(buffer.slice(0, split));
      buffer = buffer.slice(split + 2);
    }
  }
  buffer += decoder.decode();
  if (buffer.trim()) dispatch(buffer);
}

// True when `invokeFunction` returned a streaming Response rather than data.
export function isEventStream(result) {
  return typeof result?.body?.getReader === 'function'
    && (result.headers?.get?.('Content-Type') ?? '').includes('text/event-stream');
}
