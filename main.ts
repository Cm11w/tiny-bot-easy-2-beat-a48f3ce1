// Tiny dip bot — "Tiny Bot, Easy $2: Beat Buy-and-Hold on Solana".
//
// Strategy (one paragraph): on every hourly bar, for each of the 7 symbols,
// buy a dip — the close at least 1.5% below its 12-bar exponential moving
// average — with a fixed slice of equity, and sell the whole position when
// it is worth 1.5% over its cost, when it falls 5% under its cost, or when
// it has been held 48 bars. Nothing else. The idea is the one the dev
// window rewards: hourly Solana prices chop around their short average even
// while drifting down, so buying the dip and taking a quick 1.5% beats
// holding through the drift, and sitting in cash while there is no dip
// beats it further. No trend chasing: momentum entries on these bars buy
// dead-cat bounces and lose (tested). No clock, no randomness, no network:
// the same bars always give the same orders, run after run.
//
// Layout: the grader runs `node /bot/main.ts` with this directory mounted
// at /bot; vendor/makefun-bars.ts is a byte-identical copy of the kit's
// sdk/makefun-bars.ts.

import { BPS, runBars, type BarsState, type BuyInput, type OrderInput } from './vendor/makefun-bars.ts';

/** A dip is a close this far under the 12-bar EMA (percent, x100). */
const DIP_BPS = 150;
/** Take profit: the position worth this far over its cost (percent, x100). */
const TAKE_PROFIT_BPS = 150;
/** Stop loss: the position worth this far under its cost (percent, x100). */
const STOP_LOSS_BPS = 500;
/** The most bars a position is held before it is sold anyway. */
const MAX_HOLD_BARS = 48;
/** Bars of history before the first trade (the EMA is seeded on bar 0). */
const WARMUP_BARS = 26;
/** Each buy spends this share of equity (capped by max_weight_bps too). */
const SLOT_BPS = 2000;
/** Slippage cap per order: wide enough that a normal open fills, tight
 * enough that a gap open is refused and retried on the next bar instead. */
const MAX_SLIPPAGE_BPS = 200;
/** EMA span, in bars. */
const EMA_BARS = 12;

interface Series {
  /** Closes so far, oldest first, as numbers (raw price units). */
  closes: number[];
  /** The running 12-bar EMA of the closes, null before the first bar. */
  ema: number | null;
}

const series = new Map<string, Series>();
/** When each open position was decided (the decided_bar of its buy fill). */
const decidedBar = new Map<string, number>();

const emaStep = (last: number, x: number, bars: number): number =>
  (x - last) * (2 / (bars + 1)) + last;

/** Fold a bar's close into its symbol's series. */
function push(symbol: string, close: bigint): void {
  let s = series.get(symbol);
  if (s === undefined) series.set(symbol, (s = { closes: [], ema: null }));
  const c = Number(close);
  s.closes.push(c);
  s.ema = s.ema === null ? c : emaStep(s.ema, c, EMA_BARS);
}

await runBars({
  onBatch(state: BarsState, batch) {
    // Remember which buys filled on this batch, so exits can age positions.
    for (const f of batch.fills) {
      if (f.side === 'buy' && f.status === 'filled') decidedBar.set(f.symbol, f.decided_bar);
      if (f.side === 'sell' && f.status === 'filled') decidedBar.delete(f.symbol);
    }
    for (const bar of batch.bars) push(bar.symbol, BigInt(bar.c));

    // No history yet: the EMA is still seeding, so no signal is read.
    if (batch.seq < WARMUP_BARS || state.warmingUp) return [];

    const { caps, fees } = state.hello;
    const minNotional = BigInt(fees.min_notional_quote_units);
    const orders: OrderInput[] = [];
    let cash = state.cash;

    for (const { symbol } of state.hello.symbols) {
      const s = series.get(symbol);
      const close = state.close(symbol);
      if (s === undefined || s.ema === null || close === null) continue;
      const held = state.positions.get(symbol);
      const c = Number(close);

      if (held !== undefined) {
        // Exit: take profit, stop loss, or the hold ran out. All three are
        // exact BigInt comparisons of value against cost (fees included).
        const value = state.value(symbol, held.qty);
        const age = batch.seq - (decidedBar.get(symbol) ?? batch.seq);
        const takeProfit = value * 10000n >= held.cost * BigInt(10000 + TAKE_PROFIT_BPS);
        const stopLoss = value * 10000n <= held.cost * BigInt(10000 - STOP_LOSS_BPS);
        if (takeProfit || stopLoss || age >= MAX_HOLD_BARS) {
          orders.push({ side: 'sell', symbol, qty: held.qty, max_slippage_bps: MAX_SLIPPAGE_BPS });
        }
        continue;
      }

      // Entry: the close dipped at least DIP_BPS under its 12-bar EMA.
      // A dip measured in float64 on raw price units: the prices fit in a
      // double exactly, and the same bars give the same EMA, run after run.
      const dipBps = ((s.ema - c) / s.ema) * 10000;
      if (!(dipBps >= DIP_BPS)) continue;

      const bySlot = (BigInt(SLOT_BPS) * state.equity) / BPS;
      const byWeight = (BigInt(caps.max_weight_bps) * state.equity) / BPS;
      let slice = bySlot < byWeight ? bySlot : byWeight;
      if (slice > cash) slice = cash;
      if (slice === 0n || slice < minNotional) continue;
      // Guard: never open more positions than the caps allow, counting
      // both the positions already held and the buys in this reply.
      const openAfter = state.positions.size + orders.filter((o) => o.side === 'buy').length;
      if (openAfter >= caps.max_open_positions) continue;
      if (orders.length >= caps.max_orders_per_bar) break;
      orders.push({ side: 'buy', symbol, notional_quote_units: slice, max_slippage_bps: MAX_SLIPPAGE_BPS });
      cash -= slice;
    }
    return orders;
  },
});
