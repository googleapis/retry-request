'use strict';

var request = require('request');
var StreamCache = require('stream-cache');
var streamForward = require('stream-forward');
var through = require('through2');

var DEFAULTS = {
  request: request,
  retries: 2,
  shouldRetryFn: function (response) {
    // Not a successful status or redirect.
    return response.statusCode < 200 || response.statusCode >= 400;
  },
};

module.exports = function (requestOpts, opts, callback) {
  var streamMode = typeof arguments[arguments.length - 1] !== 'function';

  if (typeof opts === 'function') {
    callback = opts;
  }

  opts = opts || DEFAULTS;

  if (typeof opts.request === 'undefined') {
    opts.request = DEFAULTS.request;
  }
  if (typeof opts.retries !== 'number') {
    opts.retries = DEFAULTS.retries;
  }
  if (typeof opts.shouldRetryFn !== 'function') {
    opts.shouldRetryFn = DEFAULTS.shouldRetryFn;
  }

  var retryStream = through();
  var requestStream;
  var cacheStream;
  var cachedEvents = {};

  var attempts = 0;

  function resetStreams() {
    cachedEvents = {};
    cacheStream = null;
    requestStream.abort();
    requestStream.destroy();
  }

  function attempt() {
    attempts++;

    if (streamMode) {
      cacheStream = new StreamCache();
      requestStream = opts.request(requestOpts);

      streamForward(requestStream, ['complete'])
        .on('error', onResponse)
        .on('response', onResponse.bind(null, null))
        .pipe(cacheStream);
    } else {
      opts.request(requestOpts, onResponse);
    }
  }

  function onResponse(err, response, body) {
    // An error such as DNS resolution.
    if (err) {
      if (streamMode) {
        retryStream.emit('error', err);
        retryStream.end();
      } else {
        callback(err, response, body);
      }

      return;
    }

    // Send the response to see if we should try again.
    if (attempts <= opts.retries && opts.shouldRetryFn(response)) {
      if (streamMode) {
        resetStreams();
      }

      attempt();

      return;
    }

    // No more attempts need to be made, just continue on.
    if (streamMode) {
      retryStream.emit('response', response);

      streamForward(cacheStream, ['error', 'complete'])
        .on('error', resetStreams)
        .pipe(retryStream);
    } else {
      callback(err, response, body);
    }
  }

  attempt();
  return retryStream;
};
