import assert from 'node:assert/strict'
import { test } from 'node:test'
import HttpsProxyAgent from 'https-proxy-agent'
import {
  createPinnedLookup,
  createPinnedProxyRequestConfig,
  isBlockedNetworkAddress,
  isBlockedNetworkHostname,
  resolvePublicHttpTarget,
  validatePublicHttpUrl,
} from '../service/bin/security/networkTarget.js'

test('network target validation blocks private, metadata and reserved IPv4/IPv6 targets', () => {
  ;[
    '0.0.0.0',
    '10.0.0.1',
    '100.100.100.200',
    '127.0.0.1',
    '168.63.129.16',
    '169.254.169.254',
    '172.16.0.1',
    '192.168.0.1',
    '224.0.0.1',
    '240.0.0.1',
    '255.255.255.255',
    '::1',
    '::ffff:7f00:1',
    'fc00::1',
    'fd00::1',
    'fe80::1',
    'ff02::1',
    '2001:db8::1',
    '2002:7f00:1::',
  ].forEach(address => assert.equal(isBlockedNetworkAddress(address), true, address))

  assert.equal(isBlockedNetworkAddress('8.8.8.8'), false)
  assert.equal(isBlockedNetworkAddress('2001:4860:4860::8888'), false)
  assert.equal(isBlockedNetworkHostname('metadata.google.internal'), true)
  assert.equal(isBlockedNetworkHostname('tiles.internal'), true)
  assert.equal(isBlockedNetworkHostname('printer.local'), true)
  assert.equal(isBlockedNetworkHostname('intranet'), true)
  assert.equal(isBlockedNetworkHostname('tiles.example.com'), false)

  ;[
    'http://0.0.0.0/tiles',
    'http://2130706433/tiles',
    'http://[::ffff:127.0.0.1]/tiles',
    'http://[fc00::1]/tiles',
    'http://metadata.google.internal/computeMetadata/v1/',
    'http://service.internal/tiles',
  ].forEach(url => assert.throws(() => validatePublicHttpUrl(url), { statusCode: 403 }))
  assert.throws(() => validatePublicHttpUrl('file:///etc/passwd'), { statusCode: 400 })
  assert.throws(() => validatePublicHttpUrl('https://user:pass@tiles.example.com/a'), { statusCode: 400 })
})

test('network target DNS validation rejects any mixed private answer and keeps public answers', async () => {
  const resolved = await resolvePublicHttpTarget('https://tiles.example.com/a', {
    lookup: async () => [
      { address: '203.12.34.56', family: 4 },
      { address: '2001:4860:4860::8888', family: 6 },
    ],
  })
  assert.deepEqual(resolved.addresses, [
    { address: '203.12.34.56', family: 4 },
    { address: '2001:4860:4860::8888', family: 6 },
  ])

  await assert.rejects(resolvePublicHttpTarget('https://tiles.example.com/a', {
    lookup: async () => [
      { address: '203.12.34.56', family: 4 },
      { address: '10.0.0.1', family: 4 },
    ],
  }), { statusCode: 403 })
  await assert.rejects(resolvePublicHttpTarget('https://tiles.example.com/a', {
    lookup: async () => { throw new Error('dns failed') },
  }), { statusCode: 502 })
})

test('loopback HTTP proxy accepts Clash fake-IP answers without relaxing direct SSRF checks', async () => {
  const fakeLookup = async () => [{ address: '198.18.0.44', family: 4 }]
  const targetUrl = 'https://www.google.com/maps/vt?x=1&y=2&z=3'

  await assert.rejects(resolvePublicHttpTarget(targetUrl, { lookup: fakeLookup }), { statusCode: 403 })

  const resolution = await resolvePublicHttpTarget(targetUrl, {
    lookup: fakeLookup,
    allowProxySyntheticAddresses: true,
  })
  assert.deepEqual(resolution.addresses, [{ address: '198.18.0.44', family: 4 }])

  const config = createPinnedProxyRequestConfig(resolution, {
    protocol: 'http',
    host: '127.0.0.1',
    port: 7890,
  })
  assert.equal(config.url.includes('198.18.0.44'), true)
  assert.equal(config.headers.Host, 'www.google.com')
  assert.equal(config.httpsAgent.proxy.host, '127.0.0.1')

  assert.throws(() => createPinnedProxyRequestConfig(resolution, {
    protocol: 'http',
    host: 'proxy.example.net',
    port: 8080,
  }), { statusCode: 403 })
  await assert.rejects(resolvePublicHttpTarget(targetUrl, {
    lookup: async () => [
      { address: '198.18.0.44', family: 4 },
      { address: '8.8.8.8', family: 4 },
    ],
    allowProxySyntheticAddresses: true,
  }), { statusCode: 403 })
  await assert.rejects(resolvePublicHttpTarget(targetUrl, {
    lookup: async () => [{ address: '127.0.0.1', family: 4 }],
    allowProxySyntheticAddresses: true,
  }), { statusCode: 403 })
})

test('pinned DNS lookup only returns the prevalidated public addresses', async () => {
  const lookup = createPinnedLookup([
    { address: '203.12.34.56', family: 4 },
    { address: '2001:4860:4860::8888', family: 6 },
  ])

  const all = await new Promise((resolve, reject) => {
    lookup('tiles.example.com', { all: true }, (err, addresses) => err ? reject(err) : resolve(addresses))
  })
  assert.equal(all.length, 2)

  const ipv4 = await new Promise((resolve, reject) => {
    lookup('tiles.example.com', { family: 4 }, (err, address, family) => (
      err ? reject(err) : resolve({ address, family })
    ))
  })
  assert.deepEqual(ipv4, { address: '203.12.34.56', family: 4 })
})

test('proxy target config connects to a validated IP while preserving Host and HTTPS SNI', () => {
  const config = createPinnedProxyRequestConfig({
    url: 'https://tiles.example.com:8443/world/0/0/0.png?style=night',
    hostname: 'tiles.example.com',
    addresses: [{ address: '203.12.34.56', family: 4 }],
  })

  assert.equal(config.url, 'https://203.12.34.56:8443/world/0/0/0.png?style=night')
  assert.equal(config.headers.Host, 'tiles.example.com:8443')
  assert.equal(config.httpsAgent.options.servername, 'tiles.example.com')
  assert.equal(config.url.includes('tiles.example.com'), false)

  assert.throws(() => createPinnedProxyRequestConfig({
    url: 'https://tiles.example.com/a',
    hostname: 'tiles.example.com',
    addresses: [{ address: '240.0.0.1', family: 4 }],
  }), { statusCode: 403 })
})

test('HTTPS proxy pinning keeps proxy TLS and origin TLS identities separate', async () => {
  const originalCallback = HttpsProxyAgent.prototype.callback
  let observedOriginOptions = null
  HttpsProxyAgent.prototype.callback = function (_request, options) {
    observedOriginOptions = options
    return Promise.resolve(null)
  }

  try {
    const config = createPinnedProxyRequestConfig({
      url: 'https://tiles.example.com/world.png',
      hostname: 'tiles.example.com',
      addresses: [{ address: '203.12.34.56', family: 4 }],
    }, {
      protocol: 'https',
      host: 'proxy.example.net',
      port: 8443,
    })

    assert.equal(config.proxy, false)
    assert.equal(config.httpsAgent.proxy.host, 'proxy.example.net')
    assert.equal(config.httpsAgent.proxy.servername, 'proxy.example.net')
    await config.httpsAgent.callback({}, {
      host: '203.12.34.56',
      port: 443,
      secureEndpoint: true,
    })
    assert.equal(observedOriginOptions.host, '203.12.34.56')
    assert.equal(observedOriginOptions.servername, 'tiles.example.com')
  } finally {
    HttpsProxyAgent.prototype.callback = originalCallback
  }
})
