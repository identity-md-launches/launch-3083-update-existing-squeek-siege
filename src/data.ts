// Squeekchain data: real settled rounds (waves) and live wheel status (overdrive).
import { SNAPSHOT } from './snapshot';

const API = 'https://api.squeekchain.com/v1';

export interface Round {
  round: number; // SqueekCore settledThroughRound (10-minute round id)
  work: number; // accepted wheel passages in that round
  tx: string; // Sepolia settlement transaction
  at: string; // ISO time the settlement landed
  block: number; // Squeek block height after it
}

export interface LiveStatus {
  ok: boolean;
  active: boolean; // WHEELY9000 says ACTIVE and the wheel is turning
  rpm: number;
  work: number; // cumulative accepted passages
  blockHeight: number;
}

const CACHE_KEY = 'squeek-siege:rounds:v1';

/** Every settlement that recorded wheel work, oldest first. Falls back to a bundled snapshot. */
export async function loadRounds(): Promise<{ rounds: Round[]; source: 'live' | 'cache' | 'snapshot' }> {
  try {
    const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
    if (cached && Date.now() - cached.t < 10 * 60_000 && cached.rounds?.length) {
      return { rounds: cached.rounds, source: 'cache' };
    }
  } catch { /* ignore */ }
  try {
    const out: Round[] = [];
    let cursor: string | null = null;
    for (let page = 0; page < 20; page++) {
      const url: string = `${API}/events?category=protocol&limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`events ${res.status}`);
      const d = await res.json();
      if (d.status !== 'available') throw new Error(d.reason || 'unavailable');
      for (const e of d.events) {
        if (e.type !== 'system.settlement_completed') continue;
        const work = Number(e.payload.workAdded || 0);
        if (work <= 0) continue;
        out.push({
          round: Number(e.payload.settledThroughRound),
          work,
          tx: e.source.transactionHash,
          at: e.occurredAt,
          block: Number(e.payload.blockHeight || 0),
        });
      }
      cursor = d.nextCursor;
      if (!cursor) break;
    }
    if (out.length < 5) throw new Error('too few rounds');
    out.sort((a, b) => a.round - b.round);
    try { localStorage.setItem(CACHE_KEY, JSON.stringify({ t: Date.now(), rounds: out })); } catch { /* storage disabled or full: keep the live rounds */ }
    return { rounds: out, source: 'live' };
  } catch (err) {
    console.warn('[squeek-siege] live rounds unavailable, using snapshot', err);
    return { rounds: SNAPSHOT, source: 'snapshot' };
  }
}

export async function loadStatus(): Promise<LiveStatus> {
  try {
    const res = await fetch(`${API}/status`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`status ${res.status}`);
    const d = await res.json();
    if (!d.measurement) throw new Error('no measurement');
    const m = d.measurement;
    const fresh = m.freshness === 'online' || m.freshness === 'fresh';
    const rpm = Number(m.rpmMilli || 0) / 1000;
    return {
      ok: true,
      active: fresh && m.coreStatus === 'ACTIVE' && rpm > 0,
      rpm,
      work: Number(m.cumulativeWorkUnits || 0),
      blockHeight: Number(d.builder?.anchor?.blockHeight || 0),
    };
  } catch {
    return { ok: false, active: false, rpm: 0, work: 0, blockHeight: 0 };
  }
}

export const txUrl = (tx: string) => `https://sepolia.etherscan.io/tx/${tx}`;
