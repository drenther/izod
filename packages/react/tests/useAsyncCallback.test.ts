import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAsyncCallback } from '../src/useAsyncCallback.js';

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('useAsyncCallback', () => {
  it('returns initial idle state', () => {
    const asyncFn = vi.fn(async () => 'value');
    const { result } = renderHook(() => useAsyncCallback(asyncFn));

    const [state] = result.current;
    expect(state).toEqual({ loading: false, value: undefined, error: undefined });
  });

  it('sets loading on execute', () => {
    const deferred = createDeferred<string>();
    const asyncFn = vi.fn(() => deferred.promise);
    const { result } = renderHook(() => useAsyncCallback(asyncFn));

    act(() => {
      result.current[1]();
    });

    expect(result.current[0].loading).toBe(true);
  });

  it('resolves with value', async () => {
    const asyncFn = vi.fn(async () => 'hello');
    const { result } = renderHook(() => useAsyncCallback(asyncFn));

    await act(async () => {
      await result.current[1]();
    });

    expect(result.current[0]).toEqual({ loading: false, value: 'hello', error: undefined });
  });

  it('rejects and sets error', async () => {
    const error = new Error('boom');
    const asyncFn = vi.fn(async () => {
      throw error;
    });
    const { result } = renderHook(() => useAsyncCallback(asyncFn));

    await act(async () => {
      await result.current[1]();
    });

    expect(result.current[0].loading).toBe(false);
    expect(result.current[0].error).toBe(error);
    expect(result.current[0].value).toBeUndefined();
  });

  it('normalizes non-Error rejections to Error instances', async () => {
    const asyncFn = vi.fn(async () => {
      throw 'string-error';
    });
    const { result } = renderHook(() => useAsyncCallback(asyncFn));

    await act(async () => {
      await result.current[1]();
    });

    expect(result.current[0].error).toBeInstanceOf(Error);
    expect(result.current[0].error?.message).toBe('string-error');
  });

  it('preserves previous value during reload', async () => {
    const firstDeferred = createDeferred<string>();
    const secondDeferred = createDeferred<string>();
    let callCount = 0;
    const asyncFn = vi.fn(() => {
      callCount++;
      return callCount === 1 ? firstDeferred.promise : secondDeferred.promise;
    });

    const { result } = renderHook(() => useAsyncCallback(asyncFn));

    await act(async () => {
      firstDeferred.resolve('first');
      await result.current[1]();
    });

    expect(result.current[0].value).toBe('first');

    act(() => {
      result.current[1]();
    });

    expect(result.current[0]).toEqual({ loading: true, value: 'first', error: undefined });
  });

  it('preserves previous error during reload', async () => {
    const firstDeferred = createDeferred<string>();
    const secondDeferred = createDeferred<string>();
    let callCount = 0;
    const asyncFn = vi.fn(() => {
      callCount++;
      return callCount === 1 ? firstDeferred.promise : secondDeferred.promise;
    });

    const { result } = renderHook(() => useAsyncCallback(asyncFn));

    await act(async () => {
      firstDeferred.reject(new Error('failed'));
      await result.current[1]();
    });

    expect(result.current[0].error?.message).toBe('failed');

    act(() => {
      result.current[1]();
    });

    expect(result.current[0].loading).toBe(true);
    expect(result.current[0].error?.message).toBe('failed');
    expect(result.current[0].value).toBeUndefined();
  });

  it('ignores stale resolve when a newer call is pending', async () => {
    const deferredA = createDeferred<string>();
    const deferredB = createDeferred<string>();
    let callCount = 0;
    const asyncFn = vi.fn(() => {
      callCount++;
      return callCount === 1 ? deferredA.promise : deferredB.promise;
    });

    const { result } = renderHook(() => useAsyncCallback(asyncFn));

    act(() => {
      result.current[1]();
    });

    act(() => {
      result.current[1]();
    });

    await act(async () => {
      deferredB.resolve('B');
    });

    expect(result.current[0].value).toBe('B');

    await act(async () => {
      deferredA.resolve('A');
    });

    expect(result.current[0].value).toBe('B');
  });

  it('ignores stale reject when a newer call is pending', async () => {
    const deferredA = createDeferred<string>();
    const deferredB = createDeferred<string>();
    let callCount = 0;
    const asyncFn = vi.fn(() => {
      callCount++;
      return callCount === 1 ? deferredA.promise : deferredB.promise;
    });

    const { result } = renderHook(() => useAsyncCallback(asyncFn));

    act(() => {
      result.current[1]();
    });

    act(() => {
      result.current[1]();
    });

    await act(async () => {
      deferredB.resolve('B');
    });

    await act(async () => {
      deferredA.reject(new Error('stale error'));
    });

    expect(result.current[0].value).toBe('B');
    expect(result.current[0].error).toBeUndefined();
  });

  it('does not update state after unmount', async () => {
    const deferred = createDeferred<string>();
    const asyncFn = vi.fn(() => deferred.promise);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { result, unmount } = renderHook(() => useAsyncCallback(asyncFn));

    act(() => {
      result.current[1]();
    });

    unmount();

    await act(async () => {
      deferred.resolve('too late');
    });

    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('forwards arguments to async function', async () => {
    const asyncFn = vi.fn(async (name: string, count: number) => `${name}-${count}`);
    const { result } = renderHook(() => useAsyncCallback(asyncFn));

    await act(async () => {
      await result.current[1]('hello', 3);
    });

    expect(asyncFn).toHaveBeenCalledWith('hello', 3);
    expect(result.current[0].value).toBe('hello-3');
  });

  it('returns promise from execute that resolves to the value', async () => {
    const asyncFn = vi.fn(async () => 42);
    const { result } = renderHook(() => useAsyncCallback(asyncFn));

    let returnedValue: number | undefined;
    await act(async () => {
      returnedValue = await result.current[1]();
    });

    expect(returnedValue).toBe(42);
  });

  it('returned promise resolves to undefined on error instead of rejecting', async () => {
    const asyncFn = vi.fn(async () => {
      throw new Error('fail');
    });
    const { result } = renderHook(() => useAsyncCallback(asyncFn));

    let returnedValue: unknown = 'sentinel';
    await act(async () => {
      returnedValue = await result.current[1]();
    });

    expect(returnedValue).toBeUndefined();
  });

  it('creates new callback when asyncFn reference changes', () => {
    const asyncFnA = vi.fn(async () => 'a');
    const asyncFnB = vi.fn(async () => 'b');

    const { result, rerender } = renderHook(({ fn }) => useAsyncCallback(fn), {
      initialProps: { fn: asyncFnA },
    });

    const firstCallback = result.current[1];

    rerender({ fn: asyncFnB });

    expect(result.current[1]).not.toBe(firstCallback);
  });
});
