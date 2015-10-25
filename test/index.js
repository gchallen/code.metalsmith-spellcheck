var metalsmith = require('metalsmith'),
    asciidoc = require('metalsmith-asciidoc'),
    fs = require('fs'),
    path = require('path'),
    _ = require('underscore'),
    chai = require('chai'),
    jsonfile = require('jsonfile'),
    async = require('async'),
    nodehun = require('nodehun'),
    powerAssert = require('power-assert'),
    spellcheck = require('..');

chai.use(require('chai-fs'));
var assert = chai.assert;

function reset_files(test_defaults) {
  try {
    fs.unlinkSync(test_defaults.failFile);
  } catch (err) {};
  try {
    fs.unlinkSync(test_defaults.exceptionFile);
  } catch (err) {};
  try {
    fs.unlinkSync(test_defaults.checkFile);
  } catch (err) {};
  assert.notPathExists(test_defaults.exceptionFile);
  assert.notPathExists(test_defaults.failFile);
  assert.notPathExists(test_defaults.checkFile);
}

function check_files(files, defaults) {
  assert(!(defaults.failFile in files));
  assert(!(defaults.exceptionFile in files));
  if (defaults.affFile) {
    assert(!(defaults.affFile in files));
  }
  if (defaults.dicFile) {
    assert(!(defaults.dicFile in files));
  }
}

function defaultsWithDictionary(dict) {
  var defaults = _.clone(spellcheck.defaults);
  defaults.verbose = false;
  defaults.affFile = 'en_US.aff';
  defaults.dicFile = 'en_US.dic';
  defaults.dict = dict;
  return defaults;
}

var src = 'test/fixtures/errors';
var dict = new nodehun(fs.readFileSync(path.join(src, 'src', 'en_US.aff')),
                       fs.readFileSync(path.join(src, 'src', 'en_US.dic')));

describe('metalsmith-spellcheck', function() {
  it('should identify misspelled words with the default parameters', function(done) {
    var defaults = defaultsWithDictionary(dict);
    var test_defaults = spellcheck.processConfig(defaults, path.join(src, 'src'));
    reset_files(test_defaults);

    metalsmith(src)
      .use(spellcheck(defaults))
      .build(function (err, files) {
        if (!err) {
          return done(new Error('should fail'));
        }
        assert.pathExists(test_defaults.failFile);
        var failures = jsonfile.readFileSync(test_defaults.failFile);
        powerAssert.deepEqual(_.keys(failures).sort(), ["Challen", "smartphone", "wrd"].sort());
        done();
      });
  });
  it('should ignore misspelled words in the exception file', function(done) {
    var defaults = defaultsWithDictionary();
    var defaults = defaultsWithDictionary(dict);
    var test_defaults = spellcheck.processConfig(defaults, path.join(src, 'src'));
    var exceptions = { 
      "smartphone": ['working.html'],
      "wrd": ['broken.html'],
      "/chall\\w+/i": true
    };
    reset_files(test_defaults);
    jsonfile.writeFileSync(test_defaults.exceptionFile, exceptions);

    metalsmith(src)
      .use(spellcheck(defaults))
      .build(function (err, files) {
        if (!err) {
          return done(new Error('should fail'));
        }
        assert.pathExists(test_defaults.failFile);
        var failures = jsonfile.readFileSync(test_defaults.failFile);
        powerAssert.deepEqual(_.keys(failures).sort(), ["wrd"].sort());
        done();
      });
  });
  it('should not fail when told not to', function(done) {
    var defaults = defaultsWithDictionary(dict);
    defaults.failErrors = false;
    var test_defaults = spellcheck.processConfig(defaults, path.join(src, 'src'));
    reset_files(test_defaults);

    metalsmith(src)
      .use(spellcheck(defaults))
      .build(function (err, files) {
        if (err) {
          return done(err);
        }
        assert.pathExists(test_defaults.failFile);
        var failures = jsonfile.readFileSync(test_defaults.failFile);
        powerAssert.deepEqual(_.keys(failures).sort(), ["Challen", "smartphone", "wrd"].sort());
        check_files(files, defaults);
        done();
      });
  });
  it('should ignore exception phrases in metadata', function(done) {
    var defaults = defaultsWithDictionary(dict);
    defaults.failErrors = false;
    var test_defaults = spellcheck.processConfig(defaults, path.join(src, 'src'));
    reset_files(test_defaults);

    metalsmith(src)
      .use(function (files, metalsmith, innerDone) {
        var metadata = metalsmith.metadata();
        metadata['spelling_exceptions'] = ["Challen: smartphone"];
        innerDone();
      })
      .use(spellcheck(defaults))
      .build(function (err, files) {
        if (err) {
          return done(err);
        }
        assert.pathExists(test_defaults.failFile);
        var failures = jsonfile.readFileSync(test_defaults.failFile);
        powerAssert.deepEqual(_.keys(failures).sort(), ["wrd"].sort());
        check_files(files, defaults);
        done();
      });
  });
  it('should ignore exception phrases in the config', function(done) {
    var defaults = defaultsWithDictionary(dict);
    defaults.exceptions = ["Challen: smartphone"];
    defaults.failErrors = false;
    var test_defaults = spellcheck.processConfig(defaults, path.join(src, 'src'));
    reset_files(test_defaults);

    metalsmith(src)
      .use(spellcheck(defaults))
      .build(function (err, files) {
        if (err) {
          return done(err);
        }
        assert.pathExists(test_defaults.failFile);
        var failures = jsonfile.readFileSync(test_defaults.failFile);
        powerAssert.deepEqual(_.keys(failures).sort(), ["wrd"].sort());
        check_files(files, defaults);
        done();
      });
  });
  it('should ignore exception patterns in metadata', function(done) {
    var defaults = defaultsWithDictionary(dict);
    defaults.failErrors = false;
    var test_defaults = spellcheck.processConfig(defaults, path.join(src, 'src'));
    reset_files(test_defaults);

    metalsmith(src)
      .use(function (files, metalsmith, innerDone) {
        var metadata = metalsmith.metadata();
        metadata['spelling_exceptions'] =['/challen/i', '/smartphones?/'];
        innerDone();
      })
      .use(spellcheck(defaults))
      .build(function (err, files) {
        if (err) {
          return done(err);
        }
        assert.pathExists(test_defaults.failFile);
        var failures = jsonfile.readFileSync(test_defaults.failFile);
        powerAssert.deepEqual(_.keys(failures).sort(), ["wrd"].sort());
        check_files(files, defaults);
        done();
      });
  });
  it('should ignore exception patterns in the config', function(done) {
    var defaults = defaultsWithDictionary(dict);
    defaults.exceptions = ['Challen', '/Smartphone/i'];
    defaults.failErrors = false;
    var test_defaults = spellcheck.processConfig(defaults, path.join(src, 'src'));
    reset_files(test_defaults);

    metalsmith(src)
      .use(spellcheck(defaults))
      .build(function (err, files) {
        if (err) {
          return done(err);
        }
        assert.pathExists(test_defaults.failFile);
        var failures = jsonfile.readFileSync(test_defaults.failFile);
        powerAssert.deepEqual(_.keys(failures).sort(), ["wrd"].sort());
        check_files(files, defaults);
        done();
      });
  });
  it('should ignore multi-word patterns', function(done) {
    var defaults = defaultsWithDictionary(dict);
    defaults.exceptions = ['Geoffrey Challen', '/smartphones?/'];
    defaults.failErrors = false;
    var test_defaults = spellcheck.processConfig(defaults, path.join(src, 'src'));
    reset_files(test_defaults);

    metalsmith(src)
      .use(spellcheck(defaults))
      .build(function (err, files) {
        if (err) {
          return done(err);
        }
        assert.pathExists(test_defaults.failFile);
        var failures = jsonfile.readFileSync(test_defaults.failFile);
        powerAssert.deepEqual(_.keys(failures).sort(), ["wrd"].sort());
        check_files(files, defaults);
        done();
      });
  });
  it('should ignore exceptions in file metadata', function(done) {
    var defaults = defaultsWithDictionary(dict);
    defaults.exceptions = ['Geoffrey Challen', '/smartphones?/'];
    defaults.failErrors = false;
    var test_defaults = spellcheck.processConfig(defaults, path.join(src, 'src'));
    reset_files(test_defaults);

    metalsmith(src)
      .use(asciidoc())
      .use(spellcheck(defaults))
      .build(function (err, files) {
        if (err) {
          return done(err);
        }
        assert.pathExists(test_defaults.failFile);
        var failures = jsonfile.readFileSync(test_defaults.failFile);
        powerAssert.deepEqual(_.keys(failures).sort(), ["wrd"].sort());
        check_files(files, defaults);
        done();
      });
  });
  it('should ignore exceptions with path patterns', function(done) {
    var defaults = defaultsWithDictionary(dict);
    defaults.failErrors = false;
    var test_defaults = spellcheck.processConfig(defaults, path.join(src, 'src'));
    var exceptions = { 
      "smartphone": ['*.html'],
      "wrd": ['broken.html'],
      "/\\bchall\\w*\\b/i": true
    };
    reset_files(test_defaults);
    jsonfile.writeFileSync(test_defaults.exceptionFile, exceptions);

    metalsmith(src)
      .use(asciidoc())
      .use(spellcheck(defaults))
      .build(function (err, files) {
        if (err) {
          return done(err);
        }
        assert.pathExists(test_defaults.failFile);
        var failures = jsonfile.readFileSync(test_defaults.failFile);
        powerAssert.deepEqual(_.keys(failures).sort(), ["wrd"].sort());
        check_files(files, defaults);
        done();
      });
  });
  it('should ignore apostrophes', function(done) {
    var defaults = defaultsWithDictionary(dict);
    defaults.failErrors = false;
    defaults.exceptions = ["Challen", "smartphone"]
    var test_defaults = spellcheck.processConfig(defaults, path.join(src, 'src'));
    reset_files(test_defaults);

    metalsmith(src)
      .use(asciidoc())
      .use(spellcheck(defaults))
      .build(function (err, files) {
        if (err) {
          return done(err);
        }
        assert.pathExists(test_defaults.failFile);
        var failures = jsonfile.readFileSync(test_defaults.failFile);
        powerAssert.deepEqual(_.keys(failures).sort(), ["wrd"].sort());
        check_files(files, defaults);
        done();
      });
  });
  it('should cache checks', function(done) {
    var defaults = defaultsWithDictionary(dict);
    defaults.failErrors = false;
    defaults.exceptions = ["Challen", "smartphone"]
    var test_defaults = spellcheck.processConfig(defaults, path.join(src, 'src'));
    reset_files(test_defaults);
    
    var failFileHash, checkFileHash;

    async.series([
      function (callback) {
        metalsmith(src)
          .use(asciidoc())
          .use(spellcheck(defaults))
          .build(function (err, files) {
            if (err) {
              return done(err);
            }
            assert.pathExists(test_defaults.failFile);
            var failures = jsonfile.readFileSync(test_defaults.failFile);
            powerAssert.deepEqual(_.keys(failures).sort(), ["wrd"].sort());

            assert.pathExists(test_defaults.checkFile);
            var checked = jsonfile.readFileSync(test_defaults.checkFile);
            powerAssert.deepEqual(_.keys(checked.files).sort(), ["working.html", "second.html", "en_US.dic", "en_US.aff"].sort());
            
            check_files(files, defaults);
            callback();
          });
      },
      function (callback) {
        metalsmith(src)
          .use(asciidoc())
          .use(spellcheck(defaults))
          .build(function (err, files) {
            if (err) {
              return done(err);
            }
            assert.pathExists(test_defaults.failFile);
            var failures = jsonfile.readFileSync(test_defaults.failFile);
            powerAssert.deepEqual(_.keys(failures).sort(), ["wrd"].sort());

            assert.pathExists(test_defaults.checkFile);
            var checked = jsonfile.readFileSync(test_defaults.checkFile);
            powerAssert.deepEqual(_.keys(checked.files).sort(), ["working.html", "second.html", "en_US.dic", "en_US.aff"].sort());
            
            check_files(files, defaults);
            callback();
          });
      }],
      function () {
        done();
      });
  });
});
