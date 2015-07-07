'use strict';

var assert = require('assert');
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

    it('emits an error', function (done) {
      retryRequest(URI_NON_EXISTENT)
        .on('error', function () {
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
        retries: 1, // so that our retry function is only called once and

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
