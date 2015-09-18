var path = require('path'),
    _ = require('underscore');

var defaults = {
  'verbose': true,
  'failErrors': false,
  'cacheChecks': true,
  'dictionaryDir': 'dicts',
  'exceptionFile': 'dicts/spelling_exceptions.json',
  'checkFile': '.spelling_checked.json',
  'failFile': 'spelling_failed.json'
}

function processConfig(config, src) {
  config = config || {};
  config = _.extend(_.clone(defaults), config);
  if (src) {
    config.dictionaryDir = path.join(src, config.dictionaryDir);
    config.exceptionFile = path.join(src, config.exceptionFile);
    config.checkFile = path.join(src, config.checkFile);
    config.failFile = path.join(src, config.failFile);
  }
  return config;
}

module.exports = {
  "defaults": defaults,
  "processConfig": processConfig
};
