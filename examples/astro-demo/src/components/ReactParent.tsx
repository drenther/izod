import { useRef, useState, useEffect } from "react";
import { child } from "@izod/react";
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

export default function ReactParent({ base }: { base: string }) {
  const [container] = useState(() => document.createElement("div"));
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
    child.useCreate({
      container,
      url: `${base}react/child`,
      namespace: "izod-react-demo",
      iframeAttributes: {
        style: "width:100%;height:300px;border:1px solid #e5e7eb;border-radius:8px",
      },
      inboundEvents: {
        childMessage: messageSchema,
      },
      outboundEvents: {
        parentMessage: messageSchema,
      },
      onHandshakeComplete: () => {
        appendLog("Handshake complete — connection established", "system");
      },
      onHandshakeError: (error) => {
        appendLog(`Handshake failed: ${error.message}`, "error");
      },
    });

  useEffect(() => {
    const unsubscribe = on("childMessage", (data) => {
      appendLog(data.text, "received");
    });
    return unsubscribe;
  }, [on]);

  useEffect(() => {
    appendLog("Creating child iframe...", "system");
    executeHandshake();
    appendLog("Initiating handshake...", "system");
  }, [executeHandshake]);

  function sendMessage() {
    const text = input.trim();
    if (!text || !api) return;
    api.emit("parentMessage", { text, timestamp: Date.now() });
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
        : "Idle";

  return (
    <>
      <span className={statusClass}>{statusText}</span>

      <div ref={(node) => {
        if (node && !node.contains(container)) node.appendChild(container);
      }} />

      <div className="controls">
        <input
          type="text"
          placeholder="Type a message to send to child..."
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

      <h3 style={{ marginBottom: "0.5rem" }}>Event Log</h3>
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
