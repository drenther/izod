import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import type { StandardSchemaV1 } from '@standard-schema/spec';
import { eventContentType, messageTypes } from '@izod/core';
import { child, parent } from '../src/index.js';

function createPassthroughSchema<T>(): StandardSchemaV1<T, T> {
  return {
    '~standard': {
      version: 1,
      vendor: 'test',
      validate: (value: unknown) => ({ value: value as T }),
    },
  };
}

function completeParentHandshake(container: HTMLElement) {
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
    }),
  );
}

describe('child.useCreate', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    return () => {
      cleanup();
      container.remove();
    };
  });

  it('returns expected API shape', () => {
    const { result } = renderHook(() => child.useCreate({ container }));

    expect(result.current).toHaveProperty('on');
    expect(result.current).toHaveProperty('executeHandshake');
    expect(result.current).toHaveProperty('api');
    expect(result.current).toHaveProperty('isHandshakeComplete');
    expect(result.current).toHaveProperty('isHandshakePending');
    expect(result.current).toHaveProperty('handshakeError');

    expect(typeof result.current.on).toBe('function');
    expect(typeof result.current.executeHandshake).toBe('function');
    expect(result.current.isHandshakeComplete).toBe(false);
    expect(result.current.isHandshakePending).toBe(false);
  });

  it('can register event listeners', () => {
    const inboundEvents = {
      testEvent: createPassthroughSchema(),
    };

    const { result } = renderHook(() => child.useCreate({ container, inboundEvents }));

    const handler = vi.fn();
    const unsubscribe = result.current.on('testEvent', handler);
    expect(typeof unsubscribe).toBe('function');
    unsubscribe();
  });

  it('calls onHandshakeComplete callback on success', async () => {
    const onHandshakeComplete = vi.fn();

    const { result } = renderHook(() =>
      child.useCreate({
        container,
        onHandshakeComplete,
      }),
    );

    act(() => {
      result.current.executeHandshake();
    });

    await act(async () => {
      completeParentHandshake(container);
    });

    expect(onHandshakeComplete).toHaveBeenCalled();
    expect(result.current.isHandshakeComplete).toBe(true);
    expect(result.current.api).toBeDefined();
  });

  it('sets isHandshakePending while handshake is in progress', async () => {
    const { result } = renderHook(() => child.useCreate({ container }));

    expect(result.current.isHandshakePending).toBe(false);

    act(() => {
      result.current.executeHandshake();
    });

    expect(result.current.isHandshakePending).toBe(true);

    await act(async () => {
      completeParentHandshake(container);
    });

    expect(result.current.isHandshakePending).toBe(false);
    expect(result.current.isHandshakeComplete).toBe(true);
  });

  it('calls onHandshakeError on failure', async () => {
    vi.useFakeTimers();
    const onHandshakeError = vi.fn();

    const { result } = renderHook(() =>
      child.useCreate({
        container,
        onHandshakeError,
        handshakeOptions: {
          maxHandshakeRequests: 1,
          handshakeRetryInterval: 10,
        },
      }),
    );

    act(() => {
      result.current.executeHandshake();
    });

    const iframe = container.querySelector('iframe')!;
    Object.defineProperty(iframe, 'contentWindow', {
      value: { postMessage: vi.fn() },
      configurable: true,
    });

    await act(async () => {
      iframe.dispatchEvent(new Event('load'));
    });

    await vi.waitFor(() => {
      expect(result.current.handshakeError).toBeDefined();
    });

    expect(onHandshakeError).toHaveBeenCalled();
    expect(result.current.handshakeError).toBeInstanceOf(Error);
    expect(result.current.isHandshakeComplete).toBe(false);

    vi.useRealTimers();
  });
});

describe('parent.useConnect', () => {
  beforeEach(() => {
    return () => {
      cleanup();
    };
  });

  it('returns expected API shape', () => {
    const { result } = renderHook(() => parent.useConnect());

    expect(result.current).toHaveProperty('on');
    expect(result.current).toHaveProperty('executeHandshake');
    expect(result.current).toHaveProperty('api');
    expect(result.current).toHaveProperty('isHandshakeComplete');
    expect(result.current).toHaveProperty('isHandshakePending');
    expect(result.current).toHaveProperty('handshakeError');

    expect(typeof result.current.on).toBe('function');
    expect(typeof result.current.executeHandshake).toBe('function');
    expect(result.current.isHandshakeComplete).toBe(false);
    expect(result.current.isHandshakePending).toBe(false);
  });

  it('can register event listeners', () => {
    const inboundEvents = {
      testEvent: createPassthroughSchema(),
    };

    const { result } = renderHook(() => parent.useConnect({ inboundEvents }));

    const handler = vi.fn();
    const unsubscribe = result.current.on('testEvent', handler);
    expect(typeof unsubscribe).toBe('function');
    unsubscribe();
  });

  it('completes handshake and sets api', async () => {
    const parentPostMessage = vi.spyOn(window.parent, 'postMessage').mockImplementation(() => {});

    const onHandshakeComplete = vi.fn();

    const { result } = renderHook(() =>
      parent.useConnect({
        onHandshakeComplete,
      }),
    );

    act(() => {
      result.current.executeHandshake();
    });

    expect(result.current.isHandshakePending).toBe(true);

    await act(async () => {
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
    });

    expect(onHandshakeComplete).toHaveBeenCalled();
    expect(result.current.isHandshakeComplete).toBe(true);
    expect(result.current.api).toBeDefined();
    expect(result.current.api).toHaveProperty('emit');

    parentPostMessage.mockRestore();
  });

  it('calls onHandshakeError on invalid request', async () => {
    const onHandshakeError = vi.fn();

    const { result } = renderHook(() =>
      parent.useConnect({
        onHandshakeError,
      }),
    );

    act(() => {
      result.current.executeHandshake();
    });

    await act(async () => {
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
    });

    expect(onHandshakeError).toHaveBeenCalled();
    expect(result.current.handshakeError).toBeInstanceOf(Error);
    expect(result.current.isHandshakeComplete).toBe(false);
  });
});
