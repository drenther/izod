# izod

> NOTE: This is very early stage, documentation is not complete and breaking API changes likely ahead. Please use at your own risk. Lock your version in case you use. (Even though I will adhere to semver for updates)

![Bundle Size](https://img.shields.io/bundlephobia/minzip/@izod/core) ![npm version](https://badgen.net/npm/v/@izod/core) ![types](https://badgen.net/npm/types/@izod/core)

`izod` leverages [zod](https://github.com/colinhacks/zod) to provide a type safe Promise oriented API to manage iframe communication.

## Installation

### core (only)

```sh
npm i zod @izod/core
```

### react

```sh
npm i zod @izod/core @izod/react
```

## Usage

#### @izod/core

```ts
// common event type maps

import { z } from 'zod';
import type { EventMap } from '@izod/core';

export const parentOriginEvents = {
  askQuestion: z.object({
    question: z.string(),
  }),
  shout: z.object({
    message: z.string(),
  }),
} as const satisfies EventMap;

export const childOriginEvents = {
  answerQuestion: z.object({
    answer: z.string(),
  }),
  whisper: z.object({
    message: z.string(),
  }),
} as const satisfies EventMap;
```

```ts
// In parent.html

// create the iframe, appends it to the container and initiates handshake
// promise is settled once handshake is successful or failed due to some fatal error or timeout
const childApi = await createChild({
  container: document.body, // required
  url: 'http://127.0.0.1:3010', // required
  inboundEvents: childOriginEvents, // optional
  outboundEvents: parentOriginEvents, // optional
  handshakeOptions: {
    // optional
    maxHandshakeRequests: 10, // default 5
    handshakeRetryInterval: 100, // default 1000
  },
});

// type safe event listeners for events coming from the child
childApi.on('whisper', (data) => {
  console.log(`Child whispered: ${data.message}`);
});

// type safe event emitters
childApi.emit('shout', { message: 'Hello' });
```

```ts
// In child.html

// sets the boilerplate on the child side for completing the handshake
const parentApi = await createChild({
  container: document.body, // required
  url: 'http://127.0.0.1:3010', // required
  inboundEvents: parentOriginEvents, // optional
  outboundEvents: childOriginEvents, // optional
  handshakeOptions: {
    // optional
    maxHandshakeRequests: 10, // default 5
    handshakeRetryInterval: 100, // default 1000
  },
});

// type safe event listeners for events coming from the child
parentApi.on('shout', (data) => {
  console.log(`Parent shouted: ${data.message}`);
});

// type safe event emitters
childApi.emit('whisper', { message: 'Hi' });
```

## Prior Art (packages I ~~copied~~ adapted code from)

- [Postmate](https://github.com/dollarshaveclub/postmate)
