import _ from 'underscore';
import fs from 'fs';
import os from 'os';
import path from 'path';
import log from 'apify-shared/log';
import LinkedList from 'apify-shared/linked_list';
import Promise from 'bluebird';
import rimraf from 'rimraf';
import { checkParamOrThrow } from 'apify-client/build/utils';
import { launchPuppeteer } from './puppeteer';

/* global process */

const PROCESS_KILL_TIMEOUT_MILLIS = 5000;
const PAGE_CLOSE_KILL_TIMEOUT_MILLIS = 1000;

const DEFAULT_OPTIONS = {
    // Don't make these too large, otherwise Puppeteer might start crashing weirdly,
    // and the default settings should just work
    maxOpenPagesPerInstance: 50,
    retireInstanceAfterRequestCount: 100,

    // These can't be constants because we need it for unit tests.
    instanceKillerIntervalMillis: 60 * 1000,
    killInstanceAfterMillis: 5 * 60 * 1000,

    // TODO: use settingsRotator()
    launchPuppeteerFunction: launchPuppeteerOptions => launchPuppeteer(launchPuppeteerOptions),

    recycleDiskCache: false,
};

const mkdtempAsync = Promise.promisify(fs.mkdtemp);
const rimrafAsync = Promise.promisify(rimraf);
const DISK_CACHE_DIR = path.join(os.tmpdir(), 'puppeteer_disk_cache-');

/**
 * Deletes Chrome's user data directory
 * @param {String} diskCacheDir
 * @ignore
 */
const deleteDiskCacheDir = (diskCacheDir) => {
    log.debug('PuppeteerPool: Deleting disk cache directory', { diskCacheDir });
    return rimrafAsync(diskCacheDir)
        .catch((err) => {
            log.warning('PuppeteerPool: Cannot delete Chrome disk cache directory', { diskCacheDir, errorMessage: err.message });
        });
};

/**
 * Internal representation of Puppeteer instance.
 *
 * @ignore
 */
class PuppeteerInstance {
    constructor(id, browserPromise) {
        this.id = id;
        this.activePages = 0;
        this.totalPages = 0;
        this.browserPromise = browserPromise;
        this.lastPageOpenedAt = Date.now();
        this.killed = false;
        this.childProcess = null;
        this.recycleDiskCacheDir = null;
    }
}

/**
 * Manages a pool of Chrome browser instances controlled using
 * <a href="https://github.com/GoogleChrome/puppeteer" target="_blank">Puppeteer</a>.
 *
 * `PuppeteerPool` reuses Chrome instances and tabs using specific browser rotation and retirement policies.
 * This is useful in order to facilitate rotation of proxies, cookies
 * or other settings in order to prevent detection of your web scraping bot,
 * access web pages from various countries etc.
 *
 * Additionally, the reuse of browser instances instances speeds up crawling,
 * and the retirement of instances helps mitigate effects of memory leaks in Chrome.
 *
 * `PuppeteerPool` is internally used by the {@link PuppeteerCrawler} class.
 *
 * **Example usage:**
 *
 * ```javascript
 * const puppeteerPool = new PuppeteerPool({
 *   launchPuppeteerFunction: () => {
 *     // Use a new proxy with a new IP address for each new Chrome instance
 *     return Apify.launchPuppeteer({
 *        apifyProxySession: Math.random(),
 *     });
 *   },
 * });
 *
 * const page1 = await puppeteerPool.newPage();
 * const page2 = await puppeteerPool.newPage();
 * const page3 = await puppeteerPool.newPage();
 *
 * // ... do something with the pages ...
 *
 * // Close all browsers.
 * await puppeteerPool.destroy();
 * ```
 * @param {Object} [options] All `PuppeteerPool` parameters are passed
 *   via an options object with the following keys:
 * @param {Number} [options.maxOpenPagesPerInstance=50]
 *   Maximum number of open pages (i.e. tabs) per browser. When this limit is reached, new pages are loaded in a new browser instance.
 * @param {Number} [options.retireInstanceAfterRequestCount=100]
 *   Maximum number of requests that can be processed by a single browser instance.
 *   After the limit is reached, the browser is retired and new requests are
 *   handled by a new browser instance.
 * @param {Number} [options.instanceKillerIntervalMillis=60000]
 *   Indicates how often are the open Puppeteer instances checked whether they can be closed.
 * @param {Number} [options.killInstanceAfterMillis=300000]
 *   When Puppeteer instance reaches the `options.retireInstanceAfterRequestCount` limit then
 *   it is considered retired and no more tabs will be opened. After the last tab is closed the
 *   whole browser is closed too. This parameter defines a time limit between the last tab was opened and
 *   before the browser is closed even if there are pending open tabs.
 * @param {Function} [options.launchPuppeteerFunction]
 *   Overrides the default function to launch a new `Puppeteer` instance.
 *   See source code on
 *   <a href="https://github.com/apifytech/apify-js/blob/master/src/puppeteer_pool.js#L28" target="_blank">GitHub</a>
 *   for default behavior.
 * @param {LaunchPuppeteerOptions} [options.launchPuppeteerOptions]
 *   Options used by `Apify.launchPuppeteer()` to start new Puppeteer instances.
 *   See [`LaunchPuppeteerOptions`](../typedefs/launchpuppeteeroptions).
 * @param {Boolean} [options.recycleDiskCache]
 *   Enables recycling of disk cache directories by Chrome instances.
 *   When a browser instance is closed, its disk cache directory is not deleted but it's used by a newly opened browser instance.
 *   This is useful to reduce amount of data that needs to be downloaded to speed up crawling and reduce proxy usage.
 *   Note that the new browser starts with empty cookies, local storage etc. so this setting doesn't affect anonymity of your crawler.
 *
 *   Beware that the disk cache directories can consume a lot of disk space.
 *   To limit the space consumed, you can pass the `--disk-cache-size=X` argument to `options.launchPuppeteerOptions.args`,
 *   where `X` is the approximate maximum number of bytes for disk cache.
 *
 *   *IMPORTANT:* Currently this feature only works in **headful** mode, because of a bug in Chromium.
 *
 *   The `options.recycleDiskCache` setting should not be used together with `--disk-cache-dir` argument in `options.launchPuppeteerOptions.args`.
 */
class PuppeteerPool {
    constructor(opts = {}) {
        checkParamOrThrow(opts, 'opts', 'Object');

        // For backwards compatibility, in the future we can remove this...
        if (!opts.retireInstanceAfterRequestCount && opts.abortInstanceAfterRequestCount) {
            log.warning('PuppeteerPool: Parameter `abortInstanceAfterRequestCount` is deprecated! Use `retireInstanceAfterRequestCount` instead!');
            opts.retireInstanceAfterRequestCount = opts.abortInstanceAfterRequestCount;
        }

        const {
            maxOpenPagesPerInstance,
            retireInstanceAfterRequestCount,
            launchPuppeteerFunction,
            instanceKillerIntervalMillis,
            killInstanceAfterMillis,
            launchPuppeteerOptions,
            recycleDiskCache,
        } = _.defaults(opts, DEFAULT_OPTIONS);

        checkParamOrThrow(maxOpenPagesPerInstance, 'opts.maxOpenPagesPerInstance', 'Number');
        checkParamOrThrow(retireInstanceAfterRequestCount, 'opts.retireInstanceAfterRequestCount', 'Number');
        checkParamOrThrow(launchPuppeteerFunction, 'opts.launchPuppeteerFunction', 'Function');
        checkParamOrThrow(instanceKillerIntervalMillis, 'opts.instanceKillerIntervalMillis', 'Number');
        checkParamOrThrow(killInstanceAfterMillis, 'opts.killInstanceAfterMillis', 'Number');
        checkParamOrThrow(launchPuppeteerOptions, 'opts.launchPuppeteerOptions', 'Maybe Object');
        checkParamOrThrow(recycleDiskCache, 'opts.recycleDiskCache', 'Maybe Boolean');

        // The recycleDiskCache option is only supported in headful mode
        // See https://bugs.chromium.org/p/chromium/issues/detail?id=882431
        if (recycleDiskCache
            && ((!launchPuppeteerOptions
                || (launchPuppeteerOptions && launchPuppeteerOptions.headless)
                || (launchPuppeteerOptions && launchPuppeteerOptions.headless === undefined && !launchPuppeteerOptions.devtools)))) {
            log.warning('PuppeteerPool: The "recycleDiskCache" is currently only supported in headful mode. Disk cache will not be recycled.');
        }

        // Config.
        this.maxOpenPagesPerInstance = maxOpenPagesPerInstance;
        this.retireInstanceAfterRequestCount = retireInstanceAfterRequestCount;
        this.killInstanceAfterMillis = killInstanceAfterMillis;
        this.recycledDiskCacheDirs = recycleDiskCache ? new LinkedList() : null;
        this.launchPuppeteerFunction = async () => {
            // Do not modify passed launchPuppeteerOptions!
            const options = _.clone(launchPuppeteerOptions) || {};
            options.args = _.clone(options.args || []);

            // If requested, use recycled disk cache directory
            let diskCacheDir = null;
            if (recycleDiskCache) {
                diskCacheDir = this.recycledDiskCacheDirs.length > 0
                    ? this.recycledDiskCacheDirs.removeFirst()
                    : await mkdtempAsync(DISK_CACHE_DIR);
                options.args.push(`--disk-cache-dir=${diskCacheDir}`);
            }

            const browser = await launchPuppeteerFunction(options);
            browser.recycleDiskCacheDir = diskCacheDir;
            return browser;
        };

        // State.
        this.browserCounter = 0;
        this.activeInstances = {};
        this.retiredInstances = {};
        this.instanceKillerInterval = setInterval(() => this._killRetiredInstances(), instanceKillerIntervalMillis);

        // ensure termination on SIGINT
        this.sigintListener = () => this._killAllInstances();
        process.on('SIGINT', this.sigintListener);
    }

    /**
     * Launches new browser instance.
     *
     * @ignore
     */
    _launchInstance() {
        const id = this.browserCounter++;
        log.debug('PuppeteerPool: launching new browser', { id });

        const browserPromise = this.launchPuppeteerFunction();
        const instance = new PuppeteerInstance(id, browserPromise);

        instance
            .browserPromise
            .then((browser) => {
                browser.on('disconnected', () => {
                    // If instance.killed === true then we killed the instance so don't log it.
                    if (!instance.killed) log.error('PuppeteerPool: Puppeteer sent "disconnect" event. Maybe it crashed???', { id });
                    this._retireInstance(instance);
                });
                // This one is done manually in Puppeteerpool.newPage() so that it happens immediately.
                // browser.on('targetcreated', () => instance.activePages++);
                browser.on('targetdestroyed', (target) => {
                    // The event is also called for service workers and Chromium extensions, which must be ignored!
                    const type = target.type();
                    if (type !== 'page' && type !== 'other') return;

                    instance.activePages--;

                    if (instance.activePages === 0 && this.retiredInstances[id]) {
                        // Run this with a delay, otherwise page.close() that initiated this 'targetdestroyed' event
                        // might fail with "Protocol error (Target.closeTarget): Target closed."
                        // TODO: Alternatively we could close here the first about:blank tab, which will cause
                        // the browser to be closed immediately without waiting
                        setTimeout(() => {
                            log.debug('PuppeteerPool: killing retired browser because it has no active pages', { id });
                            this._killInstance(instance);
                        }, PAGE_CLOSE_KILL_TIMEOUT_MILLIS);
                    }
                });

                instance.childProcess = browser.process();
                instance.recycleDiskCacheDir = browser.recycleDiskCacheDir;
            })
            .catch((err) => {
                log.exception(err, 'PuppeteerPool: browser launch failed', { id });

                return this._retireInstance(instance);
            });

        this.activeInstances[id] = instance;

        return instance;
    }

    /**
     * Retires some of the instances for example due to many uses.
     *
     * @ignore
     */
    _retireInstance(instance) {
        const { id } = instance;

        if (!this.activeInstances[id]) return log.debug('PuppeteerPool: browser is retired already', { id });

        log.debug('PuppeteerPool: retiring browser', { id });

        this.retiredInstances[id] = instance;
        delete this.activeInstances[id];
    }

    /**
     * Kills all the retired instances that:
     * - have all tabs closed
     * - or are inactive for more then killInstanceAfterMillis.
     *
     * @ignore
     */
    _killRetiredInstances() {
        log.debug('PuppeteerPool: retired browsers count', { count: _.values(this.retiredInstances).length });

        _.mapObject(this.retiredInstances, (instance) => {
            // Kill instances that are more than this.killInstanceAfterMillis from last opened page
            if (Date.now() - instance.lastPageOpenedAt > this.killInstanceAfterMillis) {
                log.debug('PuppeteerPool: killing retired browser after period of inactivity', { id: instance.id, killInstanceAfterMillis: this.killInstanceAfterMillis }); // eslint-disable-line max-len
                this._killInstance(instance);
                return;
            }

            instance
                .browserPromise
                .then(browser => browser.pages())
                .then((pages) => {
                    // NOTE: we are killing instance when number of pages below 1 because there is always about:blank page.
                    if (pages.length <= 1) {
                        log.debug('PuppeteerPool: killing retired browser because it has no open tabs', { id: instance.id });
                        this._killInstance(instance);
                    }
                }, (err) => {
                    log.exception(err, 'PuppeteerPool: browser.pages() failed', { id: instance.id });
                    this._killInstance(instance);
                });
        });
    }

    /**
     * Kills given browser instance.
     *
     * @ignore
     */
    _killInstance(instance) {
        const { id, childProcess } = instance;

        log.debug('PuppeteerPool: killing browser', { id });

        delete this.retiredInstances[id];

        const recycleDiskCache = () => {
            if (!instance.recycleDiskCacheDir) return;
            log.debug('PuppeteerPool: recycling disk cache dir', { id, diskCacheDir: instance.recycleDiskCacheDir });
            this.recycledDiskCacheDirs.add(instance.recycleDiskCacheDir);
            instance.recycleDiskCacheDir = null;
        };

        // Ensure that Chrome process will be really killed.
        setTimeout(() => {
            // This is here because users reported that it happened
            // that error `TypeError: Cannot read property 'kill' of null` was thrown.
            // Likely Chrome process wasn't started due to some error ...
            if (childProcess) childProcess.kill('SIGKILL');

            recycleDiskCache();
        }, PROCESS_KILL_TIMEOUT_MILLIS);

        instance
            .browserPromise
            .then((browser) => {
                if (instance.killed) return;

                instance.killed = true;

                return browser.close();
            })
            .then(() => {
                recycleDiskCache();
            })
            .catch(err => log.exception(err, 'PuppeteerPool: cannot close the browser instance', { id }));
    }

    /**
     * Kills all running PuppeteerInstances.
     * @ignore
     */
    _killAllInstances() {
        // TODO: delete all dirs
        const allInstances = Object.values(this.activeInstances).concat(Object.values(this.retiredInstances));
        allInstances.forEach((instance) => {
            try {
                instance.childProcess.kill('SIGINT');
            } catch (e) {
                // do nothing, it's dead
            }
        });
    }

    /**
     * Opens new tab in one of the browsers in the pool and returns a `Promise`
     * that resolves to an instance of a Puppeteer
     * <a href="https://pptr.dev/#?product=Puppeteer&show=api-class-page" target="_blank"><code>Page</code></a>.
     *
     * @return {Promise<Page>}
     */
    async newPage() {
        let instance;

        _.mapObject(this.activeInstances, (inst) => {
            if (inst.activePages >= this.maxOpenPagesPerInstance) return;

            instance = inst;
        });

        if (!instance) instance = this._launchInstance();

        instance.lastPageOpenedAt = Date.now();
        instance.totalPages++;
        instance.activePages++;

        if (instance.totalPages >= this.retireInstanceAfterRequestCount) this._retireInstance(instance);

        try {
            const browser = await instance.browserPromise;
            const page = await browser.newPage();

            page.once('error', (error) => {
                log.exception(error, 'PuppeteerPool: page crashed');
                // Swallow errors from Page.close()
                page.close()
                    .catch(err => log.debug('PuppeteerPool: Page.close() failed', { errorMessage: err.message, id: instance.id }));
            });

            // TODO: log console messages page.on('console', message => log.debug(`Chrome console: ${message.text}`));

            return page;
        } catch (err) {
            log.exception(err, 'PuppeteerPool: browser.newPage() failed', { id: instance.id });
            this._retireInstance(instance);

            // !TODO: don't throw an error but repeat newPage with some delay
            throw err;
        }
    }

    /**
     * Closes all open browsers.
     * @return {Promise}
     */
    destroy() {
        clearInterval(this.instanceKillerInterval);
        process.removeListener('SIGINT', this.sigintListener);

        // TODO: delete of dir doesn't seem to work!

        const browserPromises = _
            .values(this.activeInstances)
            .concat(_.values(this.retiredInstances))
            .map((instance) => {
                // This is needed so that "Puppeteer disconnected" errors are not printed.
                instance.killed = true;

                return instance.browserPromise;
            });

        const closePromises = browserPromises.map((browserPromise) => {
            return browserPromise
                .then((browser) => {
                    browser.close();
                    return browser;
                })
                .then((browser) => {
                    if (browser.recycleDiskCacheDir) return deleteDiskCacheDir(browser.recycleDiskCacheDir);
                });
        });

        return Promise
            .all(closePromises)
            .then(() => {
                // Delete all cache directories
                const promises = [];
                while (this.recycledDiskCacheDirs && this.recycledDiskCacheDirs.length > 0) {
                    promises.push(deleteDiskCacheDir(this.recycledDiskCacheDirs.removeFirst()));
                }
                return Promise.all(promises);
            })
            .catch(err => log.exception(err, 'PuppeteerPool: cannot close the browsers'));
    }

    /**
     * Finds a PuppeteerInstance given a Puppeteer Browser running in the instance.
     * @param {Browser} browser
     * @return {Promise}
     * @ignore
     */
    _findInstanceByBrowser(browser) {
        const instances = Object.values(this.activeInstances);
        return Promise.filter(instances, instance => instance.browserPromise.then(savedBrowser => browser === savedBrowser))
            .then((results) => {
                switch (results.length) {
                case 0:
                    return null;
                case 1:
                    return results[0];
                default:
                    throw new Error('PuppeteerPool: Multiple instances of PuppeteerPool found using a single browser instance.');
                }
            });
    }

    /**
     * Manually retires a Puppeteer
     * <a href="https://pptr.dev/#?product=Puppeteer&show=api-class-browser" target="_blank"><code>Browser</code></a>
     * instance from the pool. The browser will continue to process open pages so that they may gracefully finish.
     * This is unlike `browser.close()` which will forcibly terminate the browser and all open pages will be closed.
     * @param {Browser} browser
     * @return {Promise}
     */
    retire(browser) {
        return this._findInstanceByBrowser(browser)
            .then((instance) => {
                if (instance) return this._retireInstance(instance);
                log.debug('PuppeteerPool: browser is retired already');
            });
    }
}

export default PuppeteerPool;
