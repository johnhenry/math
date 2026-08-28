# Changelog

Notable changes to the `math` monorepo (`@johnhenry/math`, `@johnhenry/iteration`,
`@johnhenry/math-prototype-patch`). The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Per-package release history is on npm;
versions were reset to `0.0.0` when the packages moved under the `@johnhenry` scope.

## [Unreleased]

## [0.0.1] - 2026-08-27

### Added

- Root `examples/` with five runnable walkthroughs (symbolic calculus, algebra over arbitrary
  structures, exact numbers + forward-mode autodiff, iteration pipelines, the prototype patch),
  an `npm run examples` loop, and a CI smoke step that runs them against the built packages.
- Root README rewritten as a family map with routing guidance and docs links.
- This changelog.

### Fixed

- `@johnhenry/math`: `0/0` no longer silently simplifies to `0` — `simplifyOnce`'s division case
  checked only whether the numerator was zero, so the indeterminate form `0/0` fell through to
  the same shortcut as an ordinary `0/x` and collapsed to `0`; a zero denominator is now checked
  first and left unevaluated. `DualNumber.pow(0)` no longer returns `NaN` at `value === 0` — the
  general derivative formula `n * value**(n-1) * deriv` degenerates to `0 * Infinity` there;
  `n === 0` is now special-cased to `{value: 1, deriv: 0}` (#73, #74, #75).

## [0.0.0] - 2026-08-25

Provenance entry — the state of the monorepo when this changelog was introduced, not a release
cut on this date.

- `@johnhenry/math`: TypeScript port of a Mallory-era ActionScript 3 library (~40 bugs found and
  fixed during the port), extended well past it: symbolic CAS, `Structure<T>` linear algebra,
  number theory, group theory, special functions, FFT, geometry, `CellGraph`. Documented by an
  executable `docs/COOKBOOK.md`.
- `@johnhenry/iteration`: third name for a long-shipping library (`async-itertools` →
  `mallory-iteration` → `@johnhenry/iteration`, full git history preserved). Transducers,
  itertools parity, consumers, bounded concurrency, cancellation, `AsyncChannel`.
- `@johnhenry/math-prototype-patch`: opt-in `Number.prototype` patch split out of core by design
  (johnhenry/math#28); all-or-nothing collision checking, fully reversible, separate `/global`
  ambient-types opt-in.
- Publishing: release-triggered `publish.yml` (npm with provenance + JSR for `math` and
  `iteration`).
