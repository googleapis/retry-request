'use strict';

var assert = require('assert');
var async = require('async');
var range = require('lodash.range');
var { PassThrough } = require('stream');

var retryRequest = require('./index.js');

describe('retry-request', function () {
  var URI_404 = 'http://yahoo.com/theblahstore';
  var URI_200 = 'http://yahoo.com/';
  var URI_NON_EXISTENT = 'http://theblahstore';

  describe('streams', function () {
    it('works with defaults in a stream', function (done) {
      var responsesEmitted = 0;

      retryRequest(URI_404)
        .on('error', done)
        .on('response', function () {
          responsesEmitted++;
        })
        .on('complete', function () {
          assert.strictEqual(responsesEmitted, 1);
          done();
        });
    });

    it('allows object mode', function () {
      var retryStream = retryRequest(URI_404, { objectMode: true });
      assert.strictEqual(retryStream._readableState.objectMode, true);
    });

    it('emits an error', function (done) {
      retryRequest(URI_NON_EXISTENT)
        .on('error', function () {
          done();
        });
    });

    it('emits a `request` event on each request', function (done) {
      var requestsMade = 0;
      var requestsEmitted = 0;

      var opts = {
        shouldRetryFn: function() {
          return requestsMade < 3;
        },
        request: function () {
          var fakeRequestStream = new PassThrough();

          requestsMade++;

          setImmediate(function () {
            fakeRequestStream.emit('response', { statusCode: 200 });

            if (requestsMade === 3) {
              setImmediate(function () {
                fakeRequestStream.emit('complete');
              });
            }
          });

          return fakeRequestStream;
        }
      };

      retryRequest(URI_404, opts)
        .on('request', function() {
          requestsEmitted++;
        })
        .on('error', done)
        .on('complete', function () {
          assert.strictEqual(requestsEmitted, 3);
          done();
        });
    });

    it('exposes an `abort` function to match request', function (done) {
      var retryStream = retryRequest(URI_NON_EXISTENT);

      retryStream.on('error', function () {
        assert.equal(typeof retryStream.abort, 'function');
        done();
      });
    });

    it('works on the last attempt', function (done) {
      var numAborts = 0;
      var numAttempts = 0;

      var opts = {
        request: function () {
          numAttempts++;

          var fakeRequestStream = new PassThrough();
          fakeRequestStream.abort = function () {
            numAborts++;
          };

          var shouldReturnError = numAttempts < 3;
          var response = shouldReturnError ? { statusCode: 503 } : { statusCode: 200 };

          setImmediate(function () {
            fakeRequestStream.emit('response', response);

            if (shouldReturnError) {
              return;
            }

            setImmediate(function () {
              fakeRequestStream.emit('complete', numAttempts);
            });
          });

          return fakeRequestStream;
        }
      };

      retryRequest(URI_404, opts)
        .on('error', done)
        .on('complete', function (numAttempts) {
          assert.strictEqual(numAborts, 2);
          assert.deepEqual(numAttempts, 3);
          done();
        });
    });

    it('never succeeds', function (done) {
      var numAborts = 0;
      var numAttempts = 0;

      var opts = {
        request: function () {
          numAttempts++;

          var fakeRequestStream = new PassThrough();
          fakeRequestStream.abort = function () {
            numAborts++;
          };

          var response = { statusCode: 503 };
          setImmediate(function () {
            fakeRequestStream.emit('response', response);
          });

          return fakeRequestStream;
        }
      };

      retryRequest(URI_404, opts)
        .on('response', function () {
          assert.strictEqual(numAborts, 2);
          assert.strictEqual(numAttempts, 3);
          done();
        })
        .on('error', done);
    });

    it('forwards a request error', function (done) {
      var error = new Error('Error.');

      var opts = {
        request: function () {
          var fakeRequestStream = new PassThrough();

          setImmediate(function () {
            fakeRequestStream.emit('response', {
              statusCode: 200
            });

            setImmediate(function () {
              fakeRequestStream.destroy(error);
            });
          });

          return fakeRequestStream;
        }
      };

      retryRequest(URI_200, opts)
        .on('error', function(err) {
          assert.strictEqual(err, error);
          done();
        });
    });
  });

  describe('callbacks', function () {
    it('works with defaults with a callback', function (done) {
      retryRequest(URI_404, function () {
        done();
      });
    });

    it('exposes an `abort` function', function (done) {
      var opts = {
        request: function () {
          return {
            abort: done
          };
        }
      };

      var request = retryRequest(URI_200, opts, assert.ifError);
      request.abort();
    });

    it('returns an error', function (done) {
      retryRequest(URI_NON_EXISTENT, function (err) {
        assert.equal(typeof err, 'object');
        done();
      });
    });
  });

  describe('overriding', function () {
    it('should ignore undefined options', function (done) {
      var numAttempts = 0;
      var error = new Error('ENOTFOUND');

      var opts = {
        noResponseRetries: undefined,
        request: function (_, callback) {
          numAttempts++;
          callback(error);
        }
      };

      retryRequest(URI_NON_EXISTENT, opts, function (err) {
        assert.strictEqual(numAttempts, 3);
        assert.strictEqual(err, error);
        done();
      });
    });

    it('should allow overriding retries', function (done) {
      var opts = { retries: 0 };

      retryRequest(URI_404, opts, function () {
        done();
      });
    });

    it('should use default noResponseRetries', function (done) {
      var numAttempts = 0;
      var error = new Error('ENOTFOUND');

      var opts = {
        request: function (_, callback) {
          numAttempts++;
          callback(error);
        }
      };

      retryRequest(URI_NON_EXISTENT, opts, function (err) {
        assert.strictEqual(numAttempts, 3);
        assert.strictEqual(err, error);
        done();
      });
    });

    it('should allow overriding noResponseRetries', function (done) {
      var numAttempts = 0;
      var error = new Error('ENOTFOUND');

      var opts = {
        noResponseRetries: 0,
        request: function (_, callback) {
          numAttempts++;
          callback(error);
        }
      };

      retryRequest(URI_NON_EXISTENT, opts, function (err) {
        assert.strictEqual(numAttempts, 1);
        assert.strictEqual(err, error);
        done();
      });
    });

    it('should allow overriding currentRetryAttempt', function (done) {
      var numAttempts = 0;
      var opts = {
        currentRetryAttempt: 1,
        request: function (_, responseHandler) {
          numAttempts++;
          responseHandler(null, { statusCode: 500 });
        }
      };

      retryRequest(URI_404, opts, function (err) {
        assert.strictEqual(numAttempts, 1);
        done();
      });
    });

    it('should allow overriding shouldRetryFn', function (done) {
      var shouldRetryFnCalled = false;

      var opts = {
        retries: 1, // so that our retry function is only called once

        shouldRetryFn: function () {
          shouldRetryFnCalled = true;
          return true;
        }
      };

      retryRequest(URI_404, opts, function () {
        assert.strictEqual(shouldRetryFnCalled, true);
        done();
      });
    });

    it('should allow overriding request', function (done) {
      var opts = {
        request: function () {
          done();
        }
      };

      retryRequest(URI_200, opts, function () {});
    });
  });

  describe('shouldRetryFn', function () {
    var URI = 'http://';

    function assertRetried(statusCode, callback) {
      var initialRequestMade = false;

      retryRequest(URI, {
        request: function (_, responseHandler) {
          if (initialRequestMade) {
            // This is a retry attempt. "Test passed"
            callback();
            return;
          }

          initialRequestMade = true;
          responseHandler(null, { statusCode: statusCode });
        }
      }, assert.ifError);
    }

    function assertNotRetried(statusCode, callback) {
      var initialRequestMade = false;
      var requestWasRetried = false;

      retryRequest(URI, {
        request: function (_, responseHandler) {
          requestWasRetried = initialRequestMade;
          initialRequestMade = true;
          responseHandler(null, { statusCode: statusCode });
        }
      }, function (err) {
        if (err) {
          callback(err);
          return;
        }

        if (requestWasRetried) {
          callback(new Error('Request was retried'));
          return;
        }

        callback();
      });
    }

    it('should retry a 1xx code', function (done) {
      async.each(range(100, 199), assertRetried, done);
    });

    it('should not retry a 2xx code', function (done) {
      async.each(range(200, 299), assertNotRetried, done);
    });

    it('should not retry a 3xx code', function (done) {
      async.each(range(300, 399), assertNotRetried, done);
    });

    it('should not retry a 4xx code', function (done) {
      var statusCodes = range(400, 428).concat(range(430, 499));

      async.each(statusCodes, assertNotRetried, done);
    });

    it('should retry a 429 code', function (done) {
      assertRetried(429, done);
    });

    it('should retry a 5xx code', function (done) {
      async.each(range(500, 599), assertRetried, done);
    });
  });

  it('should not do any retries if unnecessary', function (done) {
    var shouldRetryFnTimesCalled = 0;

    var opts = {
      shouldRetryFn: function () {
        shouldRetryFnTimesCalled++;
        return false;
      }
    };

    retryRequest(URI_200, opts, function () {
      assert.strictEqual(shouldRetryFnTimesCalled, 1);
      done();
    });
  });

  it('has an initial delay when currentRetryAttempt > 0', function (done) {
    var startTime = new Date();

    var opts = {
      currentRetryAttempt: 1,
      request: function (_, responseHandler) {
        responseHandler(null, { statusCode: 200 });
      }
    };

    retryRequest(URI_200, opts, function () {
      var totalTime = new Date() - startTime;
      assert(totalTime >= 2000 && totalTime < 3000);
      done();
    });
  });
});

describe('getNextRetryDelay', function () {
  var maxRetryDelay = 64;
  var retryDelayMultiplier = 2;
  var timeOfFirstRequest;
  var totalTimeout = 64;

  function secondsToMs(seconds) {
    return seconds * 1000;
  }

  beforeEach(() => {
    timeOfFirstRequest = Date.now();
  });

  it('should return exponential retry delay', function () {
    [1, 2, 3, 4, 5].forEach(assertTime);

    function assertTime(retryNumber) {
      var min = (Math.pow(2, retryNumber) * secondsToMs(1));
      var max = (Math.pow(2, retryNumber) * secondsToMs(1)) + secondsToMs(1);

      var delay = retryRequest.getNextRetryDelay({
        maxRetryDelay,
        retryDelayMultiplier,
        retryNumber,
        timeOfFirstRequest,
        totalTimeout,
      });

      assert(delay >= min && delay <= max);
    }
  });

  it('should allow overriding the multiplier', function () {
    [1, 2, 3, 4, 5].forEach(assertTime);

    function assertTime(multiplier) {
      var min = (Math.pow(multiplier, 1) * secondsToMs(1));
      var max = (Math.pow(multiplier, 1) * secondsToMs(1)) + secondsToMs(1);

      var delay = retryRequest.getNextRetryDelay({
        maxRetryDelay,
        retryDelayMultiplier: multiplier,
        retryNumber: 1,
        timeOfFirstRequest,
        totalTimeout,
      });

      assert(delay >= min && delay <= max);
    }
  });

  it('should honor total timeout setting', function () {
    // This test passes settings to calculate an enormous retry delay, if it
    // weren't for the timeout restrictions imposed by `totalTimeout`.
    // So, even though this is pretending to be the 10th retry, and our
    // `maxRetryDelay` is huge, the 60 second max timeout we have for all
    // requests to complete by is honored.
    // We tell the function that we have already been trying this request for
    // 30 seconds, and we will only wait a maximum of 60 seconds. Therefore, we
    // should end up with a retry delay of around 30 seconds.
    var retryDelay = retryRequest.getNextRetryDelay({
      // Allow 60 seconds maximum delay, 
      timeOfFirstRequest: Date.now() - secondsToMs(30), // 30 seconds ago.
      totalTimeout: 60,

      // Inflating these numbers to be sure the smaller timeout is chosen:
      maxRetryDelay: 1e9,
      retryDelayMultiplier: 10,
      retryNumber: 10,
    });

    var min = retryDelay - 10;
    var max = retryDelay + 10;
    assert(retryDelay >= min && retryDelay <= max);
  });

  it('should return maxRetryDelay if calculated retry would be too high', function () {
    var delayWithoutLowMaxRetryDelay = retryRequest.getNextRetryDelay({
      maxRetryDelay,
      retryDelayMultiplier,
      retryNumber: 100,
      timeOfFirstRequest,
      totalTimeout,
    });

    var maxRetryDelayMs = secondsToMs(maxRetryDelay);
    var min = maxRetryDelayMs - 10;
    var max = maxRetryDelayMs + 10;
    assert(delayWithoutLowMaxRetryDelay >= min && delayWithoutLowMaxRetryDelay <= max);

    var lowMaxRetryDelay = 1;
    var delayWithLowMaxRetryDelay = retryRequest.getNextRetryDelay({
      maxRetryDelay: lowMaxRetryDelay,
      retryDelayMultiplier,
      retryNumber: 100,
      timeOfFirstRequest,
      totalTimeout,
    });
    assert.strictEqual(delayWithLowMaxRetryDelay, secondsToMs(lowMaxRetryDelay));
  });
});
