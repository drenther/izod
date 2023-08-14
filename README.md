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

### @izod/core

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
// child.html

import { connectToParent } from '@izod/core';

// sets the boilerplate on the child side for completing the handshake
const parentApi = await connectToParent({
  inboundEvents: parentOriginEvents, // optional
  outboundEvents: childOriginEvents, // optional
});

// type safe event listeners for events coming from the child
parentApi.on('shout', (data) => {
  console.log(`Parent shouted: ${data.message}`);
});

// type safe event emitters
parentApi.emit('whisper', { message: 'Hi' });
```

### @izod/react

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

```tsx
// parent.tsx

import { child } from '@izod/react';

function Parent() {
  //  accepts all the parameters that `createChild` from @izod/core does
  // `api` is the same that is returned from `connectToParent` from @izod/core
  const { api } = child.useCreate({
    container: document.body, // required
    url: 'http://127.0.0.1:3010', // required
    inboundEvents: parentOriginEvents, // optional
    outboundEvents: childOriginEvents, // optional
    handshakeOptions: {
      // optional
      maxHandshakeRequests: 10, // default 5
      handshakeRetryInterval: 100, // default 1000
    },
    onHandshakeComplete(api) {
      // callback called when handshake is successful
    },
    onHandshakeError(error) {
      // callback called when handshake fails
    },
    // remove the iframe on component unmount
    destroyOnUnmount: false, // default false - optional
  });

  // `child.useEventListener` takes care of this boilerplate for you but is not fully type safe as of now
  // to add event listeners
  // prefer this over `onHandshakeComplete` for attaching event listeners
  useEffect(() => {
    // function is returned from `.on` that can be called to unsubscribe
    const off = api.on('askQuestion', (data) => {
      console.log('Question: ', data.question);
    });

    // return that from the useEffect for cleanup
    return off;
  }, [api]);

  const shout = () => {
    api.emit('shout', { message: 'Hello' });
  };
}
```

```tsx
// child.tsx

import { parent } from '@izod/react';

function Child() {
  // `api` is the same that is returned from `connectToParent` from @izod/core
  const { api } = parent.useConnect({
    inboundEvents: parentOriginEvents,
    outboundEvents: childOriginEvents,
    onHandshakeComplete(api) {
      // callback called when handshake is successful
    },
    onHandshakeError(error) {
      // callback called when handshake fails
    },
  });

  // `parent.useEventListener` takes care of this boilerplate for you but is not fully type safe as of now
  // to add event listeners
  useEffect(() => {
    // function is returned from `.on` that can be called to unsubscribe
    const off = api.on('shout', (data) => {
      console.log(`Parent shouted: ${data.message}`);
    });

    // return that from the useEffect for cleanup
    return off;
  }, [api]);

  const whisper = () => {
    api.emit('whisper', { message: 'Hi' });
  };
}
```

## Prior Art (packages I ~~copied~~ adapted code from)

- [Postmate](https://github.com/dollarshaveclub/postmate)
