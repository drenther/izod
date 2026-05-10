# @izod/react

![Bundle Size](https://img.shields.io/bundlephobia/minzip/@izod/react) ![npm version](https://badgen.net/npm/v/@izod/react) ![types](https://badgen.net/npm/types/@izod/react)

React hooks for type-safe iframe communication. Wraps [`@izod/core`](../core) with React lifecycle management.

## Installation

```sh
pnpm add @izod/core @izod/react
```

`react` (>=16.8) and `@izod/core` are peer dependencies.

## API

### `child.useCreate(params)`

Hook for the **parent** component to create and manage a child iframe.

```tsx
import { child } from '@izod/react';

function Parent() {
  const [container] = useState(() => document.createElement('div'));

  const { on, executeHandshake, api, isHandshakeComplete, isHandshakePending, handshakeError } =
    child.useCreate({
      container, // DOM element for the iframe
      url: 'https://child.example.com',
      namespace: 'my-app', // optional
      inboundEvents: childEvents, // schemas for events FROM the child
      outboundEvents: parentEvents, // schemas for events TO the child
      iframeAttributes: {
        // optional
        style: 'width:100%;height:400px;border:none',
      },
      handshakeOptions: {
        // optional
        maxHandshakeRequests: 10,
        handshakeRetryInterval: 100,
      },
      onHandshakeComplete: (api) => {
        console.log('Connected!');
      },
      onHandshakeError: (error) => {
        console.error('Handshake failed:', error);
      },
      destroyOnUnmount: true, // default: true — remove iframe on unmount
    });

  useEffect(() => {
    const off = on('childMessage', (data) => {
      console.log(data);
    });
    return off;
  }, [on]);

  useEffect(() => {
    executeHandshake();
  }, [executeHandshake]);

  return (
    <>
      <div
        ref={(node) => {
          if (node && !node.contains(container)) node.appendChild(container);
        }}
      />
      {isHandshakeComplete && (
        <button onClick={() => api.emit('parentMessage', { text: 'hello' })}>Send</button>
      )}
    </>
  );
}
```

**Returns:**

| Property              | Type                              | Description                                    |
| --------------------- | --------------------------------- | ---------------------------------------------- |
| `on`                  | `(event, handler) => unsubscribe` | Register inbound event listener                |
| `executeHandshake`    | `() => void`                      | Start the handshake                            |
| `api`                 | `object \| undefined`             | Handshake result with `emit()` and `destroy()` |
| `isHandshakeComplete` | `boolean`                         | Whether handshake succeeded                    |
| `isHandshakePending`  | `boolean`                         | Whether handshake is in progress               |
| `handshakeError`      | `Error \| undefined`              | Handshake error, if any                        |

### `parent.useConnect(params)`

Hook for the **child** component (inside the iframe) to connect back to the parent.

```tsx
import { parent } from '@izod/react';

function Child() {
  const { on, executeHandshake, api, isHandshakeComplete, isHandshakePending, handshakeError } =
    parent.useConnect({
      namespace: 'my-app',
      inboundEvents: parentEvents,
      outboundEvents: childEvents,
      onHandshakeComplete: (api) => {
        console.log('Connected to parent!');
      },
      onHandshakeError: (error) => {
        console.error('Failed:', error);
      },
    });

  useEffect(() => {
    executeHandshake();
  }, [executeHandshake]);

  useEffect(() => {
    const off = on('parentMessage', (data) => {
      console.log(data);
    });
    return off;
  }, [on]);

  return <div>{isHandshakeComplete ? 'Connected' : 'Connecting...'}</div>;
}
```

**Returns:** same shape as `child.useCreate`.

## License

MIT
