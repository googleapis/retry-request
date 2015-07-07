# retry-request

> Retry a [request][request].

## Use

```sh
$ npm install --save retry-request
```
```js
var retryRequest = require('retry-request');
```

It should work the same as `request` in both callback mode and stream mode.

#### Callback

`urlThatReturns404` will be requested 3 total times before giving up and executing the callback.

```js
retryRequest(urlThatReturns404, function (err, resp, body) {});
```

#### Stream

`urlThatReturns404` will be requested 3 total times before giving up and emitting the `response` and `complete` event as usual.

```js
retryRequest(urlThatReturns404)
  .on('error', function () {})
  .on('response', function () {})
  .on('complete', function () {});
```

## retryRequest(requestOptions, [opts], [cb])

### requestOptions

Passed directly to `request`. See the list of options supported: https://github.com/request/request/#requestoptions-callback.

### opts *(optional)*

#### `opts.retries`

Type: `Number`

Default: `2`

```js
var opts = {
  retries: 4
};

retryRequest(urlThatReturns404, opts, function (err, resp, body) {
  // urlThatReturns404 was requested a total of 5 times
  // before giving up and executing this callback.
});
```

#### `opts.shouldRetryFn`

Type: `Function`

Default: Returns `true` if [http.incomingMessage](https://nodejs.org/api/http.html#http_http_incomingmessage).statusCode is < 200 or >= 400.

```js
var opts = {
  shouldRetryFn: function (incomingHttpMessage) {
    return incomingHttpMessage.statusMessage !== 'OK';
  }
};

retryRequest(urlThatReturnsNonOKStatusMessage, opts, function (err, resp, body) {
  // urlThatReturnsNonOKStatusMessage was requested a
  // total of 3 times, each time using `opts.shouldRetryFn`
  // to decide if it should continue before giving up and
  // executing this callback.
});
```

#### `opts.request`

Type: `Function`

Default: [`request`][request]

```js
var request = require('request').defaults({
  pool: {
    maxSockets: Infinity
  }
});

var opts = {
  request: request
};

retryRequest(urlThatReturns404, function (err, resp, body) {
  // Your provided `request` instance was used.
});
```

### cb *(optional)*

Passed directly to `request`. See the callback section: https://github.com/request/request/#requestoptions-callback.

[request]: https://github.com/request/request
