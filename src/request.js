import { checkParamOrThrow } from 'apify-client/build/utils';
import { normalizeUrl } from 'apify-shared/utilities';
import _ from 'underscore';

export const computeUniqueKey = (url, keepUrlFragment) => normalizeUrl(url, keepUrlFragment);

/**
 * Represents a URL to be crawled, optionally including HTTP method, headers, payload and other metadata.
 * The `Request` object also stores information about errors that occurred during processing of the request.
 *
 * Each `Request` instance has the `uniqueKey` property, which can be either specified
 * manually in the constructor or generated automatically from the URL. Two requests with the same `uniqueKey`
 * are considered as pointing to the same web resource. This behavior applies to all Apify SDK classes,
 * such as {@link RequestList}, {@link RequestQueue} or {@link PuppeteerCrawler}.
 *
 * Example use:
 *
 * ```javascript
 * const request = new Apify.Request({
 *     url: 'http://www.example.com',
 *     headers: { Accept: 'application/json' },
 * });
 *
 * ...
 *
 * request.userData.foo = 'bar';
 * request.pushErrorMessage(new Error('Request failed!'));
 *
 * ...
 *
 * const foo = request.userData.foo;
 * ```
 * @param {object} options All `Request` parameters are passed
 *   via an options object with the following keys:
 * @param {String} options.url URL of the web page to crawl.
 * @param {String} [options.uniqueKey] A unique key identifying the request.
 * Two requests with the same `uniqueKey` are considered as pointing to the same URL.
 *
 * If `uniqueKey` is not provided, then it is automatically generated by normalizing the URL.
 * For example, the URL of `HTTP://www.EXAMPLE.com/something/` will produce the `uniqueKey`
 * of `http://www.example.com/something`.
 *
 * The `keepUrlFragment` option determines whether URL hash fragment is included in the `uniqueKey` or not.
 * Beware that the HTTP method and payload are not included in the `uniqueKey`,
 * so requests to the same URL but with different HTTP methods or different POST payloads
 * are all considered equal and will be deduplicated by {@link RequestList} and {@link RequestQueue}.
 *
 * Pass an arbitrary non-empty text value to the `uniqueKey` property
 * to override the default behavior and specify which URLs shall be considered equal.
 * @param {String} [options.method='GET']
 * @param {String|Buffer} [options.payload]
 *   HTTP request payload, e.g. for POST requests.
 * @param {Object} [options.headers={}]
 *   HTTP headers in the following format:
 *   ```
 *   {
 *       Accept: 'text/html',
 *       'Content-Type': 'application/json'
 *   }
 *   ```
 * @param {Object} [options.userData={}]
 *   Custom user data assigned to the request. Use this to save any request related data to the
 *   request's scope, keeping them accessible on retries, failures etc.
 * @param {Boolean} [options.keepUrlFragment=false]
 *   If `false` then the hash part of a URL is removed when computing the `uniqueKey` property.
 *   For example, this causes the `http://www.example.com#foo` and `http://www.example.com#bar` URLs
 *   to have the same `uniqueKey` of `http://www.example.com` and thus the URLs are considered equal.
 *   Note that this option only has an effect if `uniqueKey` is not set.
 * @param {String} [options.ignoreErrors=false]
 *   If `true` then errors in processing of this request will be ignored.
 *   For example, the request won't be retried in a case of an error.
 *
 * @property {String} id
 *   Request ID
 * @property {String} url
 *   URL of the web page to crawl.
 * @property {String} uniqueKey
 *   A unique key identifying the request.
 *   Two requests with the same `uniqueKey` are considered as pointing to the same URL.
 * @property {String} method
 *   HTTP method, e.g. `GET` or `POST`.
 * @property {String} payload
 *   HTTP request payload, e.g. for POST requests.
 * @property {Number} retryCount
 *   Indicates the number of times the crawling of the request has been retried on error.
 * @property {String[]} errorMessages
 *   An array of error messages from request processing.
 * @property {Object} headers
 *   Object with HTTP headers. Key is header name, value is the value.
 * @property {Object} userData
 *   Custom user data assigned to the request.
 * @property {Boolean} ignoreErrors
 *   If `true` then errors in processing of this request are ignored.
 *   For example, the request won't be retried in a case of an error.
 * @property {Date} handledAt
 *   Indicates the time when the request has been processed.
 *   Is `null` if the request has not been crawled yet.
 */
class Request {
    constructor(options = {}) {
        checkParamOrThrow(options, 'options', 'Object');

        const {
            id,
            url,
            uniqueKey,
            method = 'GET',
            payload = null,
            retryCount = 0,
            errorMessages = null,
            headers = {},
            userData = {},
            keepUrlFragment = false,
            ignoreErrors = false,
            handledAt = null,
        } = options;


        checkParamOrThrow(id, 'id', 'Maybe String');
        checkParamOrThrow(url, 'url', 'String');
        checkParamOrThrow(uniqueKey, 'uniqueKey', 'Maybe String');
        checkParamOrThrow(method, 'method', 'String');
        checkParamOrThrow(payload, 'payload', 'Maybe Buffer | String');
        checkParamOrThrow(retryCount, 'retryCount', 'Number');
        checkParamOrThrow(errorMessages, 'errorMessages', 'Maybe Array');
        checkParamOrThrow(headers, 'headers', 'Object');
        checkParamOrThrow(userData, 'userData', 'Object');
        checkParamOrThrow(ignoreErrors, 'ignoreErrors', 'Boolean');
        checkParamOrThrow(handledAt, 'handledAt', 'Maybe String | Date');

        if (method === 'GET' && payload) throw new Error('Request with GET method cannot have a payload.');

        this.id = id;
        this.url = url;
        this.uniqueKey = uniqueKey || computeUniqueKey(url, keepUrlFragment);
        this.method = method;
        this.payload = payload;
        this.retryCount = retryCount;
        this.errorMessages = errorMessages;
        this.headers = headers;
        this.userData = userData;
        this.ignoreErrors = ignoreErrors;
        this.handledAt = handledAt && new Date(handledAt);
    }

    /**
     * Stores information about an error that occurred during processing of this request.
     *
     * @param {Error|String} errorOrMessage Error object or error message to be stored in the request.
     */
    pushErrorMessage(errorOrMessage) {
        if (!_.isString(errorOrMessage) && !(errorOrMessage instanceof Error)) {
            throw new Error('Parameter errorOrMessage must be a String or an instance of Error');
        }

        const message = errorOrMessage instanceof Error
            ? errorOrMessage.message
            : errorOrMessage;

        if (!this.errorMessages) this.errorMessages = [];

        this.errorMessages.push(message);
    }
}

export default Request;
