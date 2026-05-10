# izod

![Bundle Size](https://img.shields.io/bundlephobia/minzip/@izod/core) ![npm version](https://badgen.net/npm/v/@izod/core) ![types](https://badgen.net/npm/types/@izod/core)

Type-safe iframe communication using the [Standard Schema](https://github.com/standard-schema/standard-schema) interface for runtime validation.

Works with any Standard Schema compliant validator — [zod](https://github.com/colinhacks/zod), [valibot](https://github.com/fabian-hiller/valibot), [arktype](https://github.com/arktypeio/arktype), and more.

## Packages

| Package | Description |
|---------|-------------|
| [`@izod/core`](./packages/core) | Iframe communication engine — no framework dependency |
| [`@izod/react`](./packages/react) | React hooks wrapper around `@izod/core` |

## Installation

```sh
# Core only
pnpm add @izod/core

# With React hooks
pnpm add @izod/core @izod/react
```

You also need a Standard Schema compliant validator as a peer:

```sh
pnpm add zod       # or valibot, arktype, etc.
```

## Quick Start

### Define shared event schemas

```ts
// events.ts
import { z } from "zod";
import type { EventMap } from "@izod/core";

export const parentEvents = {
  askQuestion: z.object({ question: z.string() }),
  shout: z.object({ message: z.string() }),
} as const satisfies EventMap;

export const childEvents = {
  answerQuestion: z.object({ answer: z.string() }),
  whisper: z.object({ message: z.string() }),
} as const satisfies EventMap;
```

### Parent page (creates the iframe)

```ts
import { createChild } from "@izod/core";
import { parentEvents, childEvents } from "./events";

const child = createChild({
  container: document.getElementById("app"),
  url: "https://child.example.com",
  inboundEvents: childEvents,
  outboundEvents: parentEvents,
});

child.on("whisper", (data) => {
  console.log(`Child whispered: ${data.message}`);
});

const api = await child.executeHandshake();
api.emit("shout", { message: "Hello from parent" });
```

### Child page (inside the iframe)

```ts
import { connectToParent } from "@izod/core";
import { parentEvents, childEvents } from "./events";

const parent = connectToParent({
  inboundEvents: parentEvents,
  outboundEvents: childEvents,
});

parent.on("shout", (data) => {
  console.log(`Parent shouted: ${data.message}`);
});

const api = await parent.executeHandshake();
api.emit("whisper", { message: "Hi from child" });
```

See individual package READMEs for full API documentation:

- [`@izod/core` README](./packages/core/README.md)
- [`@izod/react` README](./packages/react/README.md)

## Examples

The [`examples/`](./examples) directory contains a working Astro demo app with both core and React examples.

```sh
pnpm install
cd examples/astro-demo
pnpm dev
```

## Standard Schema Compatibility

Any validator implementing the [Standard Schema spec](https://github.com/standard-schema/standard-schema) works out of the box. Schemas must validate **synchronously** — async validators will throw a `TypeError`.

| Validator | Supported |
|-----------|-----------|
| zod (v3.24+, v4) | Yes |
| valibot | Yes |
| arktype | Yes |

## Development

```sh
pnpm install
pnpm run build        # build all packages
pnpm run test         # run tests
pnpm run test:coverage # run tests with coverage
pnpm run typecheck    # type-check
pnpm run lint         # oxlint
pnpm run format:check # check formatting
```

## Prior Art

- [Postmate](https://github.com/dollarshaveclub/postmate)

## License

MIT
