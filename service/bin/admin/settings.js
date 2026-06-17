function clone (value) {
  return JSON.parse(JSON.stringify(value))
}

function createHttpError (message, statusCode = 400) {
  const err = new Error(message)
  err.statusCode = statusCode
  return err
}

function normalizeBoolean (value) {
  return value === true || value === 'true' || value === '1'
}

function normalizeProtocol (value) {
  const protocol = String(value || 'http').toLowerCase()
  if (!['http', 'https'].includes(protocol)) {
    throw createHttpError('代理协议仅支持 http 或 https')
  }
  return protocol
}

function normalizePort (value) {
  const port = Number(value)
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw createHttpError('代理端口必须是 1 到 65535 的整数')
  }
  return port
}

function normalizeHost (value) {
  const host = String(value || '').trim()
  if (!host || host.length > 255 || /[\s/]/.test(host)) {
    throw createHttpError('代理主机地址不合法')
  }
  return host
}

function normalizeProxy (input = {}, current = {}) {
  const next = {
    enabled: normalizeBoolean(input.enabled ?? current.enabled),
    protocol: normalizeProtocol(input.protocol ?? current.protocol),
    host: normalizeHost(input.host ?? current.host),
    port: normalizePort(input.port ?? current.port),
    username: String(input.username ?? current.username ?? '').trim(),
    password: Object.hasOwn(input, 'password')
      ? String(input.password || '')
      : String(current.password || ''),
  }

  if (!next.username) {
    next.password = ''
  }

  return next
}

function sanitizeProxy (proxy) {
  return {
    enabled: Boolean(proxy.enabled),
    protocol: proxy.protocol,
    host: proxy.host,
    port: proxy.port,
    username: proxy.username || '',
    hasPassword: Boolean(proxy.password),
  }
}

export class AdminSettings {
  constructor (store, defaults = {}) {
    this.store = store
    this.defaults = {
      proxy: normalizeProxy(defaults.proxy || {
        enabled: false,
        protocol: 'http',
        host: '127.0.0.1',
        port: 10809,
        username: '',
        password: '',
      }),
    }
    this.cache = null
  }

  async readRaw () {
    if (this.cache) {
      return clone(this.cache)
    }

    const saved = await this.store.read('settings', {})
    this.cache = {
      proxy: normalizeProxy(saved?.proxy || {}, this.defaults.proxy),
    }
    return clone(this.cache)
  }

  async getSanitized () {
    const settings = await this.readRaw()
    return {
      proxy: sanitizeProxy(settings.proxy),
    }
  }

  async update (input = {}) {
    const current = await this.readRaw()
    const next = {
      ...current,
      proxy: Object.hasOwn(input, 'proxy')
        ? normalizeProxy(input.proxy || {}, current.proxy)
        : current.proxy,
    }

    await this.store.write('settings', next)
    this.cache = clone(next)
    return this.getSanitized()
  }

  async getProxyForRequest (forceProxy = false) {
    const settings = await this.readRaw()
    const proxy = settings.proxy
    return {
      ...proxy,
      enabled: Boolean(forceProxy || proxy.enabled),
    }
  }
}

export default AdminSettings
