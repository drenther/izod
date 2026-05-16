import { useCallback, useEffect, useRef, useState } from 'react';

export type AsyncState<T> =
  | { loading: boolean; error?: undefined; value?: undefined }
  | { loading: true; error?: Error; value?: T }
  | { loading: false; error: Error; value?: undefined }
  | { loading: false; error?: undefined; value: T };

type FunctionReturningPromise = (...args: never[]) => Promise<unknown>;

export function useAsyncCallback<TFn extends FunctionReturningPromise>(
  asyncFn: TFn,
): [
  AsyncState<Awaited<ReturnType<TFn>>>,
  (...args: Parameters<TFn>) => Promise<Awaited<ReturnType<TFn>> | undefined>,
] {
  type TResult = Awaited<ReturnType<TFn>>;

  const lastCallId = useRef(0);
  const mountedRef = useRef(false);
  const loadingRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const [state, setState] = useState<AsyncState<TResult>>({
    loading: false,
  });

  const execute = useCallback(
    (...args: Parameters<TFn>): Promise<TResult | undefined> => {
      const callId = ++lastCallId.current;

      if (!loadingRef.current) {
        loadingRef.current = true;
        setState((previousState) => ({ ...previousState, loading: true }));
      }

      return (asyncFn as (...args: Parameters<TFn>) => Promise<TResult>)(...args).then(
        (value) => {
          loadingRef.current = false;
          if (mountedRef.current && callId === lastCallId.current) {
            setState({ loading: false, value, error: undefined });
          }
          return value;
        },
        (error: unknown) => {
          loadingRef.current = false;
          const normalizedError = error instanceof Error ? error : new Error(String(error));
          if (mountedRef.current && callId === lastCallId.current) {
            setState({ loading: false, value: undefined, error: normalizedError });
          }
          return undefined;
        },
      );
    },
    [asyncFn],
  );

  return [state, execute];
}
