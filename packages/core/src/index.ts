import type { StandardSchemaV1 } from "@standard-schema/spec";
import crelt from "crelt";
import { nanoid } from "nanoid";

export type { StandardSchemaV1 } from "@standard-schema/spec";

export const eventContentType = "application/x-izod+json" as const;

const createLogger = (enabled: boolean = false): typeof console.info =>
  enabled ? console.info.bind(console) : () => {};

export const messageTypes = {
  "handshake-request": "handshake-request",
  "handshake-reply": "handshake-reply",
  "child-originated-event": "child-originated-event",
  "parent-originated-event": "parent-originated-event",
} as const;

export const errorCauses = {
  handshake_request_invalid: "handshake_request_invalid",
  handshake_request_timeout: "handshake_request_timeout",
  event_name_invalid: "event_name_invalid",
  event_data_invalid: "event_data_invalid",
} as const;

const wildcardOrigin = "*";

function resolveOrigin(url?: string) {
  if (!url) {
    return wildcardOrigin;
  }

  const anchor = document.createElement("a");
  anchor.href = url;
  const protocol =
    anchor.protocol.length > 4 ? anchor.protocol : window.location.protocol;
  const host = anchor.host.length
    ? anchor.port === "80" || anchor.port === "443"
      ? anchor.hostname
      : anchor.host
    : window.location.host;
  return anchor.origin || `${protocol}//${host}`;
}

export function generateUniqueId(namespace?: string) {
  return `${namespace ?? "anon"}__${nanoid()}`;
}

function validateSync<T extends StandardSchemaV1>(
  schema: T,
  data: unknown,
):
  | { success: true; data: StandardSchemaV1.InferOutput<T> }
  | { success: false; error: string } {
  const result = schema["~standard"].validate(data);
  if (result instanceof Promise) {
    throw new TypeError("Schema validation must be synchronous");
  }
  if (result.issues) {
    return { success: false, error: JSON.stringify(result.issues, null, 2) };
  }
  return { success: true, data: result.value as StandardSchemaV1.InferOutput<T> };
}

interface BaseMessageData {
  contentType: typeof eventContentType;
  namespace?: string;
  id: string;
}

function isBaseMessageData(data: unknown): data is BaseMessageData {
  if (typeof data !== "object" || data === null) return false;
  const record = data as Record<string, unknown>;
  return (
    record["contentType"] === eventContentType && typeof record["id"] === "string"
  );
}

export interface HandshakeRequestMessageData extends BaseMessageData {
  messageType: typeof messageTypes["handshake-request"];
}

function isHandshakeRequest(
  data: unknown,
): data is HandshakeRequestMessageData {
  if (!isBaseMessageData(data)) return false;
  return (
    "messageType" in data &&
    data.messageType === messageTypes["handshake-request"]
  );
}

export interface HandshakeReplyMessageData extends BaseMessageData {
  messageType: typeof messageTypes["handshake-reply"];
}

function isHandshakeReply(data: unknown): data is HandshakeReplyMessageData {
  if (!isBaseMessageData(data)) return false;
  return (
    "messageType" in data &&
    data.messageType === messageTypes["handshake-reply"]
  );
}

interface EventPayload {
  name: string;
  data: unknown;
}

function isEventPayload(data: unknown): data is EventPayload {
  if (typeof data !== "object" || data === null) return false;
  const record = data as Record<string, unknown>;
  return typeof record["name"] === "string" && "data" in record;
}

export interface ParentOriginatedMessageDataEventPayload extends BaseMessageData {
  messageType: typeof messageTypes["parent-originated-event"];
  event: EventPayload;
}

function isParentOriginatedEvent(
  data: unknown,
): data is ParentOriginatedMessageDataEventPayload {
  if (!isBaseMessageData(data)) return false;
  if (!("messageType" in data) || !("event" in data)) return false;
  return (
    data.messageType === messageTypes["parent-originated-event"] &&
    isEventPayload(data.event)
  );
}

export interface ChildOriginatedMessageDataEventPayload extends BaseMessageData {
  messageType: typeof messageTypes["child-originated-event"];
  event: EventPayload;
}

function isChildOriginatedEvent(
  data: unknown,
): data is ChildOriginatedMessageDataEventPayload {
  if (!isBaseMessageData(data)) return false;
  if (!("messageType" in data) || !("event" in data)) return false;
  return (
    data.messageType === messageTypes["child-originated-event"] &&
    isEventPayload(data.event)
  );
}

function isWhitelistedMessage(message: MessageEvent, allowedOrigin: string) {
  if (allowedOrigin === wildcardOrigin) {
    return true;
  }

  if (typeof allowedOrigin === "string" && message.origin !== allowedOrigin) {
    return false;
  }

  return true;
}

export type EventMap = Record<string, StandardSchemaV1>;

export interface HandshakeOptions {
  maxHandshakeRequests?: number;
  handshakeRetryInterval?: number;
}

export interface CreateChildParams<
  IE extends EventMap,
  OE extends EventMap,
  T extends HTMLElement | Element,
> {
  container: T;
  url?: string;
  namespace?: string;
  iframeAttributes?: {
    [attr: string]: unknown;
  };
  inboundEvents?: IE;
  outboundEvents?: OE;
  handshakeOptions?: HandshakeOptions;
  enableLogging?: boolean;
}

export function createChild<
  IE extends EventMap,
  OE extends EventMap,
  T extends HTMLElement | Element = HTMLElement,
>({
  container,
  url,
  namespace,
  iframeAttributes,
  inboundEvents = {} as IE,
  outboundEvents = {} as OE,
  handshakeOptions = {},
  enableLogging,
}: CreateChildParams<IE, OE, T>) {
  const parentWindow = window;
  const iframe = crelt("iframe", iframeAttributes as object) as HTMLIFrameElement;
  if (url) {
    iframe.src = url;
  }

  const childOrigin = resolveOrigin(url);

  const log = createLogger(enableLogging);

  function destroy() {
    log("Destroying child iframe");

    parentWindow.removeEventListener("message", handleEventsFromChild, false);
    return iframe.remove();
  }

  type InboundEventName = keyof typeof inboundEvents;
  const listeners = new Map<
    symbol,
    {
      eventName: InboundEventName;
      handler: (data: unknown) => void;
    }
  >();

  function on<E extends keyof IE>(
    eventName: E,
    handler: (
      data: StandardSchemaV1.InferOutput<IE[E]>,
    ) => void | Promise<void>,
  ) {
    const listenerId = Symbol();
    listeners.set(listenerId, {
      eventName,
      handler,
    });
    log("Parent Frame Inbound Event Listener added:", eventName);

    return () => {
      log("Parent Frame Inbound Event Listener removed:", eventName);

      listeners.delete(listenerId);
    };
  }

  function emit<E extends keyof OE>(
    eventName: E,
    data: StandardSchemaV1.InferInput<OE[E]>,
  ) {
    const eventSchema = outboundEvents[eventName];
    if (!eventSchema) {
      throw new Error(
        `Parent Originated Event "${eventName.toString()}" is not defined in the outboundEvents map.`,
        {
          cause: errorCauses.event_name_invalid,
        },
      );
    }

    const dataParseResult = validateSync(eventSchema, data);
    if (!dataParseResult.success) {
      throw new Error(
        `Parent Originated Event "${eventName.toString()}" data is invalid: ${dataParseResult.error}`,
        {
          cause: errorCauses.event_data_invalid,
        },
      );
    }

    const event = {
      name: eventName.toString(),
      data: dataParseResult.data,
    };

    log("Parent Originated Event sent:", {
      namespace,
      event,
    });

    iframe.contentWindow?.postMessage(
      {
        contentType: eventContentType,
        messageType: messageTypes["parent-originated-event"],
        namespace,
        id: generateUniqueId(namespace),
        event: {
          name: eventName.toString(),
          data: dataParseResult.data,
        },
      } satisfies ParentOriginatedMessageDataEventPayload,
      childOrigin,
    );
  }

  function handleEventsFromChild(event: MessageEvent) {
    if (!isWhitelistedMessage(event, childOrigin)) {
      log(
        "Child Originated Event ignored due to non-whitelisted origin:",
        childOrigin,
        event.origin,
      );

      return;
    }

    if (namespace && event.data.namespace !== namespace) {
      log(
        "Child Originated Event ignored due to namespace mismatch:",
        namespace,
        event.data.namespace,
      );

      return;
    }

    if (!isChildOriginatedEvent(event.data)) {
      log("Child Originated Event ignored due to invalid message data:", event);

      return;
    }

    log("Child Originated Event accepted:", event);

    const { event: eventData } = event.data;
    const { name, data } = eventData;

    Array.from(listeners.values())
      .filter(({ eventName }) => eventName === name)
      .forEach(({ handler, eventName }) => {
        const dataParseResult = validateSync(inboundEvents[eventName]!, data);
        if (dataParseResult.success) {
          log("Child Originated Event Listener Handler invoked:", {
            eventName,
            data: dataParseResult.data,
          });

          handler(dataParseResult.data);
        }
      });
  }

  function executeHandshake() {
    return new Promise<{
      destroy: typeof destroy;
      parent: typeof parentWindow;
      iframe: typeof iframe;
      childOrigin: typeof childOrigin;
      on: typeof on;
      emit: typeof emit;
    }>((resolve, reject) => {
      const finalHandshakeOptions = {
        maxHandshakeRequests: 5,
        handshakeRetryInterval: 1000,
        ...handshakeOptions,
      };
      let handshakeAttempt = 0;
      let handshakeRetryIntervalTimer: ReturnType<typeof setInterval>;

      function handleHandshakeReply(
        event: MessageEvent<HandshakeReplyMessageData>,
      ) {
        log("Handshake Reply Event received:", event);

        if (!isWhitelistedMessage(event, childOrigin)) {
          log(
            "Handshake Reply Event ignored due to non-whitelisted origin:",
            childOrigin,
            event.origin,
          );

          return;
        }

        if (namespace && event.data.namespace !== namespace) {
          log(
            "Handshake Reply Event ignored due to namespace mismatch:",
            namespace,
            event.data.namespace,
          );

          return;
        }

        if (!isHandshakeReply(event.data)) {
          log(
            "Handshake Reply Event ignored due to invalid message data:",
            event,
          );

          return;
        }

        log("Handshake Reply Event accepted:", event);

        clearInterval(handshakeRetryIntervalTimer);
        parentWindow.removeEventListener(
          "message",
          handleHandshakeReply,
          false,
        );

        const api = {
          destroy,
          parent: parentWindow,
          iframe,
          childOrigin,
          on,
          emit,
        } as const;
        return resolve(api);
      }

      parentWindow.addEventListener("message", handleHandshakeReply, false);

      function sendHandshakeRequest() {
        handshakeAttempt++;

        iframe.contentWindow?.postMessage(
          {
            contentType: eventContentType,
            messageType: messageTypes["handshake-request"],
            namespace,
            id: generateUniqueId(namespace),
          } satisfies HandshakeRequestMessageData,
          childOrigin,
        );

        log("Handshake Request Sent: Attempt ", handshakeAttempt);

        if (handshakeAttempt === finalHandshakeOptions.maxHandshakeRequests) {
          clearInterval(handshakeRetryIntervalTimer);
          return reject(
            new Error(
              `Handshake failed after ${handshakeAttempt} attempts. Is the child window at ${childOrigin} listening for handshake requests?`,
              {
                cause: errorCauses.handshake_request_timeout,
              },
            ),
          );
        }
      }

      function handleIframeLoad(loadEvent: Event) {
        log("Iframe Load Event Listener received:", loadEvent);

        sendHandshakeRequest();
        handshakeRetryIntervalTimer = setInterval(
          sendHandshakeRequest,
          finalHandshakeOptions.handshakeRetryInterval,
        );
      }

      iframe.addEventListener("load", handleIframeLoad, false);

      container.appendChild(iframe);

      log("Iframe added to container's DOM tree");
    });
  }

  parentWindow.addEventListener("message", handleEventsFromChild, false);

  return {
    executeHandshake,
    on,
  };
}

export interface ConnectToParentParams<
  IE extends EventMap,
  OE extends EventMap,
> {
  namespace?: string;
  inboundEvents?: IE;
  outboundEvents?: OE;
  enableLogging?: boolean;
}

export function connectToParent<IE extends EventMap, OE extends EventMap>(
  {
    namespace,
    inboundEvents = {} as IE,
    outboundEvents = {} as OE,
    enableLogging,
  }: ConnectToParentParams<IE, OE> = {} as ConnectToParentParams<IE, OE>,
) {
  const child = window;

  const log = createLogger(enableLogging);

  type InboundEventName = keyof typeof inboundEvents;
  const listeners = new Map<
    symbol,
    {
      eventName: InboundEventName;
      handler: (data: unknown) => void;
    }
  >();

  function on<E extends keyof IE>(
    eventName: E,
    handler: (
      data: StandardSchemaV1.InferOutput<IE[E]>,
    ) => void | Promise<void>,
  ) {
    const listenerId = Symbol();
    listeners.set(listenerId, {
      eventName,
      handler,
    });
    log("Child Frame Inbound Event Listener added:", eventName);

    return () => {
      log("Child Frame Inbound Event Listener removed:", eventName);

      listeners.delete(listenerId);
    };
  }

  function createEmitter(parentOrigin: string) {
    function emit<E extends keyof OE>(
      eventName: E,
      data: StandardSchemaV1.InferInput<OE[E]>,
    ) {
      const eventSchema = outboundEvents[eventName];
      if (!eventSchema) {
        throw new Error(
          `Child Originated Event "${eventName.toString()}" is not defined in the outboundEvents map.`,
          {
            cause: errorCauses.event_name_invalid,
          },
        );
      }

      const dataParseResult = validateSync(eventSchema, data);
      if (!dataParseResult.success) {
        throw new Error(
          `Child Originated Event "${eventName.toString()}" data is invalid: ${dataParseResult.error}`,
          {
            cause: errorCauses.event_data_invalid,
          },
        );
      }

      const event = {
        name: eventName.toString(),
        data: dataParseResult.data,
      };

      log("Child Originated Event Sent:", {
        namespace,
        event,
      });

      parentRef.postMessage(
        {
          contentType: eventContentType,
          messageType: messageTypes["child-originated-event"],
          namespace,
          event,
          id: generateUniqueId(namespace),
        } satisfies ChildOriginatedMessageDataEventPayload,
        parentOrigin,
      );
    }

    return emit;
  }

  const parentRef = child.parent;

  function executeHandshake() {
    return new Promise<{
      child: typeof child;
      parent: typeof parentRef;
      parentOrigin: string;
      on: typeof on;
      emit: ReturnType<typeof createEmitter>;
    }>((resolve, reject) => {
      function handleHandshakeRequest(
        event: MessageEvent<HandshakeRequestMessageData>,
      ) {
        log("Handshake Request Event Listener received:", event);

        if (
          event.source instanceof MessagePort ||
          isEventSourceServiceWorker(event)
        ) {
          log(
            "Handshake Request Event Listener ignored due to invalid source type:",
            event.source,
          );

          return;
        }

        if (namespace && event.data.namespace !== namespace) {
          log(
            "Handshake Request Event Listener ignored due to namespace mismatch:",
            namespace,
            event.data.namespace,
          );

          return;
        }

        if (!isHandshakeRequest(event.data)) {
          reject(
            new Error("Invalid handshake request message data", {
              cause: errorCauses.handshake_request_invalid,
            }),
          );
          return;
        }

        child.removeEventListener("message", handleHandshakeRequest, false);

        const parentOrigin = event.origin;

        function handleEventsFromParent(parentEvent: MessageEvent) {
          if (!isWhitelistedMessage(parentEvent, parentOrigin)) {
            log(
              "Parent Originated Event ignored due to non-whitelisted origin:",
              parentOrigin,
              parentEvent.origin,
            );

            return;
          }

          if (namespace && parentEvent.data.namespace !== namespace) {
            log(
              "Parent Originated Event ignored due to namespace mismatch:",
              namespace,
              parentEvent.data.namespace,
            );

            return;
          }

          if (!isParentOriginatedEvent(parentEvent.data)) {
            log(
              "Parent Originated Event ignored due to invalid message data:",
              parentEvent,
            );

            return;
          }

          log("Parent Originated Event accepted:", parentEvent);

          const { event: eventData } = parentEvent.data;
          const { name, data } = eventData;

          Array.from(listeners.values())
            .filter(({ eventName }) => eventName === name)
            .forEach(({ handler, eventName }) => {
              const dataParseResult = validateSync(
                inboundEvents[eventName]!,
                data,
              );
              if (dataParseResult.success) {
                log(
                  "Parent Originated Event Listener Handler invoked:",
                  eventName,
                );

                handler(dataParseResult.data);
              }
            });
        }
        child.addEventListener("message", handleEventsFromParent, false);

        log("Handshake Reply sent:", parentOrigin);

        parentRef.postMessage(
          {
            contentType: eventContentType,
            messageType: messageTypes["handshake-reply"],
            namespace,
            id: generateUniqueId(namespace),
          } satisfies HandshakeReplyMessageData,
          parentOrigin,
        );

        const api = {
          child,
          parent: parentRef,
          parentOrigin,
          on,
          emit: createEmitter(parentOrigin),
        } as const;
        return resolve(api);
      }

      child.addEventListener("message", handleHandshakeRequest, false);

      log("Handshake Request Listener added");
    });
  }

  return {
    executeHandshake,
    on,
  };
}

function isEventSourceServiceWorker(event: MessageEvent) {
  try {
    return event.source instanceof ServiceWorker;
  } catch {
    return false;
  }
}
