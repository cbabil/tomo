/**
 * Minimal client for ttyd's WebSocket protocol.
 *
 * ttyd frames every message with a single leading command byte. This wires a
 * WebSocket to an xterm.js Terminal so the terminal renders inside Tomo's own
 * DOM (same-origin) instead of an embedded cross-origin iframe — which is what
 * lets Tomo fully control the terminal's appearance (theme, scrollbar).
 */
import type { Terminal } from "@xterm/xterm";

// Command bytes (first char of each framed message).
const ClientCommand = {
  INPUT: "0",
  RESIZE: "1",
} as const;

// Server → client output frames are the hot path (all terminal output), so the
// leading byte is compared numerically rather than decoded to a string.
// Other server commands (title, preferences) are ignored — Tomo owns the chrome.
const OUTPUT_BYTE = "0".charCodeAt(0);

export interface TtydConnection {
  dispose(): void;
}

export interface TtydHandlers {
  onOpen?: () => void;
  onClose?: () => void;
  onError?: () => void;
}

/**
 * Connect an xterm Terminal to a ttyd server over WebSocket.
 *
 * @param term  an already-`open()`ed xterm Terminal
 * @param url   the ttyd WebSocket URL (e.g. ws://host:port/ws)
 * @returns a handle whose `dispose()` tears down the socket and listeners
 */
export function connectTtyd(
  term: Terminal,
  url: string,
  handlers: TtydHandlers = {},
): TtydConnection {
  const encoder = new TextEncoder();
  const socket = new WebSocket(url, ["tty"]);
  socket.binaryType = "arraybuffer";

  const send = (message: string) => {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(encoder.encode(message));
    }
  };

  const sendResize = (cols: number, rows: number) => {
    send(ClientCommand.RESIZE + JSON.stringify({ columns: cols, rows }));
  };

  const dataSub = term.onData((data) => send(ClientCommand.INPUT + data));
  const resizeSub = term.onResize(({ cols, rows }) => sendResize(cols, rows));

  socket.onopen = () => {
    // Handshake: ttyd expects the auth token as the first message. Our ttyd
    // runs without credentials, so an empty token is accepted.
    send(JSON.stringify({ AuthToken: "" }));
    sendResize(term.cols, term.rows);
    handlers.onOpen?.();
  };

  socket.onmessage = (event: MessageEvent<ArrayBuffer | string>) => {
    if (typeof event.data === "string") return; // ttyd sends binary frames
    const bytes = new Uint8Array(event.data);
    if (bytes.length === 0) return;
    if (bytes[0] === OUTPUT_BYTE) {
      term.write(bytes.subarray(1));
    }
  };

  socket.onclose = () => handlers.onClose?.();
  socket.onerror = () => handlers.onError?.();

  return {
    dispose() {
      dataSub.dispose();
      resizeSub.dispose();
      socket.onopen = null;
      socket.onmessage = null;
      socket.onclose = null;
      socket.onerror = null;
      if (
        socket.readyState === WebSocket.OPEN ||
        socket.readyState === WebSocket.CONNECTING
      ) {
        socket.close();
      }
    },
  };
}
