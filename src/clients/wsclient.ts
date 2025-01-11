const WEBSOCKETS_SERVER = "wss://wsapi.newgra.ph/v1";

import WebSocket from 'ws';

export type WSState = {
  socket: WebSocket | null;
  toggle: (token: string) => void;
  url: string;
  send: (msg: any) => void;
};

export const newgraphWebsocketsClientManager = () => {
  const state = {
    socket: null,
  } as WSState;

  const outboundQueue: any[] = [];

  let pingInterval: ReturnType<typeof setInterval>;
  let pingCounter = 0;
  let _token = "";

  const processPong = (ev: any) => {
    if (ev.data === "pong") {
      pingCounter = Math.max(pingCounter - 1, 0); // without the .max if disconnect occurs between ping and pong, after reconnection will go to negative values and delay disconnect detection
      console.log("pong, pingCounter == ", pingCounter, new Date().toISOString());
    }
  };

  const handleNoPing = () => {
    console.log("Websockets ping failed, trying to reconnect")

    if (_token)
      toggle(_token);
    else
      console.log("No token, not attempting to resume after failed ping")
  }

  const startPing = () =>
  (pingInterval = setInterval(() => {
    if (pingCounter > 0) {
      pingCounter--;
      return handleNoPing();
    }

    try {
      state?.socket?.send("ping");
    } catch (ex) {
      console.log("Couldn't ping:", ex);
      return handleNoPing();
    }
    pingCounter++;
    console.log("ping, pingCounter == ", pingCounter);
  }, 10000));

  const stopPing = () => {
    clearInterval(pingInterval);
  };

  const logConnected = () => console.log("Websockets client connected")
  const logDisconnected = () => console.log("Websockets client disconnected")
    const logError = (err: any) => {
      const details = {
        message: err.message,
        type: err.type,
        code: (err as any)?.code,
        url: state.socket?.url,
        status: (err as any)?.status,
        headers: (err as any)?.headers,
        raw: err
      };
      console.error("WebSocket Error:", details);
    };

  const sendQueued = () => {
    let msg;
    for (msg of outboundQueue)
      state.send(msg);
  };

  const eventHandlers: Record<keyof WebSocketEventMap, ((e:any) => void)[]> = {
    open: [startPing, sendQueued, logConnected],
    close: [stopPing],
    error: [logError],
    message: [processPong]

  }

  const toggle = async (token: string) => {
    _token = token;


    const url = `${WEBSOCKETS_SERVER}?token=${encodeURIComponent(token)}`;
    if (state.url === url) {
      return;
    }
    state.url = url;

    if (state.socket) {
      // clean up subscriptions
      (Object.keys(eventHandlers) as (keyof WebSocketEventMap)[])
        .forEach((eventName) =>
          eventHandlers[eventName].forEach(handler =>
            state.socket?.removeEventListener(eventName, handler)));

      state.socket.close();
      state.socket = null;
    }
    stopPing();

    if (token && url) {
      // If an upd function is provided, use that, otherwise use default URL with token param
      // Use exact URL format from successful Chrome connection
      const tokenParam = encodeURIComponent(`newsafe ${token}`);
      const url = `${WEBSOCKETS_SERVER}?token=${tokenParam}`;
      console.log("Attempting to connect to WebSocket...");
      state.socket = new WebSocket(url, {
        headers: {
          'Origin': 'https://os.newcoin.org',
          'Sec-WebSocket-Extensions': 'permessage-deflate, client_max_window_bits'
        }
      });

      // subscribe to events
      (Object.keys(eventHandlers)  as (keyof WebSocketEventMap)[])
        .forEach(eventName =>
          eventHandlers[eventName].forEach(handler =>
            state.socket?.addEventListener(eventName, handler)));
    }
  };
  state.toggle = toggle;


  state.send = (msg: any) => {
    if (state.socket?.readyState == state.socket?.CONNECTING) {
      outboundQueue.push(msg);
      return
    }

    if (typeof msg != "string")
      msg = JSON.stringify(msg);

    state.socket?.send(msg)
  }
  return state;
};

export type NewgraphWebsocketsClient = ReturnType<typeof newgraphWebsocketsClientManager>;