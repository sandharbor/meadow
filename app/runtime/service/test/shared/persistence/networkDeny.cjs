'use strict';

const dns = require('node:dns');
const fs = require('node:fs');
const http = require('node:http');
const https = require('node:https');
const net = require('node:net');
const tls = require('node:tls');
const originalDnsLookup = dns.lookup.bind(dns);
const originalNetConnect = net.connect.bind(net);
const originalNetCreateConnection = net.createConnection.bind(net);

function deny(operation) {
  return function deniedNetworkOperation() {
    const auditPath = process.env.MEADOW_NETWORK_AUDIT_PATH;
    if (auditPath) fs.appendFileSync(auditPath, `${operation}\n`, { mode: 0o600 });
    throw new Error(`Release-upgrade startup attempted forbidden network operation: ${operation}`);
  };
}

http.request = deny('http.request');
http.get = deny('http.get');
https.request = deny('https.request');
https.get = deny('https.get');
function isLocalIpc(args) {
  const first = args[0];
  return typeof first === 'string'
    || (first && typeof first === 'object' && typeof first.path === 'string' && first.port === undefined);
}

net.connect = function releaseUpgradeConnect(...args) {
  if (isLocalIpc(args)) return originalNetConnect(...args);
  return deny('net.connect')();
};
net.createConnection = function releaseUpgradeCreateConnection(...args) {
  if (isLocalIpc(args)) return originalNetCreateConnection(...args);
  return deny('net.createConnection')();
};
tls.connect = deny('tls.connect');
dns.lookup = function releaseUpgradeLookup(hostname, ...args) {
  if (hostname === '127.0.0.1' || hostname === '::1') {
    return originalDnsLookup(hostname, ...args);
  }
  return deny(`dns.lookup:${String(hostname)}`)();
};
dns.resolve = deny('dns.resolve');
globalThis.fetch = deny('fetch');
