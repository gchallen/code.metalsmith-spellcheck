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

You can embed your exceptions right in your HTML:
```html
This <span class="spelling_exception">stwange</span> word will be ignored.
```

And depending on your markup language, probably in your markup as well:
```asciidoc
I prefer [.spelling_exception]#AsciiDoc#, but there is probably a way to do
this using [.spelling_exception]#Markdown# too.
```

You can also attach exceptions using file YAML front matter, within the
Metalsmith metadata object, as a configuration argument to
metalsmith-spellcheck, and within a separate file. In all these cases,
exceptions can be either patterns&mdash;if they start and end with
"/"&mdash;or otherwise phrases if not. Regular expressions are automatically
surrounded by word boundary characters, and phrases split into lists of
words. Here are some examples:

* "test" becomes "/\\b(T|t)est\\b/", meaning that simple exceptions that
	start with lowercase letters automatically expand to match upper and lower
	case...
* ...but "Test" becomes "/\\bTest\\b/", meaning that simple uppercase
	exceptions do not expand in the same way.
* "/Challen/i" becomes "/\\bChallen\\b/i"
* "/Geoffrey Challen/" becomes "/\\bGeoffrey Challen\\b/"
* "Geoffrey Challen" becomes ["/\\bGeoffrey\\b/", "/\\bChallen\\b/"]
* "Titles: With Colons" becomes ["/\\bTitles\\b/", "/\\bWith\\b/",
  "/\\bColons\\b/"]

You get the idea. Now here are some examples of how to provide these kind of
exceptions to metalsmith-spellcheck:

### Frontmatter

```
--
title: My New Blog Post
spelling_exceptions:
- Chuchu
- Xyz
--
Today I'm blogging about my pets: Chuchu and Xyz.
```

Frontmatter exceptions only apply to the file that they annotate, which can
be a problem if you lift snippets of files onto other pages&mdash;for
example, to generate a blog index with a short summary of each article. In
that case it's safer to use the inline exception format described above.

### Configuration Option or Metadata

metalsmith-spellcheck accepts exceptions as a standard configuration option:

```js
var spellcheck = require('metalsmith-spellcheck');
require('metalsmith')(__dirname)
  .use(spellcheck({ 'exceptions': ["Chuchu", "Xyz"] })
  .build();
```

However, a potentially more powerful way to add exceptions is through the
Metalsmith metadata object:

```js
var spellcheck = require('metalsmith-spellcheck');
require('metalsmith')(__dirname)
  .use(function (files, metalsmith, done) {
    var metadata = metalsmith.metadata();
    metadata['spelling_exceptions'] = ["Chuchu", "Xyz"];
    done();
  })
  .use(spellcheck())
  .build();
```

I use this feature on [my group's website](http://blue.cse.buffalo.edu) to
automatically add names of collaborators and words from paper and project
titles as spelling exceptions, which limits the number of manual exceptions
that still have to be made.

### Exception File

Finally, metalsmith-spellcheck also loads exceptions from a JSON file
located in your source directory. (Don't worry: it's removed from the build.)
By default this is `spelling_exceptions.json`. Here's an example:

```json
{
  "Chuchu": true,
  "/Geoffrey Challen/": true,
  "Xyz": [ "index.html"]
}
```

In this case, the keys are the exception patterns or phrases (as described
above), but the values are either (1) a list of filenames where the exception
should be made (2) true, indicating that the exception should be made
everywhere. So the example above ignores "/\\bChuchu\\b/" everywhere,
"/\\bGeoffrey Challen\\b/" everywhere, and "/\\bXyz\\b/" only on
`index.html`. Of course metalsmith-spellcheck has no idea how your build
pipeline works, so the files to match are all output files, not input files.

### Options

Usually metalsmith-spellcheck requires paths to a `.dic` and `.aff` file
which are used to initialize nodehun. However, you can also intialize nodehun
yourself and pass the resulting dict object. All other options are optional.

#### `dicFile` (required)

Path relative to the metalsmith source directory to the `.dic` file used to
initialize nodehun. It will be removed from your metalsmith build directory.

#### `affFile` (required)

Path relative to the metalsmith source directory to the `.aff` file used to
initialize nodehun. It will be removed from your metalsmith build directory.

#### `dict` (required)

Alternatively, a reference to an initialized nodehun object, in case you want
to use multiple dictionaries or do some dictionary customization prior to
using the plugin.

#### `cacheChecks` (optional)

(default: *true*)

If set metalsmith-spellcheck will only rerun spelling checks when it thinks
that things have changed: either because you changed the dictionaries,
changed the exceptions, or changed its inputs.

#### `verbose` (optional)

(default: *false*)

If set a message will be printed when misspelled words are detected.

#### `veryVerbose` (optional)

(default: *false*)

If set messages about cache checking will be displayed.

#### `failErrors` (optional)

(default: *true*)

If set the metalsmith build process will halt if words are misspelled.

#### `exceptions` (optional)

Array of spelling exceptions as described above.

#### `checkFile` (optional)

(default: *`spelling_checked.json`*)

Path relative to the metalsmith source directory to a JSON file containing
information required to cache spelling checks. This will be removed from the
build directory.

#### `exceptionFile` (optional)

(default: *`spelling_exceptions.json`*)

Path relative to the metalsmith source directory to a JSON file containing
spelling exceptions. See description above. This will be removed from the
build directory.

#### `failFile` (optional)

(default: *`spelling_failed.json`*)

Path relative to the metalsmith source directory to a JSON file where
spelling failures are recorded. This will be removed from the build
directory.
