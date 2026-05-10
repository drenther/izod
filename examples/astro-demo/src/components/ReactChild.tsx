import { useRef, useState, useEffect } from "react";
import { parent } from "@izod/react";
import { z } from "zod";

const messageSchema = z.object({
  text: z.string(),
  timestamp: z.number(),
});

type LogEntry = {
  id: number;
  message: string;
  type: "sent" | "received" | "system" | "error";
};

export default function ReactChild() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [input, setInput] = useState("");
  const logIdRef = useRef(0);

  function appendLog(message: string, type: LogEntry["type"]) {
    setLogs((prev) => [
      ...prev,
      { id: ++logIdRef.current, message, type },
    ]);
  }

  const { on, executeHandshake, api, isHandshakeComplete, isHandshakePending, handshakeError } =
    parent.useConnect({
      namespace: "izod-react-demo",
      inboundEvents: {
        parentMessage: messageSchema,
      },
      outboundEvents: {
        childMessage: messageSchema,
      },
      onHandshakeComplete: () => {
        appendLog("Handshake complete — connected to parent", "system");
      },
      onHandshakeError: (error) => {
        appendLog(`Connection failed: ${error.message}`, "error");
      },
    });

  useEffect(() => {
    const unsubscribe = on("parentMessage", (data) => {
      appendLog(data.text, "received");
    });
    return unsubscribe;
  }, [on]);

  useEffect(() => {
    appendLog("Waiting for handshake from parent...", "system");
    executeHandshake();
  }, [executeHandshake]);

  function sendMessage() {
    const text = input.trim();
    if (!text || !api) return;
    api.emit("childMessage", { text, timestamp: Date.now() });
    appendLog(text, "sent");
    setInput("");
  }

  const statusClass = handshakeError
    ? "status error"
    : isHandshakeComplete
      ? "status connected"
      : "status pending";

  const statusText = handshakeError
    ? "Error"
    : isHandshakeComplete
      ? "Connected"
      : isHandshakePending
        ? "Connecting..."
        : "Waiting for parent...";

  return (
    <>
      <span className={statusClass}>{statusText}</span>

      <div className="controls">
        <input
          type="text"
          placeholder="Reply to parent..."
          disabled={!isHandshakeComplete}
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") sendMessage();
          }}
        />
        <button disabled={!isHandshakeComplete} onClick={sendMessage}>
          Send
        </button>
      </div>

      <div className="log">
        {logs.map((entry) => {
          const prefix = { sent: "↑ SENT", received: "↓ RECV", system: "● SYS", error: "✕ ERR" }[entry.type];
          return (
            <div key={entry.id} className={`log-entry ${entry.type}`}>
              [{new Date().toLocaleTimeString()}] {prefix}: {entry.message}
            </div>
          );
        })}
      </div>
    </>
  );
}
