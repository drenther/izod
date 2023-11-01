import {
  createChild,
  EventMap,
  type CreateChildParams,
  type ConnectToParentParams,
  connectToParent,
} from '@izod/core';
import { useEffect, useRef } from 'react';
import useAsyncFn from 'react-use/lib/useAsyncFn';

// a typescript trick to get the strictly inferred return type of a function with generics
class CreateChildHandshakeWrapper<
  IE extends EventMap,
  OE extends EventMap,
  T extends HTMLElement | Element,
> {
  wrapped = (params: CreateChildParams<IE, OE, T>) =>
    createChild(params)['executeHandshake']();
}
interface UseChildIframeParams<
  IE extends EventMap,
  OE extends EventMap,
  T extends HTMLElement | Element,
> extends CreateChildParams<IE, OE, T> {
  onHandshakeComplete?: (
    api: NonNullable<
      Awaited<ReturnType<CreateChildHandshakeWrapper<IE, OE, T>['wrapped']>>
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
  const child = useRef(createChild(props));
  const [handshakeState, executeHandshake] = useAsyncFn(
    child.current.executeHandshake,
    [],
  );

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
    on: child.current.on,
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

class ConnectToParentHandshakeWrapper<
  IE extends EventMap,
  OE extends EventMap,
> {
  wrapped = (params: ConnectToParentParams<IE, OE>) =>
    connectToParent(params).executeHandshake();
}
interface UseParentParams<IE extends EventMap, OE extends EventMap>
  extends ConnectToParentParams<IE, OE> {
  onHandshakeComplete?: (
    api: NonNullable<
      Awaited<ReturnType<ConnectToParentHandshakeWrapper<IE, OE>['wrapped']>>
    >,
  ) => void;
  onHandshakeError?: (error: Error) => void;
}
function useConnectToParent<IE extends EventMap, OE extends EventMap>(
  {
    onHandshakeComplete,
    onHandshakeError,
    ...props
  }: UseParentParams<IE, OE> = {} as UseParentParams<IE, OE>,
) {
  const parent = useRef(connectToParent(props));
  const [handshakeState, executeHandshake] = useAsyncFn(
    parent.current.executeHandshake,
    [],
  );

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
    executeHandshake,
    on: parent.current.on,
    api: handshakeState.value,
    isHandshakeComplete: handshakeState.value !== undefined,
    isHandshakePending: handshakeState.loading,
    handshakeError: handshakeState.error,
  } as const;
}

export const parent = {
  useConnect: useConnectToParent,
} as const;
