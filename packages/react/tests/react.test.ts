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

    const iframe = container.querySelector('iframe')!;
    Object.defineProperty(iframe, 'contentWindow', {
      value: { postMessage: vi.fn() },
    });

    await act(async () => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            contentType: eventContentType,
            messageType: messageTypes['handshake-reply'],
            id: 'test-id',
          },
        }),
      );
    });

    expect(onHandshakeComplete).toHaveBeenCalled();
  });
});

describe('parent.useConnect', () => {
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
});
