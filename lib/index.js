var debug = require('debug')('metalsmith-spellcheck'),
    path = require('path'),
    fs = require('fs'),
    async = require('async'),
    _ = require('underscore'),
    nodehun = require('nodehun'),
    validator = require('validator'),
    cheerio = require('cheerio'),
    jsonfile = require('jsonfile'),
    minimatch = require('minimatch'),
    MD5 = require('md5'),
    object_hash = require('object-hash');
jsonfile.spaces = 4;

var defaults = {
  'verbose': true,
  'failErrors': true,
  'cacheChecks': true,
  'checkedPart': "*",
  'exceptionFile': 'spelling_exceptions.json',
  'checkFile': '.spelling_check.json',
  'failFile': 'spelling_failed.json',
  'exceptions': [],
}

function processConfig(config, src) {
  config = config || {};
  config = _.extend(_.clone(defaults), config);
  if (src) {
    config.exceptionFile = path.join(src, config.exceptionFile);
    config.failFile = path.join(src, config.failFile);
    config.checkFile = path.join(src, config.checkFile);
  }
  return config;
}

function removeFiles(files, config) {
  if (files[config.checkFile]) {
    delete(files[config.checkFile]);
  }
  if (files[config.failFile]) {
    delete(files[config.failFile]);
  }
  if (files[config.exceptionFile]) {
    delete(files[config.exceptionFile]);
  }
  if (files[config.affFile]) {
    delete(files[config.affFile]);
  }
  if (files[config.dicFile]) {
    delete(files[config.dicFile]);
  }
};

function cleanText(text) {
  var words = text.trim()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/\.\.\./g, ".")
    .replace(/[^a-zA-Z0-9'\.@]+/g, " ").trim().split(/\s+/);

  words = _.map(words, function (word) {
    if (((word.match(/\./g) || []).length == 1 && /^.*\.$/.test(word)) ||
        (/^.*:$/.test(word))) {
      word = word.substring(0, word.length - 1);
    }
    if (/^.*'$/.test(word)) {
      return word.substring(0, word.length - 1);
    } else if (/^.*'s/.test(word)) {
      return word.substring(0, word.length - 2);
    } else {
      return word;
    }
  });
  words = _.reject(words, function (word) {
    return (word === "") ||
      (word === "'s") ||
      /^\d{2}:\d{2}/.test(word) ||
      validator.isNumeric(word) ||
      validator.isEmail(word) ||
      validator.isURL(word) ||
      validator.isDate(word);
  });
  return _.toArray(words);
};

var regexPattern = /^\/(.*?)\/([gim]*)$/;
var startBoundary = "(?:^|[^a-zA-Z0-9'@])";
var endBoundary = "(?=$|[^a-zA-Z0-9'\.@])";

function exceptionToPatterns(pattern, files) {
  var parts = pattern.match(regexPattern);
  if (parts) {
    var newPattern = parts[1];
    var flags = parts[2];
    if (flags.indexOf("g") === -1) {
      flags += "g";
    } 
    return [{'files': files, 'pattern': new RegExp(startBoundary + newPattern + endBoundary, flags)}];
  } else {
    return _.map(cleanText(pattern), function (word) {
      return {'files': files, 'pattern': new RegExp(startBoundary + word + endBoundary, "g") }
    });
  }
}

function spellcheck(config) {

  return function(files, metalsmith, done) {

    config = processConfig(config);
    
    var realDone = function(err) {
      removeFiles(files, config);
      done(err)
    };
    
    if (!config.dict && (!(config.dicFile) || !(config.affFile))) {
      realDone(new Error("must provide either a dict or dicFile and affFile options to metalsmith-spellcheck"));
      return;
    }
    
    var dict, exceptions = {};
    try {
      dict = config.dict || new nodehun(files[config.affFile].contents, files[config.dicFile].contents);
    
      if (config.exceptionFile && files[config.exceptionFile]) {
        exceptions = JSON.parse(files[config.exceptionFile].contents);
      }
    } catch (err) {
      realDone(err);
      return;
    }

    if (config.cacheChecks) {
      var checked_files = { 'files': {}, 'exceptions': {}};
      try {
        checked_files = JSON.parse(files[config.checkFile].contents);
      } catch (err) {};
      var aff_hash = MD5(files[config.affFile].contents);
      var dic_hash = MD5(files[config.dicFile].contents);

      var can_cache = ((checked_files.files[config.affFile] == aff_hash) &&
          (checked_files.files[config.dicFile] == dic_hash));
      checked_files.files[config.affFile] = aff_hash;
      checked_files.files[config.dicFile] = dic_hash;
    }
   
    var metadata = metalsmith.metadata();
    var metadata_exceptions;
    try {
      metadata_exceptions = metadata['spelling_exceptions'];
    } catch (err) {};
    metadata_exceptions = _.union(config.exceptions, metadata_exceptions);
    
    var htmlfiles = _.pick(files, function(file, filename) {
      return (path.extname(filename) === '.html');
    });
    
    var filenamewords = {}, wordstofilenames = {}, uniqwords = [];
    var pattern_exceptions = {};

    _.each(htmlfiles, function (file, filename) {
      pattern_exceptions[filename] = [];
    });

    async.series([
        function (callback) {
          function addException(info) {
            if (info.files === true) {
              _.each(pattern_exceptions, function (patterns) {
                patterns.push(info.pattern);
              });
            } else {
              _.each(info.files, function (filepattern) {
                if (pattern_exceptions[filepattern]) {
                  pattern_exceptions[filepattern].push(info.pattern);
                }
                _.each(pattern_exceptions, function (patterns, filename) {
                  if (minimatch(filename, filepattern)) {
                    patterns.push(info.pattern);
                  }
                });
              });
            }
          };
          _.each(metadata_exceptions, function (exception) {
            _.map(exceptionToPatterns(exception, true), addException);
          });
          _.each(exceptions, function (info, exception) {
            _.map(exceptionToPatterns(exception, info), addException);
          });
          _.each(htmlfiles, function (file, filename) {
            if (file.spelling_exceptions) {
              _.each(file.spelling_exceptions, function (exception) {
                _.map(exceptionToPatterns(exception, [filename]), addException);
              });
            }
          });
          callback();
        },
        function (callback) {
          async.forEachOf(htmlfiles, function(file, filename, finished) {
            var $ = cheerio.load(file.contents);
            
            if (config.cacheChecks) {
              var file_hash = MD5($(config.checkedPart).html());
              var exception_hash = object_hash(pattern_exceptions[filename].sort());

              if (can_cache &&
                  (checked_files.files[filename] == file_hash) &&
                  (checked_files.exceptions[filename] == exception_hash)) {
                finished();
                return;
              }
            }
            var allwords = [];
            $(config.checkedPart).contents().filter(function (index, element) {
              return (element.type === 'text' &&
                  $(element).parents('.spelling_exception').length == 0 &&
                  $(element).parents('script').length == 0 &&
                  $(element).parents('code').length == 0 &&
                  element.data.trim().length > 0);
            }).each(function (index, element) {
              var cleaned = cleanText(element.data).join(" ");
              _.each(pattern_exceptions[filename], function(pattern) {
                cleaned = cleaned.replace(pattern, " ");
              });
              allwords = _.union(allwords, cleaned.split(/\s+/));
            });
            if (config.cacheChecks) {
              checked_files.files[filename] = file_hash;
              checked_files.exceptions[filename] = exception_hash;
            }
            filenamewords[filename] = allwords;
            finished();
          },
          function() {
            _.each(filenamewords, function (allwords) {
              uniqwords = _.union(uniqwords, allwords);
            });
            _.each(uniqwords, function (word) {
              wordstofilenames[word] = [];
            });
            _.each(filenamewords, function (allwords, filename) {
              _.each(allwords, function (word) {
                wordstofilenames[word].push(filename);
              });
            });
            callback();
          });
        },
        function (callback) {
          async.filter(uniqwords, function (word, innerCallback) {
            dict.isCorrect(word, function (err, correct) {
              innerCallback(!correct);
            });
          }, function (results) {
            if (config.cacheChecks) {
              jsonfile.writeFileSync(path.join(metalsmith.source(), config.checkFile), checked_files);
            }
            if (results.length == 0) {
              try {
                fs.unlinkSync(path.join(metalsmith.source(), config.failFile));
              } catch (err) {};
              realDone();
            } else {
              results = results.sort(function (a, b) {
                return a.toLowerCase().localeCompare(b.toLowerCase());
              });
              if (config.verbose) {
                console.log("There were spelling errors. See " + config.failFile);
              }
              var misspellings = {};
              _.each(results, function (word) {
                if (exceptions[word] && exceptions[word] !== true) {
                  var missedfiles =  _.difference(wordstofilenames[word], exceptions[word]);
                  if (missedfiles.length > 0) {
                    misspellings[word] = missedfiles;
                  }
                } else {
                  misspellings[word] = wordstofilenames[word];
                }
              });
              jsonfile.writeFileSync(path.join(metalsmith.source(), config.failFile), misspellings);
              if (config.failErrors) {
                realDone(new Error("fail spelling check. See " + config.failFile));
              } else {
                realDone();
              }
            }
          });
        }
    ]);
  }
}
exports = module.exports = spellcheck;
exports.defaults = defaults;
exports.processConfig = processConfig;
