var path = require('path'),
    _ = require('underscore');

var defaults = {
  'verbose': true,
  'failErrors': true,
  'exceptionFile': 'spelling_exceptions.json',
  'failFile': 'spelling_failed.json',
  'exceptionPhrases': [],
  'exceptionPatterns': []
}

function processConfig(config, src) {
  config = config || {};
  config = _.extend(_.clone(defaults), config);
  if (src) {
    config.exceptionFile = path.join(src, config.exceptionFile);
    config.failFile = path.join(src, config.failFile);
  }
  return config;
}

module.exports = {
  "defaults": defaults,
  "processConfig": processConfig
};
