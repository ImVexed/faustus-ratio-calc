# Faustus Ratio Splitter

A tiny static GitHub Pages tool for turning Path of Exile exchange ratios into
simple listing rows.

It supports:

- Ratios like `1:1.19`, `1.19`, `1.2 to 1`, `100:119`, and `16 + 12/143`.
- A ratio slider and a small nudge slider.
- One primary row to post, plus a compact sell-all alternative.
- The exact market unit for context.

For the motivating example, selling `108` at `1:1.19` defaults to a safer
`21 for 25` chunk plan for `105` items, with the remaining `3` called out
separately. The sell-all alternative is `36 for 43` posted three times.

## GitHub Pages

This repo has no build step. GitHub Actions runs the checks and deploys the
static files to Pages.

## Local checks

```powershell
node --check .\logic.mjs
node --check .\app.mjs
node --check .\tools\serve.mjs
node --test
```

## Local preview

```powershell
node .\tools\serve.mjs 4173
```
