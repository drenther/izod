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

    const iframe = container.querySelector('iframe')!;
    const postMessageSpy = vi.fn();
    Object.defineProperty(iframe, 'contentWindow', {
      value: { postMessage: postMessageSpy },
    });

    window.dispatchEvent(
      new MessageEvent('message', {
        data: {
          contentType: eventContentType,
          messageType: messageTypes['handshake-reply'],
          id: 'test-id',
        },
      }),
    );

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

    const iframe = container.querySelector('iframe')!;
    const postMessageSpy = vi.fn();
    Object.defineProperty(iframe, 'contentWindow', {
      value: { postMessage: postMessageSpy },
    });

    window.dispatchEvent(
      new MessageEvent('message', {
        data: {
          contentType: eventContentType,
          messageType: messageTypes['handshake-reply'],
          id: 'test-id',
        },
      }),
    );

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

    const iframe = container.querySelector('iframe')!;
    const postMessageSpy = vi.fn();
    Object.defineProperty(iframe, 'contentWindow', {
      value: { postMessage: postMessageSpy },
    });

    window.dispatchEvent(
      new MessageEvent('message', {
        data: {
          contentType: eventContentType,
          messageType: messageTypes['handshake-reply'],
          id: 'test-id',
        },
      }),
    );

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

    const iframe = container.querySelector('iframe')!;
    const postMessageSpy = vi.fn();
    Object.defineProperty(iframe, 'contentWindow', {
      value: { postMessage: postMessageSpy },
    });

    window.dispatchEvent(
      new MessageEvent('message', {
        data: {
          contentType: eventContentType,
          messageType: messageTypes['handshake-reply'],
          id: 'test-id',
        },
      }),
    );

    return handshakePromise.then((api) => {
      api.emit('testEvent', 'hello');
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
