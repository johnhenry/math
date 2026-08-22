[↑](../readme.md)

# Installation and Usage

- [Installation and Usage](#installation-and-usage)
  - [Installation](#installation)
  - [Usage](#usage)
    - [ESM (`import`)](#esm-import)
    - [CommonJS (`require`)](#commonjs-require)

## Installation

```bash
npm install @johnhenry/iteration
```

## Usage

`@johnhenry/iteration` ships **ESM only** — compiled `.js` + `.d.ts` under `dist/`, no bundle,
no UMD/IIFE build, no separate CJS build. Requires **Node 22.12+** (or an equivalent
Iterator-Helpers-capable engine).

### ESM (`import`)

```javascript
import { countSync, transduceSync, transducers } from "@johnhenry/iteration";
```

Subpath exports are available for the individual namespaces:

```javascript
import { takeWhileSync } from "@johnhenry/iteration/itertools";
import { map, filter } from "@johnhenry/iteration/transducers";
import { combinations } from "@johnhenry/iteration/combinatorics";
import { someAsync } from "@johnhenry/iteration/consumers";
```

In a browser, import the same ESM files directly — there is no script-tag build:

```html
<script type="module">
  import { countSync } from "./node_modules/@johnhenry/iteration/dist/index.js";
</script>
```

### CommonJS (`require`)

No CJS build is provided or needed. Node's native `require(esm)` support (stable and unflagged
since **Node 22.12**, which is this package's floor) loads the same ESM files synchronously:

```javascript
const { countSync, someAsync } = require("@johnhenry/iteration");
```

This is verified in CI by `scripts/require-esm-smoke-test.cjs`, not just documented.
