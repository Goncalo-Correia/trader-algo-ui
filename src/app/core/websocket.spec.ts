import { fakeAsync, tick } from '@angular/core/testing';
import { connectWebSocket } from './websocket';

interface CloseInit {
  wasClean?: boolean;
  code?: number;
}

/** Minimal WebSocket stand-in that lets a test drive message/close events. */
class MockWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  static instances: MockWebSocket[] = [];

  readyState = MockWebSocket.OPEN;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onclose: ((event: CloseInit) => void) | null = null;
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  readonly url: string;
  readonly close = jasmine.createSpy('close').and.callFake(() => {
    this.readyState = MockWebSocket.CLOSED;
  });

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  emitMessage(data: unknown): void {
    this.onmessage?.({ data });
  }

  emitClose(init: CloseInit = {}): void {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.({ wasClean: init.wasClean ?? false, code: init.code ?? 1006 });
  }
}

describe('connectWebSocket', () => {
  let originalWebSocket: typeof WebSocket;

  beforeEach(() => {
    originalWebSocket = (globalThis as unknown as { WebSocket: typeof WebSocket }).WebSocket;
    MockWebSocket.instances = [];
    (globalThis as unknown as { WebSocket: unknown }).WebSocket = MockWebSocket;
  });

  afterEach(() => {
    (globalThis as unknown as { WebSocket: typeof WebSocket }).WebSocket = originalWebSocket;
  });

  const latest = () => MockWebSocket.instances[MockWebSocket.instances.length - 1];

  it('parses JSON frames through the provided parser', () => {
    const received: number[] = [];
    const sub = connectWebSocket<number>('ws://x', {
      parse: raw => [(raw as { n: number }).n],
      reconnect: false,
    }).subscribe(v => received.push(v));

    latest().emitMessage(JSON.stringify({ n: 42 }));
    expect(received).toEqual([42]);
    sub.unsubscribe();
  });

  it('emits one value per element the parser returns (and drops frames it maps to [])', () => {
    const received: number[] = [];
    const sub = connectWebSocket<number>('ws://x', {
      parse: raw => (raw as { batch: number[] }).batch,
      reconnect: false,
    }).subscribe(v => received.push(v));

    latest().emitMessage(JSON.stringify({ batch: [1, 2, 3] }));
    latest().emitMessage(JSON.stringify({ batch: [] }));
    expect(received).toEqual([1, 2, 3]);
    sub.unsubscribe();
  });

  it('ignores malformed (non-JSON) frames without erroring', () => {
    const received: unknown[] = [];
    const errorSpy = jasmine.createSpy('error');
    const sub = connectWebSocket('ws://x', {
      parse: raw => [raw],
      reconnect: false,
    }).subscribe({ next: v => received.push(v), error: errorSpy });

    latest().emitMessage('this is not json');
    expect(received).toEqual([]);
    expect(errorSpy).not.toHaveBeenCalled();
    sub.unsubscribe();
  });

  it('completes on a clean close', () => {
    const completeSpy = jasmine.createSpy('complete');
    connectWebSocket('ws://x', { parse: raw => [raw], reconnect: false }).subscribe({ complete: completeSpy });

    latest().emitClose({ wasClean: true, code: 1000 });
    expect(completeSpy).toHaveBeenCalledTimes(1);
  });

  it('errors on an abnormal close when reconnect is disabled', () => {
    const errorSpy = jasmine.createSpy('error');
    connectWebSocket('ws://x', { parse: raw => [raw], reconnect: false }).subscribe({ error: errorSpy });

    latest().emitClose({ wasClean: false, code: 1006 });
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });

  it('closes the socket on unsubscribe', () => {
    const sub = connectWebSocket('ws://x', { parse: raw => [raw], reconnect: false }).subscribe();
    const socket = latest();
    sub.unsubscribe();
    expect(socket.close).toHaveBeenCalledTimes(1);
  });

  it('reconnects with backoff after an abnormal drop', fakeAsync(() => {
    const sub = connectWebSocket('ws://x', {
      parse: raw => [raw],
      reconnect: true,
      baseDelayMs: 1000,
    }).subscribe();

    expect(MockWebSocket.instances.length).toBe(1);
    latest().emitClose({ wasClean: false, code: 1006 });

    // Nothing reconnects before the backoff elapses...
    tick(999);
    expect(MockWebSocket.instances.length).toBe(1);
    // ...then a fresh socket is opened.
    tick(1);
    expect(MockWebSocket.instances.length).toBe(2);

    sub.unsubscribe();
  }));
});
