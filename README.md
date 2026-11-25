[![make.fun](https://make.fun/badge/u-gorun-gadget-tiny-bot-easy-2-beat-a48f3ce1.svg)](https://make.fun/c/u-gorun-gadget-tiny-bot-easy-2-beat-a48f3ce1)
[![rank](https://make.fun/badge/u-gorun-gadget-tiny-bot-easy-2-beat-a48f3ce1/Cm11w/tiny-bot-easy-2-beat-a48f3ce1/rank.svg)](https://make.fun/c/u-gorun-gadget-tiny-bot-easy-2-beat-a48f3ce1)
[![reward](https://make.fun/badge/u-gorun-gadget-tiny-bot-easy-2-beat-a48f3ce1/Cm11w/tiny-bot-easy-2-beat-a48f3ce1/reward.svg)](https://make.fun/c/u-gorun-gadget-tiny-bot-easy-2-beat-a48f3ce1)

# Tiny Dip Bot — Beat Buy-and-Hold on Solana

Entry for [Tiny Bot, Easy $2: Beat Buy-and-Hold on Solana](https://make.fun/c/u-gorun-gadget-tiny-bot-easy-2-beat-a48f3ce1): a tiny paper-trading bot for hourly Solana prices that beats buy-and-hold.

## Strategy

On every hourly bar, for each of the 7 symbols (FARTCOIN, JITOSOL, POPCAT,
RAY, SOL, WETH, WIF), buy a dip — the close at least 1.5% below its 12-bar
exponential moving average — with a fixed slice of equity (20%, capped by
the 25% max-weight rule), and sell the whole position when it is worth
1.5% over its cost, when it falls 5% under its cost, or when it has been
held 48 bars.

Why this wins here: hourly Solana prices chop around their short average
even while drifting down, so buying the dip and taking a quick 1.5% beats
holding through the drift, and sitting in cash while there is no dip beats
it further. Momentum entries were tested and rejected — on these bars they
buy dead-cat bounces and lose. Trend gates were tested and rejected too —
they block exactly the oversold bounces that pay.

## Measured result (kit's own grader, dev window)

`node cli/makefun.mjs grade-local --kit . --bot <repo> --driver process`

- Net PnL: **+$396.03** on $10,000 capital (**+3.96%**)
- Buy-and-hold on the same window: **−$869.34 (−8.69%)** — edge ≈ **+$1,265**
- Trades: 26 (13 buys, 13 sells) across 6 symbols, 0 rejected orders
- Max drawdown: 2.22%, Sharpe (per bar): 0.10
- Two executions reproduce byte for byte (L1 reproduced: true)

That would place 2nd on the dev leaderboard at time of writing (1st:
+$653.42, 2nd: +$76.13). Note the final grading runs on a fresh 3-day
window collected after the deadline, so this number is a dev-window
measurement, not a promise — the strategy was chosen for robustness
(coarse parameters, no per-symbol tuning) rather than for fitting the dev
window. As a robustness check, the same rules were also run over nine
rolling 72-bar windows (the final window's length): they beat buy-and-hold
in 7 of 9, with a mean net PnL of about +$24 per window against about
−$271 for buy-and-hold on the same windows. The two windows where the bot
does not beat buy-and-hold are steady grind-up windows with no 1.5% dip
to buy — the bot sits in cash there, which is the known cost of a
dip-only rule.

## Files

- `main.ts` — the bot (TypeScript, runs as-is under Node 22)
- `vendor/makefun-bars.ts` — byte-identical copy of the kit's
  `sdk/makefun-bars.ts` line-protocol shim
- `LICENSE` — MIT

## Run it

The grader runs `node /bot/main.ts` with this directory mounted at `/bot`.
It speaks `agent-fun/bars-replay/v1` on stdin/stdout, needs no network, no
clock and no randomness: the same bars always give the same orders.

## License

MIT — see `LICENSE`.
