# @izod/core

> NOTE: This is very early stage, documentation is not complete and breaking API changes likely ahead. Please use at your own risk. Lock your version in case you use. (Even though I will adhere to semver for updates)

![Bundle Size](https://img.shields.io/bundlephobia/minzip/@izod/core) ![npm version](https://badgen.net/npm/v/@izod/core) ![types](https://badgen.net/npm/types/@izod/core)

`izod` leverages [zod](https://github.com/colinhacks/zod) to provide a type safe Promise oriented API to manage iframe communication.

## Installation

```sh
npm i zod @izod/core
```

## Usage

```ts
// common.ts

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
// parent.html

import { createChild } from '@izod/core';

// create the child instance (not mounted until handshake is executed)
const child = createChild({
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

// perfect time to setup event listeners so that they are ready once the handshake is over
// type safe event listeners for events coming from the child
child.on('whisper', (data) => {
  console.log(`Child whispered: ${data.message}`);
});

const childApi = await child.executeHandshake();

// type safe event emitters
childApi.emit('shout', { message: 'Hello' });
```

```ts
// child.html

import { connectToParent } from '@izod/core';

// sets the boilerplate
const parent = connectToParent({
  inboundEvents: parentOriginEvents, // optional
  outboundEvents: childOriginEvents, // optional
});

// type safe event listeners for events coming from the parent
parent.on('shout', (data) => {
  console.log(`Parent shouted: ${data.message}`);
});

const parentApi = await parent.executeHandshake();

// type safe event emitters
parentApi.emit('whisper', { message: 'Hi' });
```
