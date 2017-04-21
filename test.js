'use strict';

var assert = require('assert');
var retryRequest = require('./index.js');
var through = require('through2');

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

    it('exposes an `abort` fuction to match request', function (done) {
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

          var fakeRequestStream = through();
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

          var fakeRequestStream = through();
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
    it('should allow overriding retries', function (done) {
      var opts = { retries: 0 };

      retryRequest(URI_404, opts, function () {
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

    it('should allow overriding retryOnError', function(done) {
      var error = new Error('Oh noes!');
      var requestCount = 0;
      var opts = {
        retryOnError: true,
        request: function(reqOpts, callback) {
          requestCount++;
          callback(error);
        },
        shouldRetryFn: function (_error) {
          return error === _error;
        }
      };

      retryRequest(URI_200, opts, function () {
        assert.strictEqual(requestCount, 3);
        done();
      });
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
});

describe('getNextRetryDelay', function () {
  function secs(seconds) {
    return seconds * 1000;
  }

  it('should return exponential retry delay', function () {
    [1, 2, 3, 4, 5].forEach(assertTime);

    function assertTime(retryNumber) {
      var min = (Math.pow(2, retryNumber) * secs(1));
      var max = (Math.pow(2, retryNumber) * secs(1)) + secs(1);

      var time = retryRequest.getNextRetryDelay(retryNumber);

      assert(time >= min && time <= max);
    }
  });
});

