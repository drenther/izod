# @izod/core

Type-safe iframe communication engine using the [Standard Schema](https://github.com/standard-schema/standard-schema) interface for runtime validation. No framework dependency.

## Installation

```sh
pnpm add @izod/core
```

You also need a Standard Schema compliant validator:

```sh
pnpm add zod  # or valibot, arktype, etc.
```

## API

### `createChild(params)`

Called from the **parent** page to create and manage a child iframe.

```ts
import { createChild } from "@izod/core";

const child = createChild({
  container: document.getElementById("app"), // DOM element to append iframe to
  url: "https://child.example.com",          // child page URL
  namespace: "my-app",                       // optional — isolate message channels
  inboundEvents: childEvents,                // schemas for events FROM the child
  outboundEvents: parentEvents,              // schemas for events TO the child
  iframeAttributes: {                        // optional — passed to the iframe element
    style: "width:100%;height:400px;border:none",
  },
  handshakeOptions: {                        // optional
    maxHandshakeRequests: 10,                // default: 5
    handshakeRetryInterval: 100,             // default: 1000 (ms)
  },
  enableLogging: false,                      // optional — log internal messages
});
```

**Returns:**

- `on(eventName, handler)` — register a listener for inbound events. Returns an unsubscribe function.
- `executeHandshake()` — returns a `Promise` that resolves with the API object once the child is ready.

**Handshake result API:**

- `emit(eventName, data)` — send a validated event to the child.
- `destroy()` — remove the iframe and clean up listeners.

### `connectToParent(params)`

Called from the **child** page to connect back to the parent.

```ts
import { connectToParent } from "@izod/core";

const parent = connectToParent({
  namespace: "my-app",           // must match the parent's namespace
  inboundEvents: parentEvents,   // schemas for events FROM the parent
  outboundEvents: childEvents,   // schemas for events TO the parent
  enableLogging: false,          // optional
});
```

**Returns:** same shape as `createChild` — `on()`, `executeHandshake()`.

**Handshake result API:**

- `emit(eventName, data)` — send a validated event to the parent.

### `EventMap`

Type alias for event schema maps:

```ts
import type { EventMap } from "@izod/core";

const events = {
  ping: z.object({ timestamp: z.number() }),
  message: z.object({ text: z.string() }),
} as const satisfies EventMap;
```

Each value must be a Standard Schema compliant validator. Schemas must validate synchronously.

## Error Handling

Event validation errors include a `cause` property:

| Cause | Meaning |
|-------|---------|
| `event_name_invalid` | Event name not in the schema map |
| `event_data_invalid` | Data failed schema validation |
| `handshake_request_invalid` | Malformed handshake message |
| `handshake_request_timeout` | Handshake timed out |

## License

MIT
