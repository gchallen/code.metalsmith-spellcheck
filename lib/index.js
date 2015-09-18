var debug = require('debug')('metalsmith-spellcheck'),
    path = require('path'),
    fs = require('fs'),
    async = require('async'),
    _ = require('underscore'),
    validator = require('validator');

var spellcheck = function(config) {

  return function(files, metalsmith, done) {
    var nodehun = require('nodehun');
    var metadata = metalsmith.metadata();

    var dict;
    var exceptions;
    var filenamewords = {};
    var wordstofilenames = {};
    var uniqwords = [];

    var cleanText = function (text) {
      var words = text.trim()
        .replace(/[\u2018\u2019]/g, "'")
        .replace(/\.\.\./g, ".")
        .replace(/[^a-zA-Z0-9'\.@]+/g, " ").trim().split(/\s+/);
      words = _.map(words, function (word) {
        if ((word.match(/\./g) || []).length == 1 && /^.*\.$/.test(word)) {
          return word.substring(0, word.length - 1);
        } else if ( /^.*:$/.test(word) || /^.*s'/.test(word)) {
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

    var addText = function (text, dict) {
      _.each(cleanText(text), function (word) {
        dict.addWord(word);
      });
    };
    
    async.series([
        function (callback) {
          var aff;
          var dic;
          async.parallel([
              function (innerCallback) {
                aff = fs.readFileSync(path.join(__dirname, 'dicts/en_US.aff'));
                innerCallback();
              },
              function (innerCallback) {
                dic = fs.readFileSync(path.join(__dirname, 'dicts/en_US.dic'));
                innerCallback();
              },
              function (innerCallback) {
                exceptions = jsonfile.readFileSync(path.join(__dirname, 'dicts/exceptions.json'));
                innerCallback();
              }
            ],
            function () {
              dict = new nodehun(aff, dic);
              callback();
            });
        },
        function (callback) {
          async.map(metadata.people, function (person, finished) {
            addText(person.name, dict);
            if (person.institution) {
              addText(person.institution, dict);
            }
            finished();
          },
          function () {
            callback();
          });
        },
        function (callback) {
          async.map(metadata.projects, function (project, finished) {
            addText(project.title, dict);
            addText(project.name, dict);
            finished();
          },
          function () {
            callback();
          });
        },
        function (callback) {
          async.map(metadata.papers, function (paper, finished) {
            addText(paper.name, dict);
            finished();
          },
          function () {
            callback();
          });
        },
        function (callback) {
          async.map(metadata.conferences, function (conference, finished) {
            addText(conference.name, dict);
            _.each(conference, function (year) {
              if (year.shortname) {
                dict.addWord(year.shortname);
                var array = year.shortname.split("'");
                if (array[1]) {
                  dict.addWord(array[0]);
                }
                var array = year.shortname.split("-");
                if (array[1]) {
                  dict.addWord(array[0]);
                }
              }
            });
            finished();
          },
          function () {
            callback();
          });
        },
        function (callback) {
          var filenames = _.keys(htmlfiles(files));

          async.mapLimit(filenames, 8, function(filename, finished) {
            var $ = cheerio.load(files[filename].contents);
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
          callback();
        },
        function (callback) {
          async.filterLimit(uniqwords, 8, function (word, innerCallback) {
            if (exceptions.hasOwnProperty(word)) {
              if (exceptions[word] === true) {
                innerCallback(false);
                return;
              } else if (_.difference(wordstofilenames[word], exceptions[word]).length == 0) {
                innerCallback(false);
                return;
              }
            }
            dict.isCorrect(word, function (err, correct) {
              innerCallback(!correct);
            });
          }, function (results) {
            if (results.length > 0) {
              results = results.sort(function (a, b) {
                return a.toLowerCase().localeCompare(b.toLowerCase());
              });
              var misspellings = {};
              _.each(results, function (word) {
                misspellings[word] = _.difference(wordstofilenames[word], exceptions[word]);
              });
              console.log("There were spelling errors. See spelling_errors.json.");
              jsonfile.writeFileSync(path.join(__dirname, 'spelling_errors.json'), misspellings);
            } else {
              try {
                fs.unlinkSync(path.join(__dirname, 'spelling_errors.json'));
              } catch (err) {};
            }
            callback();
          });
        }
    ],
    function (err) {
      done(err);
    });
  }
};
