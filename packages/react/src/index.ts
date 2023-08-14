import {
  createChild,
  EventMap,
  type CreateChildParams,
  type ConnectToParentParams,
  connectToParent,
} from '@izod/core';
import { useEffect, useRef } from 'react';
import useAsync from 'react-use/lib/useAsync';
import type { z } from 'zod';

// a typescript trick to get the strictly inferred return type of a function with generics
class CreateChildParamsWrapper<
  IE extends EventMap,
  OE extends EventMap,
  T extends HTMLElement | Element,
> {
  wrapped = (params: CreateChildParams<IE, OE, T>) => createChild(params);
}
interface UseChildIframeParams<
  IE extends EventMap,
  OE extends EventMap,
  T extends HTMLElement | Element,
> extends CreateChildParams<IE, OE, T> {
  onHandshakeComplete?: (
    api: NonNullable<
      Awaited<ReturnType<CreateChildParamsWrapper<IE, OE, T>['wrapped']>>
    >,
  ) => void;
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
  const handshakeState = useAsync(() => createChild(props), [props]);

  const onHandshakeCompleteCallbackRef =
    useRef<typeof onHandshakeComplete>(onHandshakeComplete);
  const onHandshakeErrorCallbackRef =
    useRef<typeof onHandshakeError>(onHandshakeError);
  const destroyOnUnmountRef = useRef<boolean>(destroyOnUnmount ?? true);

  const apiRef = useRef<typeof handshakeState.value>();

  useEffect(() => {
    const api = apiRef.current;
    const destroyOnUnmount = destroyOnUnmountRef.current;
    return () => {
      if (destroyOnUnmount && api) {
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

      const onHandshakeComplete = onHandshakeCompleteCallbackRef.current;
      if (onHandshakeComplete) {
        onHandshakeComplete(handshakeState.value);
      }
    } else if (handshakeState.error) {
      onHandshakeSettledEffectRan.current = true;

      if (onHandshakeErrorCallbackRef.current) {
        onHandshakeErrorCallbackRef.current(handshakeState.error);
      }
    }
  }, [handshakeState]);

  return {
    api: handshakeState.value,
    isHandshakeComplete: handshakeState.value !== undefined,
    isHandshakePending: handshakeState.loading,
    handshakeError: handshakeState.error,
  } as const;
}

function useChildEventListener<
  IE extends EventMap,
  OE extends EventMap,
  T extends HTMLElement | Element = HTMLElement,
  E extends keyof IE = keyof IE,
>(
  api:
    | Awaited<ReturnType<CreateChildParamsWrapper<IE, OE, T>['wrapped']>>
    | undefined,
  eventName: E,
  listener: (data: z.infer<IE[E]>) => void | Promise<void>,
) {
  useEffect(() => {
    const unsubscribe = api?.on(eventName, listener);
    return unsubscribe;
  }, [api, eventName, listener]);
}

export const child = {
  useCreate: useCreateChildIframe,
  useEventListener: useChildEventListener,
} as const;

class ConnectToParentParamstWrapper<IE extends EventMap, OE extends EventMap> {
  wrapped = (params: ConnectToParentParams<IE, OE>) => connectToParent(params);
}
interface UseParentParams<IE extends EventMap, OE extends EventMap>
  extends ConnectToParentParams<IE, OE> {
  onHandshakeComplete?: (
    api: NonNullable<
      Awaited<ReturnType<ConnectToParentParamstWrapper<IE, OE>['wrapped']>>
    >,
  ) => void;
  onHandshakeError?: (error: Error) => void;
}
function useConnectToParent<IE extends EventMap, OE extends EventMap>({
  onHandshakeComplete,
  onHandshakeError,
  ...props
}: UseParentParams<IE, OE>) {
  const handshakeState = useAsync(() => connectToParent(props), []);

  const onHandshakeCompleteCallbackRef =
    useRef<typeof onHandshakeComplete>(onHandshakeComplete);
  const onHandshakeErrorCallbackRef =
    useRef<typeof onHandshakeError>(onHandshakeError);

  const apiRef = useRef<typeof handshakeState.value>();

  const onHandshakeSettledEffectRan = useRef<boolean>(false);
  useEffect(() => {
    if (onHandshakeSettledEffectRan.current) {
      return;
    }

    if (handshakeState.value) {
      onHandshakeSettledEffectRan.current = true;
      apiRef.current = handshakeState.value;

      const onHandshakeComplete = onHandshakeCompleteCallbackRef.current;
      if (onHandshakeComplete) {
        onHandshakeComplete(handshakeState.value);
      }
    } else if (handshakeState.error) {
      onHandshakeSettledEffectRan.current = true;

      if (onHandshakeErrorCallbackRef.current) {
        onHandshakeErrorCallbackRef.current(handshakeState.error);
      }
    }
  }, [handshakeState]);

  return {
    api: handshakeState.value,
    isHandshakeComplete: handshakeState.value !== undefined,
    isHandshakePending: handshakeState.loading,
    handshakeError: handshakeState.error,
  } as const;
}

function useParentEventListener<
  IE extends EventMap,
  OE extends EventMap,
  E extends keyof IE = keyof IE,
>(
  api:
    | Awaited<ReturnType<ConnectToParentParamstWrapper<IE, OE>['wrapped']>>
    | undefined,
  // might have to change this when the core lib is updated
  eventName: E,
  handler: (data: z.infer<IE[E]>) => void | Promise<void>,
) {
  useEffect(() => {
    const unsubscribe = api?.on(eventName, handler);
    return unsubscribe;
  }, [api, eventName, handler]);
}

export const parent = {
  useConnect: useConnectToParent,
  useEventListener: useParentEventListener,
} as const;
