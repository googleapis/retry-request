'use strict';

var request = require('request');
var through = require('through2');

var DEFAULTS = {
  objectMode: false,
  request: request,
  retries: 2,
  shouldRetryFn: function (response) {
    // Not a successful status or redirect.
    return response.statusCode < 200 || response.statusCode >= 400;
  }
};

function retryRequest(requestOpts, opts, callback) {
  var streamMode = typeof arguments[arguments.length - 1] !== 'function';

  if (typeof opts === 'function') {
    callback = opts;
  }

  opts = opts || DEFAULTS;

  if (typeof opts.objectMode === 'undefined') {
    opts.objectMode = DEFAULTS.objectMode;
  }
  if (typeof opts.request === 'undefined') {
    opts.request = DEFAULTS.request;
  }
  if (typeof opts.retries !== 'number') {
    opts.retries = DEFAULTS.retries;
  }
  if (typeof opts.shouldRetryFn !== 'function') {
    opts.shouldRetryFn = DEFAULTS.shouldRetryFn;
  }

  var MAX_NO_RESPONSE_RETRIES = 2;

  var numAttempts = 0;
  var numNoResponseAttempts = 0;

  var retryStream;
  var requestStream;
  var delayStream;

  var activeRequest;
  var retryRequest = {
    abort: function () {
      if (activeRequest && activeRequest.abort) {
        activeRequest.abort();
      }
    }
  };

  if (streamMode) {
    retryStream = through({ objectMode: opts.objectMode });
    retryStream.abort = resetStreams;
  }

  makeRequest();

  if (streamMode) {
    return retryStream;
  } else {
    return retryRequest;
  }

  function resetStreams() {
    delayStream = null;

    if (requestStream) {
      requestStream.abort && requestStream.abort();
      requestStream.cancel && requestStream.cancel();

      if (requestStream.destroy) {
        requestStream.destroy();
      } else if (requestStream.end) {
        requestStream.end();
      }
    }
  }

  function makeRequest() {
    numAttempts++;

    if (streamMode) {
      delayStream = through({ objectMode: opts.objectMode });
      requestStream = opts.request(requestOpts);

      requestStream
        .on('error', onResponse)
        .once('response', onResponse.bind(null, null))
        .once('complete', retryStream.emit.bind(retryStream, 'complete'))
        .pipe(delayStream);
    } else {
      activeRequest = opts.request(requestOpts, onResponse);
    }
  }

  function retryAfterDelay(numAttempts) {
    if (streamMode) {
      resetStreams();
    }

    setTimeout(makeRequest, getNextRetryDelay(numAttempts));
  }

  function onResponse(err, response, body) {
    // An error such as DNS resolution.
    if (err) {
      numNoResponseAttempts++;

      if (numNoResponseAttempts <= MAX_NO_RESPONSE_RETRIES) {
        retryAfterDelay(numNoResponseAttempts);
      } else {
        if (streamMode) {
          retryStream.emit('error', err);
          retryStream.end();
        } else {
          callback(err, response, body);
        }
      }

      return;
    }

    // Send the response to see if we should try again.
    if (numAttempts <= opts.retries && opts.shouldRetryFn(response)) {
      retryAfterDelay(numAttempts);
      return;
    }

    // No more attempts need to be made, just continue on.
    if (streamMode) {
      retryStream.emit('response', response);
      delayStream.pipe(retryStream);
    } else {
      callback(err, response, body);
    }
  }
}

module.exports = retryRequest;

function getNextRetryDelay(retryNumber) {
  return (Math.pow(2, retryNumber) * 1000) + Math.floor(Math.random() * 1000);
}

module.exports.getNextRetryDelay = getNextRetryDelay;
