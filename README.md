# metalsmith-spellcheck

This is a plugin for [Metalsmith](http://metalsmith.io) that checks spelling.
Core checks are done using [nodehun](https://www.npmjs.com/package/nodehun),
but the plugin provides a variety of useful ways to add exceptions and ignore
various words.

## Installation

This module is released via npm, install the latest released version with:

```
npm install --save metalsmith-spellcheck
```

##  Usage

If using the CLI for Metalsmith, metalsmith-spellcheck can be used like any other plugin by including it in `metalsmith.json`:

```json
{
  "plugins": {
    "metalsmith-spellcheck"
  }
}
```

For Metalsmith's JavaScript API, metalsmith-spellcheck can be used like any other plugin, by attaching it to the function invocation chain on the metalscript object:

```js
var spellcheck = require('metalsmith-spellcheck');
require('metalsmith')(__dirname)
  .use(spellcheck())
  .build();
```

Because metalsmith-spellcheck will only check HTML pages, normally you will
want to use metalsmith-spellcheck at the end of your build pipeline when all
of your HTML pages have been generated. 

## Exceptions

metalsmith-spellcheck has multiple ways to incorporate spelling exceptions,
at a single-word or phrase, entire file, or global level.

### Options

metalsmith-spellcheck does not require any options, but the following options
are available:

#### `verbose` (optional)

(default: *false*)

If set a message will be printed if links fail. 

#### `failWithoutNetwork` (optional)

(default : *true*)

If set, metalsmith-spellcheck will fail if no network
connection is available. Otherwise, it will still check internal links before
exiting. Note in this case that external links will not be reported as
failing.

#### `failMissing` (optional)

(default: *false*)

If set the metalsmith build process will halt if links are missing.

#### `cacheChecks` (optional)

(default: *true*)

If set metalsmith-spellcheck will record when external links succeed in
`checkFile` and not repeat the check for an interval set by `recheckMinutes`.

#### `recheckMinutes` (optional)

(default : *1440* (24 hours))

Determines the length between successive link checks when `cacheChecks` is
set to true.

#### `checkFile` (optional)

(default: *`.links_checked.json`*)

Path relative to the metalsmith source directory where
metalsmith-spellcheck caches link check information. This will be removed from
the build directory.

#### `ignoreFile` (optional)

(default: *`links_ignore.json`*)

Path relative to the metalsmith source directory to a JSON
file containing an array of links to ignore. This will be removed from the
build directory.

#### `failFile` (optional)

(default: *`links_failed.json`*)

Path relative to the metalsmith source directory to a JSON file where link
failures are recorded. This will be removed from the build directory.

<!--
#### `optimizeInternal` (optional)

(default : *true*)

If set, metalsmith-spellcheck will look for internal
  links in the metalsmith output files, rather than by contacting a local
  webserver. If disabled, `internalHost` must be set.

#### `internalHost` (optional)

(default : undefined)

Internal host and port to use if not optimizing internal link checks.
-->

