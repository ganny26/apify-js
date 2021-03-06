---
id: launchpuppeteeroptions
title: LaunchPuppeteerOptions
---
<a name="LaunchPuppeteerOptions"></a>

Represents options passed to the
[`Apify.launchPuppeteer()`](../api/apify#module_Apify.launchPuppeteer)
function.

**Properties**
<table>
<thead>
<tr>
<th>Param</th><th>Type</th><th>Default</th>
</tr>
</thead>
<tbody>
<tr>
<td><code>[proxyUrl]</code></td><td><code>String</code></td><td></td>
</tr>
<tr>
<td colspan="3"><p>URL to a HTTP proxy server. It must define the port number,
  and it may also contain proxy username and password.</p>
<p>  Example: <code>http://bob:pass123@proxy.example.com:1234</code>.</p>
</td></tr><tr>
<td><code>[userAgent]</code></td><td><code>String</code></td><td></td>
</tr>
<tr>
<td colspan="3"><p>The <code>User-Agent</code> HTTP header used by the browser.
  If not provided, the function sets <code>User-Agent</code> to a reasonable default
  to reduce the chance of detection of the crawler.</p>
</td></tr><tr>
<td><code>[useChrome]</code></td><td><code>Boolean</code></td><td><code>false</code></td>
</tr>
<tr>
<td colspan="3"><p>If <code>true</code> and <code>executablePath</code> is not set,
  Puppeteer will launch full Google Chrome browser available on the machine
  rather than the bundled Chromium. The path to Chrome executable
  is taken from the <code>APIFY_CHROME_EXECUTABLE_PATH</code> environment variable if provided,
  or defaults to the typical Google Chrome executable location specific for the operating system.
  By default, this option is <code>false</code>.</p>
</td></tr><tr>
<td><code>[useApifyProxy]</code></td><td><code>Boolean</code></td><td><code>false</code></td>
</tr>
<tr>
<td colspan="3"><p>If set to <code>true</code>, Puppeteer will be configured to use
  <a href="https://my.apify.com/proxy" target="_blank">Apify Proxy</a> for all connections.
  For more information, see the <a href="https://www.apify.com/docs/proxy" target="_blank">documentation</a></p>
</td></tr><tr>
<td><code>[apifyProxyGroups]</code></td><td><code>Array&lt;String&gt;</code></td><td></td>
</tr>
<tr>
<td colspan="3"><p>An array of proxy groups to be used
  by the <a href="https://www.apify.com/docs/proxy" target="_blank">Apify Proxy</a>.
  Only applied if the <code>useApifyProxy</code> option is <code>true</code>.</p>
</td></tr><tr>
<td><code>[apifyProxySession]</code></td><td><code>String</code></td><td></td>
</tr>
<tr>
<td colspan="3"><p>Apify Proxy session identifier to be used by all the Chrome browsers.
  All HTTP requests going through the proxy with the same session identifier
  will use the same target proxy server (i.e. the same IP address).
  The identifier can only contain the following characters: <code>0-9</code>, <code>a-z</code>, <code>A-Z</code>, <code>&quot;.&quot;</code>, <code>&quot;_&quot;</code> and <code>&quot;~&quot;</code>.
  Only applied if the <code>useApifyProxy</code> option is <code>true</code>.</p>
</td></tr><tr>
<td><code>[liveView]</code></td><td><code>Boolean</code></td><td><code>false</code></td>
</tr>
<tr>
<td colspan="3"><p>If set to <code>true</code>, a <code>PuppeteerLiveViewServer</code> will be started to enable
  screenshot and html capturing of visited pages using <code>PuppeteerLiveViewBrowser</code>.</p>
</td></tr><tr>
<td><code>[liveViewOptions]</code></td><td><code>Object</code></td><td></td>
</tr>
<tr>
<td colspan="3"><p>Settings for <code>PuppeteerLiveViewBrowser</code> started using <code>launchPuppeteer()</code>.</p>
</td></tr><tr>
<td><code>[liveViewOptions.liveViewId]</code></td><td><code>String</code></td><td></td>
</tr>
<tr>
<td colspan="3"><p>Custom ID of a browser instance in live view.</p>
</td></tr><tr>
<td><code>[liveViewOptions.screenshotTimeoutMillis]</code></td><td><code>Number</code></td><td><code>3000</code></td>
</tr>
<tr>
<td colspan="3"><p>Time in milliseconds before a screenshot capturing
  will time out and the actor continues with execution.
  Screenshot capturing pauses execution within the given page.</p>
</td></tr></tbody>
</table>
