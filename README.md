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

### @izod/react

```tsx
// parent.tsx

import { child } from '@izod/react';

function Parent() {
  //  accepts all the parameters that `createChild` from @izod/core does
  // `api` is the same that is returned from `connectToParent.executeHandshake` from @izod/core
  // `on` can be used to attach event listeners
  const { on, api, executeHandshake } = child.useCreate({
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
    if (api) {
      // function is returned from `.on` that can be called to unsubscribe
      const off = on('askQuestion', (data) => {
        console.log('Question: ', data.question);
      });

      // return that from the useEffect for cleanup
      return off;
    }
  }, [api]);

  const ranOnce = useRef(false);
  useEffect(() => {
    if (ranOnce.current) {
      return;
    }

    executeHandshake();
    ranOnce.current = true;
  }, []);

  const shout = () => {
    api.emit('shout', { message: 'Hello' });
  };
}
```

```tsx
// child.tsx

import { parent } from '@izod/react';

function Child() {
  // `api` is the same that is returned from `connectToParent.executeHandshake` from @izod/core
  const { on, api, executeHandshake } = parent.useConnect({
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
    if (api) {
      const off = api.on('shout', (data) => {
        console.log(`Parent shouted: ${data.message}`);
      });

      // return that from the useEffect for cleanup
      return off;
    }
  }, [api]);

  const ranOnce = useRef(false);
  useEffect(() => {
    if (ranOnce.current) {
      return;
    }

    executeHandshake();
    ranOnce.current = true;
  }, []);

  const whisper = () => {
    api.emit('whisper', { message: 'Hi' });
  };
}
```

## Prior Art (packages I ~~copied~~ adapted code from)

- [Postmate](https://github.com/dollarshaveclub/postmate)
