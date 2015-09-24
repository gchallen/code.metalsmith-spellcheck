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
    spellcheckDefaults = require('./spellcheckDefaults.js');
jsonfile.spaces = 4;

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
    newPattern = startBoundary + newPattern + endBoundary;
    if (flags.indexOf("g") === -1) {
      flags += "g";
    } 
    return [{'word': pattern, 'files': files, 'pattern': new RegExp(newPattern, flags)}];
  } else {
    return _.map(cleanText(pattern), function (word) {
      newPattern = startBoundary + word + endBoundary;
      return {'word': word, 'files': files, 'pattern': new RegExp(newPattern, "g") }
    });
  }
}

module.exports = function(config) {

  return function(files, metalsmith, done) {

    config = spellcheckDefaults.processConfig(config);
    
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

    checked_files = { 'files': {}, 'exceptions': {}};
    if (config.cacheChecks) {
      try {
        checked_files = JSON.parse(files[config.checkFile].contents);
      } catch (err) {};
    }
    var can_cache = (checked_files.files[config.affFile] && 
                     checked_files.files[config.dicFile] &&
                     checked_files.files[config.affFile] == MD5(files[config.affFile].contents) &&
                     checked_files.files[config.dicFile] == MD5(files[config.dicFile].contents));
   
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

    async.series([
        function (callback) {
          function addException(info) {
            if (!(pattern_exceptions[info.word])) {
              pattern_exceptions[info.word] = info;
            } else {
              if (pattern_exceptions[info.word].files !== true) {
                if (info.files === true) {
                  pattern_exceptions[info.word].files = true;
                } else {
                  pattern_exceptions[info.word].files = 
                    _.union(info.files, pattern_exceptions[info.word].files);
                }
              }
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
            var allwords = [];
            $('*').contents().filter(function (index, element) {
              return (element.type === 'text' &&
                  $(element).parents('.spelling_exception').length == 0 &&
                  $(element).parents('script').length == 0 &&
                  $(element).parents('code').length == 0 &&
                  element.data.trim().length > 0);
            }).each(function (index, element) {
              var cleaned = cleanText(element.data).join(" ");
              _.each(pattern_exceptions, function(pattern) {
                if (pattern.files === true ||
                   (_.some(pattern.files, function (path_pattern) {
                     return minimatch(filename, path_pattern);
                   }))) {
                  cleaned = cleaned.replace(pattern.pattern, " ");
                }
              });
              allwords = _.union(allwords, cleaned.split(/\s+/));
            });
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
