[↑](../readme.md)

# Installation and Usage

- [Installation and Usage](#installation-and-usage)
  - [Installation](#installation)
  - [Usage](#usage)
    - [IFFE ('script src=')](#iffe-script-src)
    - [Common JS ('require')](#common-js-require)
    - [Ecmascript modules ('import')](#ecmascript-modules-import)

## Installation

```bash
npm install mallory-iteration
```

## Usage

AsyncItertools is built in three different module flavors:

### IFFE ('script src=')

The traditional way to load javascript in browsers.

```html
<html>
  <script src="./node_modules/mallory-iteration/dist/malloryIteration.mjs"></script>
  <script>
    // do stuff with malloryIteration
  </script>
</html>
```

### Common JS ('require')

The traditional way to load javascript in node.

```javascript
const malloryIteration = require("./node_modules/mallory-iteration/dist/cjs/index.cjs");
// do stuff with malloryIteration
```

### Ecmascript modules ('import')

The modern way to load javascript in browsers and node.

```html
<html>
  <script type="module">
    import * as malloryIteration from "./node_modules/mallory-iteration/dist/index.mjs";
    // do stuff with malloryIteration
  </script>
</html>
```

```javascript
// import * as malloryIteration from './node_modules/mallory-iteration/dist/index.mjs';
import * as malloryIteration from "mallory-iteration";
// do stuff with malloryIteration
```
