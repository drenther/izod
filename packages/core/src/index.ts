import { z } from 'zod';
import crelt from 'crelt';
import { nanoid } from 'nanoid';

export const eventContentType = 'application/x-izod+json' as const;

const createLogger = (enabled: boolean = false): typeof console.info =>
  enabled ? console.info.bind(console) : () => {};

export const messageTypes = {
  'handshake-request': 'handshake-request',
  'handshake-reply': 'handshake-reply',
  'child-originated-event': 'child-originated-event',
  'parent-originated-event': 'parent-originated-event',
} as const;

export const errorCauses = {
  handshake_request_invalid: 'handshake_request_invalid',
  handshake_request_timeout: 'handshake_request_timeout',
  event_name_invalid: 'event_name_invalid',
  event_data_invalid: 'event_data_invalid',
} as const;

function resolveOrigin(url: string) {
  const a = document.createElement('a');
  a.href = url;
  const protocol =
    a.protocol.length > 4 ? a.protocol : window.location.protocol;
  const host = a.host.length
    ? a.port === '80' || a.port === '443'
      ? a.hostname
      : a.host
    : window.location.host;
  return a.origin || `${protocol}//${host}`;
}

export function generateUniqueId(namespace?: string) {
  return `${namespace ?? 'anon'}__${nanoid()}`;
}

const baseMessageDataSchema = z.object({
  contentType: z.literal(eventContentType),
  namespace: z.string().optional(),
  id: z.string(),
});

const HandshakeRequestMessageDataSchema = baseMessageDataSchema.extend({
  messageType: z.literal(messageTypes['handshake-request']),
});
export type HandshakeRequestMessageData = z.infer<
  typeof HandshakeRequestMessageDataSchema
>;

const HandshakeReplyMessageDataSchema = baseMessageDataSchema.extend({
  messageType: z.literal(messageTypes['handshake-reply']),
});
export type HandshakeReplyMessageData = z.infer<
  typeof HandshakeReplyMessageDataSchema
>;

const baseMessageDataEventPayloadSchema = baseMessageDataSchema.extend({
  event: z.object({
    name: z.string(),
    data: z.any(),
  }),
});

const ParentOriginatedMessageDataEventPayloadSchema =
  baseMessageDataEventPayloadSchema.extend({
    messageType: z.literal(messageTypes['parent-originated-event']),
  });
export type ParentOriginatedMessageDataEventPayload = z.infer<
  typeof ParentOriginatedMessageDataEventPayloadSchema
>;

const ChildOriginatedMessageDataEventPayloadSchema =
  baseMessageDataEventPayloadSchema.extend({
    messageType: z.literal(messageTypes['child-originated-event']),
  });
export type ChildOriginatedMessageDataEventPayload = z.infer<
  typeof ChildOriginatedMessageDataEventPayloadSchema
>;

function isWhitelistedMessage(message: MessageEvent, allowedOrigin: string) {
  if (typeof allowedOrigin === 'string' && message.origin !== allowedOrigin) {
    return false;
  }

  return true;
}

export type EventMap = Record<string, z.ZodTypeAny>;

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
  url: string;
  namespace?: string;
  iframeAttributes?: {
    [attr: string]: any;
  };
  inboundEvents?: IE;
  outboundEvents?: OE;
  handshakeOptions?: HandshakeOptions;
  enableLogging?: boolean;
}
export async function createChild<
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
  const parent = window;
  const iframe = crelt('iframe', iframeAttributes as any) as HTMLIFrameElement;
  iframe.src = url;

  const childOrigin = resolveOrigin(url);

  const log = createLogger(enableLogging);

  function destroy() {
    log('Destroying child iframe');

    parent.removeEventListener('message', handleEventsFromChild, false);
    return iframe.remove();
  }

  type InboundEventName = keyof typeof inboundEvents;
  const listeners = new Map<
    symbol,
    {
      eventName: InboundEventName;
      handler: (data: any) => void;
    }
  >();

  function on<E extends keyof IE>(
    eventName: E,
    handler: (data: z.infer<IE[E]>) => void | Promise<void>,
  ) {
    const listenerId = Symbol();
    listeners.set(listenerId, {
      eventName,
      handler,
    });
    log('Parent Frame Inbound Event Listener added:', eventName);

    return () => {
      log('Parent Frame Inbound Event Listener removed:', eventName);

      listeners.delete(listenerId);
    };
  }

  function emit<E extends keyof OE>(eventName: E, data: z.infer<OE[E]>) {
    const eventSchema = outboundEvents[eventName];
    if (!eventSchema) {
      throw new Error(
        `Parent Originated Event "${eventName.toString()}" is not defined in the outboundEvents map.`,
        {
          cause: errorCauses.event_name_invalid,
        },
      );
    }

    const dataParseResult = eventSchema.safeParse(data);
    if (!dataParseResult.success) {
      throw new Error(
        `Parent Originated Event "${eventName.toString()}" data is invalid: ${
          dataParseResult.error.message
        }`,
        {
          cause: errorCauses.event_data_invalid,
        },
      );
    }

    const event = {
      name: eventName.toString(),
      data: dataParseResult.data,
    };

    log('Parent Originated Event sent:', {
      namespace,
      event,
    });

    iframe.contentWindow?.postMessage(
      {
        contentType: eventContentType,
        messageType: messageTypes['parent-originated-event'],
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
        'Child Originated Event ignored due to non-whitelisted origin:',
        childOrigin,
        event.origin,
      );

      return;
    }

    if (namespace && event.data.namespace !== namespace) {
      log(
        'Child Originated Event ignored due to namespace mismatch:',
        namespace,
        event.data.namespace,
      );

      return;
    }

    const messageData = ChildOriginatedMessageDataEventPayloadSchema.safeParse(
      event.data,
    );
    if (!messageData.success) {
      log('Child Originated Event ignored due to invalid message data:', event);

      return;
    }

    log('Child Originated Event accepted:', event);

    const { event: eventData } = messageData.data;
    const { name, data } = eventData;

    Array.from(listeners.values())
      .filter(({ eventName }) => eventName === name)
      .forEach(({ handler, eventName }) => {
        const dataParseResult = inboundEvents[eventName]?.safeParse(data);
        if (dataParseResult?.success) {
          log('Child Originated Event Listener Handler invoked:', {
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
      parent: typeof parent;
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
        log('Handleshake Reply Event received:', event);

        if (!isWhitelistedMessage(event, childOrigin)) {
          log(
            'Handshake Reply Event ignored due to non-whitelisted origin:',
            childOrigin,
            event.origin,
          );

          return;
        }

        if (namespace && event.data.namespace !== namespace) {
          log(
            'Handshake Reply Event ignored due to namespace mismatch:',
            namespace,
            event.data.namespace,
          );

          return;
        }

        if (!HandshakeReplyMessageDataSchema.safeParse(event.data).success) {
          log(
            'Handshake Reply Event ignored due to invalid message data:',
            event,
          );

          return;
        }

        log('Handshake Reply Event accepted:', event);

        clearInterval(handshakeRetryIntervalTimer);
        parent.removeEventListener('message', handleHandshakeReply, false);
        parent.addEventListener('message', handleEventsFromChild, false);

        const api = {
          destroy,
          parent,
          iframe,
          childOrigin,
          on,
          emit,
        } as const;
        return resolve(api);
      }

      parent.addEventListener('message', handleHandshakeReply, false);

      function sendHandshakeRequest() {
        handshakeAttempt++;

        iframe.contentWindow?.postMessage(
          {
            contentType: eventContentType,
            messageType: messageTypes['handshake-request'],
            namespace,
            id: generateUniqueId(namespace),
          } satisfies HandshakeRequestMessageData,
          childOrigin,
        );

        log('Handshake Request Sent: Attempt ', handshakeAttempt);

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

      function handleIframeLoad(event: Event) {
        log('Iframe Load Event Listener received:', event);

        sendHandshakeRequest();
        handshakeRetryIntervalTimer = setInterval(
          sendHandshakeRequest,
          finalHandshakeOptions.handshakeRetryInterval,
        );
      }

      iframe.addEventListener('load', handleIframeLoad, false);

      container.appendChild(iframe);

      log("Iframe added to container's DOM tree");
    });
  }

  return executeHandshake();
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
export async function connectToParent<IE extends EventMap, OE extends EventMap>(
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
      handler: (data: any) => void;
    }
  >();

  const parent = child.parent;
  const api = {
    child,
    parent,
    parentOrigin: '' as string, // will be set post handshake
    on<E extends keyof IE>(
      eventName: E,
      handler: (data: z.infer<IE[E]>) => void | Promise<void>,
    ) {
      const listenerId = Symbol();
      listeners.set(listenerId, {
        eventName,
        handler,
      });
      log('Child Frame Inbound Event Listener added:', eventName);

      return () => {
        log('Child Frame Inbound Event Listener removed:', eventName);

        listeners.delete(listenerId);
      };
    },
    emit<E extends keyof OE>(eventName: E, data: z.infer<OE[E]>) {
      const eventSchema = outboundEvents[eventName];
      if (!eventSchema) {
        throw new Error(
          `Child Originated Event "${eventName.toString()}" is not defined in the outboundEvents map.`,
          {
            cause: errorCauses.event_name_invalid,
          },
        );
      }

      const dataParseResult = eventSchema.safeParse(data);
      if (!dataParseResult.success) {
        throw new Error(
          `Child Originated Event "${eventName.toString()}" data is invalid: ${
            dataParseResult.error.message
          }`,
          {
            cause: errorCauses.event_data_invalid,
          },
        );
      }

      const event = {
        name: eventName.toString(),
        data: dataParseResult.data,
      };

      log('Child Originated Event Sent:', {
        namespace,
        event,
      });

      parent.postMessage(
        {
          contentType: eventContentType,
          messageType: messageTypes['child-originated-event'],
          namespace,
          event,
          id: generateUniqueId(namespace),
        } satisfies ChildOriginatedMessageDataEventPayload,
        this.parentOrigin,
      );
    },
  } as const;

  return new Promise<typeof api>((resolve, reject) => {
    function handleHandshakeRequest(
      event: MessageEvent<HandshakeRequestMessageData>,
    ) {
      log('Handshake Request Event Listener received:', event);

      if (
        event.source instanceof MessagePort ||
        event.source instanceof ServiceWorker
      ) {
        log(
          'Handshake Request Event Listener ignored due to invalid source type:',
          event.source,
        );

        return;
      }

      if (namespace && event.data.namespace !== namespace) {
        log(
          'Handshake Request Event Listener ignored due to namespace mismatch:',
          namespace,
          event.data.namespace,
        );

        return;
      }

      if (!HandshakeRequestMessageDataSchema.safeParse(event.data).success) {
        reject(
          new Error('Invalid handshake request message data', {
            cause: errorCauses.handshake_request_invalid,
          }),
        );
        return;
      }

      child.removeEventListener('message', handleHandshakeRequest, false);

      const parentOrigin = event.origin;
      // @ts-ignore
      api.parentOrigin = parentOrigin;

      child.addEventListener('message', handleEventsFromParent, false);

      log('Handshake Reply sent:', parentOrigin);

      parent.postMessage(
        {
          contentType: eventContentType,
          messageType: messageTypes['handshake-reply'],
          namespace,
          id: generateUniqueId(namespace),
        } satisfies HandshakeReplyMessageData,
        parentOrigin,
      );

      return resolve(api);

      function handleEventsFromParent(event: MessageEvent) {
        if (!isWhitelistedMessage(event, parentOrigin)) {
          log(
            'Parent Originated Event ignored due to non-whitelisted origin:',
            parentOrigin,
            event.origin,
          );

          return;
        }

        if (namespace && event.data.namespace !== namespace) {
          log(
            'Parent Originated Event ignored due to namespace mismatch:',
            namespace,
            event.data.namespace,
          );

          return;
        }

        const messageData =
          ParentOriginatedMessageDataEventPayloadSchema.safeParse(event.data);
        if (!messageData.success) {
          log(
            'Parent Originated Event ignored due to invalid message data:',
            event,
          );

          return;
        }

        log('Parent Originated Event accepted:', event);

        const { event: eventData } = messageData.data;
        const { name, data } = eventData;

        Array.from(listeners.values())
          .filter(({ eventName }) => eventName === name)
          .forEach(({ handler, eventName }) => {
            const dataParseResult = inboundEvents[eventName]?.safeParse(data);
            if (dataParseResult?.success) {
              log(
                'Parent Originated Event Listener Handler invoked:',
                eventName,
              );

              handler(dataParseResult.data);
            }
          });
      }
    }

    child.addEventListener('message', handleHandshakeRequest, false);

    log('Handshake Request Listener added');
  });
}
