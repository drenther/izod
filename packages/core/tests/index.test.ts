import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { StandardSchemaV1 } from '@standard-schema/spec';
import {
  createChild,
  connectToParent,
  errorCauses,
  eventContentType,
  messageTypes,
} from '../src/index.js';

function createMockSchema<T>(
  validateFn: (value: unknown) => StandardSchemaV1.Result<T>,
): StandardSchemaV1<T, T> {
  return {
    '~standard': {
      version: 1,
      vendor: 'test',
      validate: validateFn,
    },
  };
}

function createPassthroughSchema<T>(): StandardSchemaV1<T, T> {
  return createMockSchema((value) => ({ value: value as T }));
}

function createFailingSchema(issues: StandardSchemaV1.Issue[]): StandardSchemaV1 {
  return createMockSchema(() => ({ issues }));
}

function createAsyncSchema(): StandardSchemaV1 {
  return {
    '~standard': {
      version: 1,
      vendor: 'test',
      validate: () => Promise.resolve({ value: 'async' }),
    },
  } as unknown as StandardSchemaV1;
}

function completeParentHandshake(container: HTMLElement, origin?: string) {
  const iframe = container.querySelector('iframe')!;
  Object.defineProperty(iframe, 'contentWindow', {
    value: { postMessage: vi.fn() },
    configurable: true,
  });

  window.dispatchEvent(
    new MessageEvent('message', {
      data: {
        contentType: eventContentType,
        messageType: messageTypes['handshake-reply'],
        id: 'test-id',
      },
      origin: origin ?? '',
    }),
  );
}

describe('createChild', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    return () => {
      container.remove();
    };
  });

  it('returns executeHandshake and on functions', () => {
    const result = createChild({ container });
    expect(result).toHaveProperty('executeHandshake');
    expect(result).toHaveProperty('on');
    expect(typeof result.executeHandshake).toBe('function');
    expect(typeof result.on).toBe('function');
  });

  it('creates an iframe in the container', () => {
    createChild({ container, url: 'https://example.com' });
    expect(container.querySelector('iframe')).toBeNull();

    createChild({ container, url: 'https://example.com' }).executeHandshake();
    const iframe = container.querySelector('iframe');
    expect(iframe).not.toBeNull();
    expect(iframe?.src).toBe('https://example.com/');
  });

  it('registers an event listener on subscribe', () => {
    const handler = vi.fn();
    const inboundEvents = {
      testEvent: createPassthroughSchema(),
    };

    const { on } = createChild({ container, inboundEvents });
    const unsubscribe = on('testEvent', handler);
    expect(typeof unsubscribe).toBe('function');
  });

  it('unsubscribe removes the listener', () => {
    const handler = vi.fn();
    const inboundEvents = {
      testEvent: createPassthroughSchema(),
    };

    const { on } = createChild({ container, inboundEvents });
    const unsubscribe = on('testEvent', handler);
    unsubscribe();
  });
});

describe('connectToParent', () => {
  it('returns executeHandshake and on functions', () => {
    const result = connectToParent();
    expect(result).toHaveProperty('executeHandshake');
    expect(result).toHaveProperty('on');
    expect(typeof result.executeHandshake).toBe('function');
    expect(typeof result.on).toBe('function');
  });

  it('registers an event listener on subscribe', () => {
    const handler = vi.fn();
    const inboundEvents = {
      testEvent: createPassthroughSchema(),
    };

    const { on } = connectToParent({ inboundEvents });
    const unsubscribe = on('testEvent', handler);
    expect(typeof unsubscribe).toBe('function');
  });

  it('resolves handshake on valid request', async () => {
    const parentPostMessage = vi.spyOn(window.parent, 'postMessage').mockImplementation(() => {});

    const { executeHandshake } = connectToParent({ namespace: 'child-test' });
    const handshakePromise = executeHandshake();

    window.dispatchEvent(
      new MessageEvent('message', {
        data: {
          contentType: eventContentType,
          messageType: messageTypes['handshake-request'],
          namespace: 'child-test',
          id: 'req-1',
        },
        origin: 'https://parent.example.com',
        source: window,
      }),
    );

    const api = await handshakePromise;
    expect(api).toHaveProperty('on');
    expect(api).toHaveProperty('emit');
    expect(api).toHaveProperty('parentOrigin');
    expect(api.parentOrigin).toBe('https://parent.example.com');

    expect(parentPostMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        contentType: eventContentType,
        messageType: messageTypes['handshake-reply'],
        namespace: 'child-test',
      }),
      'https://parent.example.com',
    );

    parentPostMessage.mockRestore();
  });

  it('ignores handshake request with wrong namespace', async () => {
    const parentPostMessage = vi.spyOn(window.parent, 'postMessage').mockImplementation(() => {});

    const { executeHandshake } = connectToParent({ namespace: 'correct-ns' });
    const handshakePromise = executeHandshake();

    window.dispatchEvent(
      new MessageEvent('message', {
        data: {
          contentType: eventContentType,
          messageType: messageTypes['handshake-request'],
          namespace: 'wrong-ns',
          id: 'req-wrong',
        },
        origin: 'https://parent.example.com',
        source: window,
      }),
    );

    window.dispatchEvent(
      new MessageEvent('message', {
        data: {
          contentType: eventContentType,
          messageType: messageTypes['handshake-request'],
          namespace: 'correct-ns',
          id: 'req-correct',
        },
        origin: 'https://parent.example.com',
        source: window,
      }),
    );

    const api = await handshakePromise;
    expect(api).toHaveProperty('emit');

    parentPostMessage.mockRestore();
  });

  it('rejects on invalid handshake request data', async () => {
    const { executeHandshake } = connectToParent();
    const handshakePromise = executeHandshake();

    window.dispatchEvent(
      new MessageEvent('message', {
        data: {
          contentType: eventContentType,
          messageType: 'garbage',
          id: 'req-bad',
        },
        source: window,
      }),
    );

    await expect(handshakePromise).rejects.toThrow('Invalid handshake request message data');
  });

  it('emits events to parent after handshake', async () => {
    const parentPostMessage = vi.spyOn(window.parent, 'postMessage').mockImplementation(() => {});

    const outboundEvents = {
      childMsg: createPassthroughSchema<{ text: string }>(),
    };

    const { executeHandshake } = connectToParent({ outboundEvents });
    const handshakePromise = executeHandshake();

    window.dispatchEvent(
      new MessageEvent('message', {
        data: {
          contentType: eventContentType,
          messageType: messageTypes['handshake-request'],
          id: 'req-1',
        },
        origin: 'https://parent.example.com',
        source: window,
      }),
    );

    const api = await handshakePromise;
    api.emit('childMsg', { text: 'hello parent' });

    expect(parentPostMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        contentType: eventContentType,
        messageType: messageTypes['child-originated-event'],
        event: expect.objectContaining({
          name: 'childMsg',
          data: { text: 'hello parent' },
        }),
      }),
      'https://parent.example.com',
    );

    parentPostMessage.mockRestore();
  });

  it('throws on invalid event name in child emit', async () => {
    const parentPostMessage = vi.spyOn(window.parent, 'postMessage').mockImplementation(() => {});

    const outboundEvents = {
      validEvent: createPassthroughSchema(),
    };

    const { executeHandshake } = connectToParent({ outboundEvents });
    const handshakePromise = executeHandshake();

    window.dispatchEvent(
      new MessageEvent('message', {
        data: {
          contentType: eventContentType,
          messageType: messageTypes['handshake-request'],
          id: 'req-1',
        },
        source: window,
      }),
    );

    const api = await handshakePromise;
    expect(() => (api.emit as (name: string, data: unknown) => void)('noSuchEvent', {})).toThrow(
      'not defined in the outboundEvents map',
    );

    parentPostMessage.mockRestore();
  });

  it('throws on invalid data in child emit', async () => {
    const parentPostMessage = vi.spyOn(window.parent, 'postMessage').mockImplementation(() => {});

    const outboundEvents = {
      testEvent: createFailingSchema([{ message: 'bad data' }]),
    };

    const { executeHandshake } = connectToParent({ outboundEvents });
    const handshakePromise = executeHandshake();

    window.dispatchEvent(
      new MessageEvent('message', {
        data: {
          contentType: eventContentType,
          messageType: messageTypes['handshake-request'],
          id: 'req-1',
        },
        source: window,
      }),
    );

    const api = await handshakePromise;
    try {
      api.emit('testEvent', 'bad');
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).cause).toBe(errorCauses.event_data_invalid);
    }

    parentPostMessage.mockRestore();
  });

  it('receives inbound events from parent after handshake', async () => {
    const parentPostMessage = vi.spyOn(window.parent, 'postMessage').mockImplementation(() => {});

    const handler = vi.fn();
    const inboundEvents = {
      parentMsg: createPassthroughSchema<{ text: string }>(),
    };

    const { executeHandshake, on } = connectToParent({ inboundEvents });
    on('parentMsg', handler);

    const handshakePromise = executeHandshake();

    window.dispatchEvent(
      new MessageEvent('message', {
        data: {
          contentType: eventContentType,
          messageType: messageTypes['handshake-request'],
          id: 'req-1',
        },
        origin: 'https://parent.example.com',
        source: window,
      }),
    );

    await handshakePromise;

    window.dispatchEvent(
      new MessageEvent('message', {
        data: {
          contentType: eventContentType,
          messageType: messageTypes['parent-originated-event'],
          id: 'evt-1',
          event: { name: 'parentMsg', data: { text: 'hi child' } },
        },
        origin: 'https://parent.example.com',
      }),
    );

    expect(handler).toHaveBeenCalledWith({ text: 'hi child' });

    parentPostMessage.mockRestore();
  });

  it('drops parent events from wrong origin', async () => {
    const parentPostMessage = vi.spyOn(window.parent, 'postMessage').mockImplementation(() => {});

    const handler = vi.fn();
    const inboundEvents = {
      parentMsg: createPassthroughSchema(),
    };

    const { executeHandshake, on } = connectToParent({ inboundEvents });
    on('parentMsg', handler);

    const handshakePromise = executeHandshake();

    window.dispatchEvent(
      new MessageEvent('message', {
        data: {
          contentType: eventContentType,
          messageType: messageTypes['handshake-request'],
          id: 'req-1',
        },
        origin: 'https://parent.example.com',
        source: window,
      }),
    );

    await handshakePromise;

    window.dispatchEvent(
      new MessageEvent('message', {
        data: {
          contentType: eventContentType,
          messageType: messageTypes['parent-originated-event'],
          id: 'evt-1',
          event: { name: 'parentMsg', data: 'sneaky' },
        },
        origin: 'https://evil.example.com',
      }),
    );

    expect(handler).not.toHaveBeenCalled();

    parentPostMessage.mockRestore();
  });
});

describe('Standard Schema validation', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    return () => {
      container.remove();
    };
  });

  it('throws on invalid event name in emit', () => {
    const outboundEvents = {
      validEvent: createPassthroughSchema(),
    };

    const { executeHandshake } = createChild({ container, outboundEvents });
    const handshakePromise = executeHandshake();
    completeParentHandshake(container);

    return handshakePromise.then((api) => {
      expect(() =>
        (api.emit as (name: string, data: unknown) => void)('invalidEvent', 'data'),
      ).toThrow('not defined in the outboundEvents map');
    });
  });

  it('throws on invalid data for emit', () => {
    const issues: StandardSchemaV1.Issue[] = [{ message: 'invalid data' }];
    const outboundEvents = {
      testEvent: createFailingSchema(issues),
    };

    const { executeHandshake } = createChild({ container, outboundEvents });
    const handshakePromise = executeHandshake();
    completeParentHandshake(container);

    return handshakePromise.then((api) => {
      try {
        api.emit('testEvent', 'bad-data');
        expect.unreachable('should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).cause).toBe(errorCauses.event_data_invalid);
      }
    });
  });

  it('throws TypeError for async schemas', () => {
    const outboundEvents = {
      testEvent: createAsyncSchema(),
    };

    const { executeHandshake } = createChild({ container, outboundEvents });
    const handshakePromise = executeHandshake();
    completeParentHandshake(container);

    return handshakePromise.then((api) => {
      expect(() => api.emit('testEvent', 'data')).toThrow(TypeError);
      expect(() => api.emit('testEvent', 'data')).toThrow('Schema validation must be synchronous');
    });
  });

  it('emits valid data successfully', () => {
    const outboundEvents = {
      testEvent: createPassthroughSchema<string>(),
    };

    const { executeHandshake } = createChild({ container, outboundEvents });
    const handshakePromise = executeHandshake();
    completeParentHandshake(container);

    return handshakePromise.then((api) => {
      api.emit('testEvent', 'hello');

      const iframe = container.querySelector('iframe')!;
      const postMessageSpy = (
        iframe as unknown as { contentWindow: { postMessage: ReturnType<typeof vi.fn> } }
      ).contentWindow.postMessage;
      expect(postMessageSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          contentType: eventContentType,
          messageType: messageTypes['parent-originated-event'],
          event: expect.objectContaining({
            name: 'testEvent',
            data: 'hello',
          }),
        }),
        expect.any(String),
      );
    });
  });
});

describe('handshake', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    return () => {
      container.remove();
    };
  });

  it('resolves on valid handshake reply', async () => {
    const { executeHandshake } = createChild({
      container,
      url: 'https://example.com',
    });

    const handshakePromise = executeHandshake();

    const iframe = container.querySelector('iframe')!;
    Object.defineProperty(iframe, 'contentWindow', {
      value: { postMessage: vi.fn() },
    });

    window.dispatchEvent(
      new MessageEvent('message', {
        data: {
          contentType: eventContentType,
          messageType: messageTypes['handshake-reply'],
          id: 'reply-id',
        },
        origin: 'https://example.com',
      }),
    );

    const api = await handshakePromise;
    expect(api).toHaveProperty('destroy');
    expect(api).toHaveProperty('on');
    expect(api).toHaveProperty('emit');
    expect(api).toHaveProperty('iframe');
    expect(api).toHaveProperty('childOrigin');
  });

  it('rejects after max handshake attempts', async () => {
    const { executeHandshake } = createChild({
      container,
      handshakeOptions: {
        maxHandshakeRequests: 1,
        handshakeRetryInterval: 10,
      },
    });

    const handshakePromise = executeHandshake();

    const iframe = container.querySelector('iframe')!;
    Object.defineProperty(iframe, 'contentWindow', {
      value: { postMessage: vi.fn() },
    });

    iframe.dispatchEvent(new Event('load'));

    await expect(handshakePromise).rejects.toThrow('Handshake failed after');
  });

  it('filters messages by namespace', async () => {
    const { executeHandshake } = createChild({
      container,
      namespace: 'test-ns',
    });

    const handshakePromise = executeHandshake();

    const iframe = container.querySelector('iframe')!;
    Object.defineProperty(iframe, 'contentWindow', {
      value: { postMessage: vi.fn() },
    });

    window.dispatchEvent(
      new MessageEvent('message', {
        data: {
          contentType: eventContentType,
          messageType: messageTypes['handshake-reply'],
          namespace: 'wrong-ns',
          id: 'reply-id',
        },
      }),
    );

    window.dispatchEvent(
      new MessageEvent('message', {
        data: {
          contentType: eventContentType,
          messageType: messageTypes['handshake-reply'],
          namespace: 'test-ns',
          id: 'reply-id-2',
        },
      }),
    );

    const api = await handshakePromise;
    expect(api).toHaveProperty('on');
  });
});

describe('inbound events', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    return () => {
      container.remove();
    };
  });

  it('parent receives child-originated events', async () => {
    const handler = vi.fn();
    const inboundEvents = {
      childMsg: createPassthroughSchema<{ text: string }>(),
    };

    const { executeHandshake, on } = createChild({ container, inboundEvents });
    on('childMsg', handler);

    const handshakePromise = executeHandshake();
    completeParentHandshake(container);
    await handshakePromise;

    window.dispatchEvent(
      new MessageEvent('message', {
        data: {
          contentType: eventContentType,
          messageType: messageTypes['child-originated-event'],
          id: 'evt-1',
          event: { name: 'childMsg', data: { text: 'hello parent' } },
        },
      }),
    );

    expect(handler).toHaveBeenCalledWith({ text: 'hello parent' });
  });

  it('dispatches to multiple listeners for the same event', async () => {
    const handler1 = vi.fn();
    const handler2 = vi.fn();
    const inboundEvents = {
      ping: createPassthroughSchema<string>(),
    };

    const { executeHandshake, on } = createChild({ container, inboundEvents });
    on('ping', handler1);
    on('ping', handler2);

    const handshakePromise = executeHandshake();
    completeParentHandshake(container);
    await handshakePromise;

    window.dispatchEvent(
      new MessageEvent('message', {
        data: {
          contentType: eventContentType,
          messageType: messageTypes['child-originated-event'],
          id: 'evt-1',
          event: { name: 'ping', data: 'pong' },
        },
      }),
    );

    expect(handler1).toHaveBeenCalledWith('pong');
    expect(handler2).toHaveBeenCalledWith('pong');
  });

  it('unsubscribed listener does not receive events', async () => {
    const handler = vi.fn();
    const inboundEvents = {
      testEvent: createPassthroughSchema(),
    };

    const { executeHandshake, on } = createChild({ container, inboundEvents });
    const unsubscribe = on('testEvent', handler);
    unsubscribe();

    const handshakePromise = executeHandshake();
    completeParentHandshake(container);
    await handshakePromise;

    window.dispatchEvent(
      new MessageEvent('message', {
        data: {
          contentType: eventContentType,
          messageType: messageTypes['child-originated-event'],
          id: 'evt-1',
          event: { name: 'testEvent', data: 'value' },
        },
      }),
    );

    expect(handler).not.toHaveBeenCalled();
  });

  it('silently drops events with unknown names', async () => {
    const handler = vi.fn();
    const inboundEvents = {
      knownEvent: createPassthroughSchema(),
    };

    const { executeHandshake, on } = createChild({ container, inboundEvents });
    on('knownEvent', handler);

    const handshakePromise = executeHandshake();
    completeParentHandshake(container);
    await handshakePromise;

    window.dispatchEvent(
      new MessageEvent('message', {
        data: {
          contentType: eventContentType,
          messageType: messageTypes['child-originated-event'],
          id: 'evt-1',
          event: { name: 'unknownEvent', data: 'value' },
        },
      }),
    );

    expect(handler).not.toHaveBeenCalled();
  });

  it('silently drops events failing inbound validation', async () => {
    const handler = vi.fn();
    const inboundEvents = {
      strictEvent: createFailingSchema([{ message: 'bad' }]),
    };

    const { executeHandshake, on } = createChild({ container, inboundEvents });
    on('strictEvent', handler);

    const handshakePromise = executeHandshake();
    completeParentHandshake(container);
    await handshakePromise;

    window.dispatchEvent(
      new MessageEvent('message', {
        data: {
          contentType: eventContentType,
          messageType: messageTypes['child-originated-event'],
          id: 'evt-1',
          event: { name: 'strictEvent', data: 'invalid' },
        },
      }),
    );

    expect(handler).not.toHaveBeenCalled();
  });

  it('drops events from non-whitelisted origin', async () => {
    const handler = vi.fn();
    const inboundEvents = {
      childMsg: createPassthroughSchema(),
    };

    const { executeHandshake, on } = createChild({
      container,
      url: 'https://trusted.example.com',
      inboundEvents,
    });
    on('childMsg', handler);

    const handshakePromise = executeHandshake();
    completeParentHandshake(container, 'https://trusted.example.com');
    await handshakePromise;

    window.dispatchEvent(
      new MessageEvent('message', {
        data: {
          contentType: eventContentType,
          messageType: messageTypes['child-originated-event'],
          id: 'evt-1',
          event: { name: 'childMsg', data: 'sneaky' },
        },
        origin: 'https://evil.example.com',
      }),
    );

    expect(handler).not.toHaveBeenCalled();
  });

  it('ignores events with wrong namespace', async () => {
    const handler = vi.fn();
    const inboundEvents = {
      testEvent: createPassthroughSchema(),
    };

    const { executeHandshake, on } = createChild({
      container,
      namespace: 'app-ns',
      inboundEvents,
    });
    on('testEvent', handler);

    const handshakePromise = executeHandshake();

    const iframe = container.querySelector('iframe')!;
    Object.defineProperty(iframe, 'contentWindow', {
      value: { postMessage: vi.fn() },
      configurable: true,
    });

    window.dispatchEvent(
      new MessageEvent('message', {
        data: {
          contentType: eventContentType,
          messageType: messageTypes['handshake-reply'],
          namespace: 'app-ns',
          id: 'reply-id',
        },
      }),
    );

    await handshakePromise;

    window.dispatchEvent(
      new MessageEvent('message', {
        data: {
          contentType: eventContentType,
          messageType: messageTypes['child-originated-event'],
          namespace: 'other-ns',
          id: 'evt-1',
          event: { name: 'testEvent', data: 'value' },
        },
      }),
    );

    expect(handler).not.toHaveBeenCalled();
  });
});

describe('destroy', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    return () => {
      container.remove();
    };
  });

  it('removes the iframe from DOM', async () => {
    const { executeHandshake } = createChild({ container });
    const handshakePromise = executeHandshake();
    completeParentHandshake(container);

    const api = await handshakePromise;
    expect(container.querySelector('iframe')).not.toBeNull();

    api.destroy();
    expect(container.querySelector('iframe')).toBeNull();
  });

  it('stops receiving events after destroy', async () => {
    const handler = vi.fn();
    const inboundEvents = {
      testEvent: createPassthroughSchema(),
    };

    const { executeHandshake, on } = createChild({ container, inboundEvents });
    on('testEvent', handler);

    const handshakePromise = executeHandshake();
    completeParentHandshake(container);
    const api = await handshakePromise;

    api.destroy();

    window.dispatchEvent(
      new MessageEvent('message', {
        data: {
          contentType: eventContentType,
          messageType: messageTypes['child-originated-event'],
          id: 'evt-1',
          event: { name: 'testEvent', data: 'value' },
        },
      }),
    );

    expect(handler).not.toHaveBeenCalled();
  });
});
