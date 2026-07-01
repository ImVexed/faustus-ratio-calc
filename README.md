# Faustus Ratio Splitter

A tiny static GitHub Pages tool for turning Path of Exile exchange ratios into
less fragile listing rows.

It supports:

- Ratios like `1:1.19`, `1.19`, `100:119`, and `16 + 12/143`.
- Exact, chunked, sell-all, and shielded posting plans.
- Atomic-unit and partial-fill risk hints.
- A partial-fill simulator for "why did my order vanish?" cases.

For the motivating example, selling `108` at `1:1.19` defaults to a safer
`21 item -> 25 chaos` chunk plan for `105` items, with the remaining `3` called
out separately. The exact target is `100 -> 119`, which is more fragile because
the atomic denominator is high.

## GitHub Pages

This repo has no build step. Push it to GitHub, then enable Pages from the
repository root on the branch you want to publish.

## Local checks

```powershell
node --check .\logic.mjs
node --check .\app.mjs
node --test
```

## Local preview

```powershell
node .\tools\serve.mjs 4173
```
