// Live updates with Neon Realtime.
//
// The API seals a live query for the flights on screen (/api/live/*). We subscribe to it over
// Neon's WebSocket and call `onChange` whenever those rows change (delay, gate, status, remarks),
// so the page refetches its usual data at that moment. Sealed queries last ~60 s, so they are
// renewed 10 s before expiry. If anything fails, `onState('off')` is reported and we retry later;
// pages keep their 30-second refresh as a fallback, so nothing breaks without Realtime.
import { get } from './core.js';

const RENEW_EARLY_MS = 10000;
const RETRY_MS = 30000;

let client = null;
let clientUrl = null;
async function realtimeClient(url) {
  const { createRealtimeClient } = await import('/vendor/neon-realtime.js');
  if (!client || clientUrl !== url) {
    try { client?.close(); } catch { /* already closed */ }
    client = createRealtimeClient({ url });
    clientUrl = url;
  }
  return client;
}

/**
 * Watches the live query behind `endpoint`. Returns a function that stops watching.
 * onState receives 'connecting' | 'live' | 'off'.
 */
export function watchLive(endpoint, onChange, onState = () => {}) {
  let stopped = false;
  let sub = null;
  let timer = null;
  let offs = [];
  let started = 0;

  const cleanup = () => {
    clearTimeout(timer);
    offs.forEach((off) => off());
    offs = [];
    try { sub?.unsubscribe(); } catch { /* already gone */ }
    sub = null;
  };
  const later = (fn, ms) => {
    clearTimeout(timer);
    if (!stopped) timer = setTimeout(fn, ms);
  };

  async function start() {
    cleanup();
    if (stopped) return;
    onState('connecting');
    let res;
    let c;
    try {
      res = await get(endpoint);
      c = await realtimeClient(res.url);
    } catch {
      onState('off');
      return later(start, RETRY_MS);
    }
    if (stopped) return;
    const restart = started++ > 0; // after a reconnect, refresh once in case we missed a change
    sub = c.subscribe(res.sealed);
    let last = null;
    offs.push(sub.onChange((snap) => {
      if (snap.status !== 'live' || !snap.data) return;
      const now = JSON.stringify(snap.data);
      if (last === null) {
        last = now;
        onState('live');
        if (restart) onChange();
        return;
      }
      if (now !== last) {
        last = now;
        onChange();
      }
    }));
    offs.push(sub.onStateChange((s) => {
      if (s.status === 'error') {
        onState('off');
        later(start, 5000);
      } else if (s.status === 'live') onState('live');
      else if (s.status === 'connecting' || s.status === 'stale') onState('connecting');
    }));
    scheduleRenewal(res.sealed);
  }

  function scheduleRenewal(sealed) {
    later(async () => {
      try {
        const next = await get(endpoint);
        if (stopped) return;
        // The board's time window moves on the hour, which makes it a different query: resubscribe.
        if (next.sealed.queryFingerprint !== sealed.queryFingerprint) return start();
        await sub.renew(next.sealed);
        scheduleRenewal(next.sealed);
      } catch {
        start();
      }
    }, Math.max(0, sealed.expiresAt - Date.now() - RENEW_EARLY_MS));
  }

  start();
  return () => {
    stopped = true;
    cleanup();
  };
}
