import {
  createChild,
  type EventMap,
  type CreateChildParams,
  type ConnectToParentParams,
  connectToParent,
} from '@izod/core';
import { useEffect, useRef, useState, useCallback } from 'react';

type AsyncState<T> =
  | { loading: false; value: undefined; error: undefined }
  | { loading: true; value: undefined; error: undefined }
  | { loading: false; value: T; error: undefined }
  | { loading: false; value: undefined; error: Error };

function useAsyncCallback<T>(asyncFn: () => Promise<T>) {
  const [state, setState] = useState<AsyncState<T>>({
    loading: false,
    value: undefined,
    error: undefined,
  });

  const execute = useCallback(() => {
    setState({ loading: true, value: undefined, error: undefined });
    asyncFn().then(
      (value) => setState({ loading: false, value, error: undefined }),
      (error: unknown) =>
        setState({
          loading: false,
          value: undefined,
          error: error instanceof Error ? error : new Error(String(error)),
        }),
    );
  }, [asyncFn]);

  return [state, execute] as const;
}

type CreateChildHandshakeResult<
  IE extends EventMap,
  OE extends EventMap,
  T extends HTMLElement | Element,
> = Awaited<ReturnType<ReturnType<typeof createChild<IE, OE, T>>['executeHandshake']>>;

interface UseChildIframeParams<
  IE extends EventMap,
  OE extends EventMap,
  T extends HTMLElement | Element,
> extends CreateChildParams<IE, OE, T> {
  onHandshakeComplete?: (api: CreateChildHandshakeResult<IE, OE, T>) => void;
  onHandshakeError?: (error: Error) => void;
  destroyOnUnmount?: boolean;
}

function useCreateChildIframe<
  IE extends EventMap,
  OE extends EventMap,
  T extends HTMLElement | Element = HTMLElement,
>({
  onHandshakeComplete,
  onHandshakeError,
  destroyOnUnmount,
  ...props
}: UseChildIframeParams<IE, OE, T>) {
  const childRef = useRef(createChild(props));
  const executeHandshakeFn = useCallback(() => childRef.current.executeHandshake(), []);
  const [handshakeState, executeHandshake] = useAsyncCallback(executeHandshakeFn);

  const onHandshakeCompleteCallbackRef = useRef<typeof onHandshakeComplete>(onHandshakeComplete);
  const onHandshakeErrorCallbackRef = useRef<typeof onHandshakeError>(onHandshakeError);
  const destroyOnUnmountRef = useRef<boolean>(destroyOnUnmount ?? true);

  const apiRef = useRef<typeof handshakeState.value>(undefined);

  useEffect(() => {
    const api = apiRef.current;
    const shouldDestroy = destroyOnUnmountRef.current;
    return () => {
      if (shouldDestroy && api) {
        api.destroy();
      }
    };
  }, []);

  const onHandshakeSettledEffectRan = useRef<boolean>(false);
  useEffect(() => {
    if (onHandshakeSettledEffectRan.current) {
      return;
    }

    if (handshakeState.value) {
      onHandshakeSettledEffectRan.current = true;
      apiRef.current = handshakeState.value;

      const callback = onHandshakeCompleteCallbackRef.current;
      if (callback) {
        callback(handshakeState.value);
      }
    } else if (handshakeState.error) {
      onHandshakeSettledEffectRan.current = true;

      if (onHandshakeErrorCallbackRef.current) {
        onHandshakeErrorCallbackRef.current(handshakeState.error);
      }
    }
  }, [handshakeState]);

  return {
    on: childRef.current.on,
    executeHandshake,
    api: handshakeState.value,
    isHandshakeComplete: handshakeState.value !== undefined,
    isHandshakePending: handshakeState.loading,
    handshakeError: handshakeState.error,
  } as const;
}

export const child = {
  useCreate: useCreateChildIframe,
} as const;

type ConnectToParentHandshakeResult<IE extends EventMap, OE extends EventMap> = Awaited<
  ReturnType<ReturnType<typeof connectToParent<IE, OE>>['executeHandshake']>
>;

interface UseParentParams<IE extends EventMap, OE extends EventMap> extends ConnectToParentParams<
  IE,
  OE
> {
  onHandshakeComplete?: (api: ConnectToParentHandshakeResult<IE, OE>) => void;
  onHandshakeError?: (error: Error) => void;
}

function useConnectToParent<IE extends EventMap, OE extends EventMap>(
  {
    onHandshakeComplete,
    onHandshakeError,
    ...props
  }: UseParentParams<IE, OE> = {} as UseParentParams<IE, OE>,
) {
  const parentRef = useRef(connectToParent(props));
  const executeHandshakeFn = useCallback(() => parentRef.current.executeHandshake(), []);
  const [handshakeState, executeHandshake] = useAsyncCallback(executeHandshakeFn);

  const onHandshakeCompleteCallbackRef = useRef<typeof onHandshakeComplete>(onHandshakeComplete);
  const onHandshakeErrorCallbackRef = useRef<typeof onHandshakeError>(onHandshakeError);

  const apiRef = useRef<typeof handshakeState.value>(undefined);

  const onHandshakeSettledEffectRan = useRef<boolean>(false);
  useEffect(() => {
    if (onHandshakeSettledEffectRan.current) {
      return;
    }

    if (handshakeState.value) {
      onHandshakeSettledEffectRan.current = true;
      apiRef.current = handshakeState.value;

      const callback = onHandshakeCompleteCallbackRef.current;
      if (callback) {
        callback(handshakeState.value);
      }
    } else if (handshakeState.error) {
      onHandshakeSettledEffectRan.current = true;

      if (onHandshakeErrorCallbackRef.current) {
        onHandshakeErrorCallbackRef.current(handshakeState.error);
      }
    }
  }, [handshakeState]);

  return {
    executeHandshake,
    on: parentRef.current.on,
    api: handshakeState.value,
    isHandshakeComplete: handshakeState.value !== undefined,
    isHandshakePending: handshakeState.loading,
    handshakeError: handshakeState.error,
  } as const;
}

export const parent = {
  useConnect: useConnectToParent,
} as const;
