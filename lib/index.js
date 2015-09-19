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
  if (files[config.checkFile]) {
    delete(files[config.checkFile]);
  }
  if (files[config.failFile]) {
    delete(files[config.failFile]);
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

function addText(text, dict) {
  _.each(cleanText(text), function (word) {
    dict.addWord(word);
  });
};

module.exports = function(config) {

  return function(files, metalsmith, done) {
    config = spellcheckDefaults.processConfig(config);

    if (!(config.dicFile) || !(config.affFile)) {
      removeFiles(files, config);
      done(new Error("must provide dicFile and affFile options to metalsmith-spellcheck"));
      return;
    }

    var dict, exceptions = {};
    try {
      dict = new nodehun(files[config.affFile].contents, files[config.dicFile].contents);
      if (config.exceptionFile && files[config.exceptionFile]) {
        exceptions = JSON.parse(files[config.exceptionFile].contents);
      }
      delete(files[config.affFile]);
      delete(files[config.dicFile]);
    } catch (err) {
      removeFiles(files, config);
      done(err);
      return;
    }
    
    var metadata = metalsmith.metadata();
    
    var htmlfiles = _.pick(files, function(file, filename) {
      return (path.extname(filename) === '.html');
    });
    
    var filenamewords = {}, wordstofilenames = {}, uniqwords = [];
    var pattern_exceptions = {};

    async.series([
        function (callback) {
          async.forEachOfLimit(htmlfiles, 8, function(file, filename, finished) {
            var $ = cheerio.load(file.contents);
            var allwords = [];
            $('body *').contents().filter(function (index, element) {
              return (element.type === 'text' &&
                  $(element).parents('script').length == 0 &&
                  $(element).parents('code').length == 0 &&
                  element.data.trim().length > 0);
            }).each(function (index, element) {
              allwords = _.union(allwords, _.toArray(cleanText(element.data)));
            });
            filenamewords[filename] = allwords;
            finished();
          },
          function() {
            callback();
          });
        },
        function (callback) {
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
          _.each(_.keys(exceptions), function (word) {
            var regParts = word.match(/^\/(.*?)\/([gim]*)$/);
            if (regParts) {
              var regex = new RegExp(regParts[1], regParts[2]);
            } else {
              var regex = new RegExp("^" + word + "$");
            }
            pattern_exceptions[word] = {
              'files': exceptions[word],
              'pattern': regex
            };
          });
          callback();
        },
        function (callback) {
          async.filterLimit(uniqwords, 8, function (word, innerCallback) {
            innerCallback(!(_.some(pattern_exceptions, function (item) {
              return (item.pattern.exec(word) != null &&
                      (item.files === true ||
                       (items.length == wordstofilenames[word].length &&
                        _.intersection(items, wordstofilenames[word]).length == items.length)));
            })));
          }, function (results) {
            uniqwords = results;
            callback();
          });
        },
        function (callback) {
          async.filterLimit(uniqwords, 8, function (word, innerCallback) {
            dict.isCorrect(word, function (err, correct) {
              innerCallback(!correct);
            });
          }, function (results) {
            if (results.length == 0) {
              try {
                fs.unlinkSync(path.join(metalsmith.source(), config.failfile));
              } catch (err) {};
              removeFiles(files, config);
              done();
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
                removeFiles(files, config);
                done(new Error("fail spelling check. See " + config.failFile));
              } else {
                removeFiles(files, config);
                done();
              }
            }
          });
        }
    ]);
  }
}
