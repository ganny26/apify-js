import log from 'apify-shared/log';
import { ENV_VARS } from 'apify-shared/consts';
import { main, getEnv, call, getApifyProxyUrl } from './actor';
import AutoscaledPool from './autoscaling/autoscaled_pool';
import BasicCrawler from './basic_crawler';
import CheerioCrawler from './cheerio_crawler';
import { pushData, openDataset } from './dataset';
import events, { initializeEvents, stopEvents } from './events';
import { getValue, setValue, openKeyValueStore } from './key_value_store';
import { launchPuppeteer } from './puppeteer';
import PuppeteerCrawler from './puppeteer_crawler';
import PuppeteerPool from './puppeteer_pool';
import Request from './request';
import RequestList from './request_list';
import { openRequestQueue } from './request_queue';
import SettingsRotator from './settings_rotator';
import { apifyClient, getMemoryInfo, isAtHome, publicUtils } from './utils';
import { browse, launchWebDriver } from './webdriver';
import { puppeteerUtils } from './puppeteer_utils';
import PseudoUrl from './pseudo_url';

/* globals module */

// Log as plain text not JSON
log.logJson = false;

// TODO: remove this when we release v1.0.0
const EMULATION_ENV_VAR = 'APIFY_LOCAL_EMULATION_DIR';
if (process.env[EMULATION_ENV_VAR]) {
    log.warning(`Environment variable "${EMULATION_ENV_VAR}" is deprecated!!! Use "${ENV_VARS.LOCAL_STORAGE_DIR}" instead!`);
    if (!process.env[ENV_VARS.LOCAL_STORAGE_DIR]) process.env[ENV_VARS.LOCAL_STORAGE_DIR] = process.env[EMULATION_ENV_VAR];
}

/**
 * The following section describes all functions and properties provided by the `apify` package,
 * except individual classes and namespaces that have their separate, detailed, documentation pages
 * accessible from the left sidebar.
 *
 * @module Apify
 */
module.exports = {
    // Actor
    main,
    getEnv,
    call,
    getMemoryInfo,
    getApifyProxyUrl,
    isAtHome,
    client: apifyClient,

    // Autoscaled pool
    AutoscaledPool,

    // Basic crawler
    BasicCrawler,

    // Cheerio crawler
    CheerioCrawler,

    // Dataset
    pushData,
    openDataset,

    // Events
    events,
    initializeEvents,
    stopEvents,

    // Key-value store
    getValue,
    setValue,
    openKeyValueStore,

    // Puppeteer
    launchPuppeteer,
    PuppeteerPool,
    PuppeteerCrawler,

    // PseudoUrl
    PseudoUrl,

    // Requests
    Request,
    RequestList,
    openRequestQueue,

    // Settings rotator
    SettingsRotator,

    // Webdriver
    browse,
    launchWebDriver,

    // utils
    utils: Object.assign(publicUtils, {
        puppeteer: puppeteerUtils,
        /**
         * Apify.utils contains various utilities for logging `WARNING,ERROR,OFF,DEBUG,INFO`.All logs are always kept.
         *
         * **Example usage:**
         *
         * ```javascript
         * const Apify = require('apify');
         * const { log } = Apify.utils;
         * log.setLevel(log.LEVELS.WARNING);
         * ```
         *
         * @namespace utils
         */
        log,
    }),
};
