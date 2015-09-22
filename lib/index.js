var debug = require('debug')('metalsmith-spellcheck'),
    path = require('path'),
    fs = require('fs'),
    async = require('async'),
    _ = require('underscore'),
    nodehun = require('nodehun'),
    validator = require('validator'),
    cheerio = require('cheerio'),
    jsonfile = require('jsonfile'),
    spellcheckDefaults = require('./spellcheckDefaults.js');
jsonfile.spaces = 4;

function removeFiles(files, config) {
  if (files[config.failFile]) {
    delete(files[config.failFile]);
  }
  if (files[config.exceptionFile]) {
    delete(files[config.exceptionFile]);
  }
  if (files[config.addFile]) {
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
    if ((word.match(/\./g) || []).length == 1 && /^.*\.$/.test(word)) {
      return word.substring(0, word.length - 1);
    } else if ( /^.*:$/.test(word) || /^.*'$/.test(word)) {
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
  return words;
};

function wordToRegex(word) {
  var regParts = word.match(/^\/(.*?)\/([gim]*)$/);
  if (regParts) {
    var pattern = regParts[1];
    var flags = regParts[2];
    if (pattern.lastIndexOf("\\b", 0) === -1) {
      pattern = "\\b" + pattern;
    }
    if (pattern.indexOf("\\b", (pattern.length - 2)) === -1) {
      pattern = pattern + "\\b";
    }
    if (flags.indexOf("g") === -1) {
      flags += "g";
    } 
    return new RegExp(pattern, flags);
  } else {
    return new RegExp("\\b" + word + "\\b", "g");
  }
};

function addText(text, dict) {
  _.each(cleanText(text), function (word) {
    dict.addWord(word);
  });
};

module.exports = function(config) {

  return function(files, metalsmith, done) {
    config = spellcheckDefaults.processConfig(config);
    
    var realDone = function(err) {
      removeFiles(files, config);
      done(err)
    };

    if (!(config.dicFile) || !(config.affFile)) {
      realDone(new Error("must provide dicFile and affFile options to metalsmith-spellcheck"));
      return;
    }
    
    var dict, exceptions = {};
    try {
      dict = new nodehun(files[config.affFile].contents, files[config.dicFile].contents);
      if (config.exceptionFile && files[config.exceptionFile]) {
        exceptions = JSON.parse(files[config.exceptionFile].contents);
      }
    } catch (err) {
      realDone(err);
      return;
    }
    
    var metadata = metalsmith.metadata();
    var metadata_exception_phrases = [];
    try {
      metadata_exception_phrases = metadata['spellcheck']['phrases'];
    } catch (err) {};
    metadata_exception_phrases = _.union(config.exceptionPhrases, metadata_exception_phrases);
    var metadata_exception_patterns = [];
    try {
      metadata_exception_patterns = metadata['spellcheck']['patterns'];
    } catch (err) {};
    metadata_exception_patterns = _.union(config.exceptionPatterns, metadata_exception_patterns);
    
    var htmlfiles = _.pick(files, function(file, filename) {
      return (path.extname(filename) === '.html');
    });
    
    var filenamewords = {}, wordstofilenames = {}, uniqwords = [];
    var pattern_exceptions = {};

    async.series([
        function (callback) {
          function addException(word, info) {
            if (!(pattern_exceptions[word])) {
              pattern_exceptions[word] = info;
            } else {
              if (info.files === true) {
                pattern_exceptions[word].files = true;
              } else {
                pattern_exceptions[word].files = 
                  _.union(info.files, pattern_exception[word].files);
              }
            }
          };
          _.each(metadata_exception_phrases, function (phrase) {
            _.each(cleanText(phrase), function (word) {
              addException(word, { 'files': true, 'pattern': wordToRegex(word) });
            });
          });
          _.each(metadata_exception_patterns, function (pattern) {
            addException(pattern, { 'files': true, 'pattern': wordToRegex(pattern) });
          });
          _.each(_.keys(exceptions), function (word) {
            addException(word, { 'files': exceptions[word], 'pattern': wordToRegex(word) });
          });
          _.each(files, function (file, filename) {
            if (file.spelling_exceptions) {
              _.each(file.spelling_exceptions, function (word) {
                addException(word, { 'files': [filename], 'pattern': wordToRegex(word) });
              });
            }
          });
          callback();
        },
        function (callback) {
          async.forEachOf(htmlfiles, function(file, filename, finished) {
            var $ = cheerio.load(file.contents);
            var allwords = [];
            $('body *').contents().filter(function (index, element) {
              return (element.type === 'text' &&
                  $(element).parents('.spelling_ignore').length == 0 &&
                  $(element).parents('script').length == 0 &&
                  $(element).parents('code').length == 0 &&
                  element.data.trim().length > 0);
            }).each(function (index, element) {
              var cleaned = element.data;
              var origin = element.data;
              _.each(pattern_exceptions, function(pattern) {
                if (pattern.files === true || (filename in pattern.files)) {
                  cleaned = cleaned.replace(pattern.pattern, "");
                }
              });
              allwords = _.union(allwords, _.toArray(cleanText(cleaned)));
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
            innerCallback(!(_.some(pattern_exceptions, function (item) {
              if (item.pattern.exec(word) != null) {
                if (item.files === true) {
                  return true;
                } else {
                  var item_files = item.files;
                  var word_files = wordstofilenames[word];
                  return (item_files.length == word_files.length &&
                        _.intersection(item_files, word_files).length == item_files.length);
                }
              } else {
                return false;
              }
            })));
          }, function (results) {
            uniqwords = results;
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
                fs.unlinkSync(path.join(metalsmith.source(), config.failfile));
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
                misspellings[word] = _.difference(wordstofilenames[word], exceptions[word]);
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
