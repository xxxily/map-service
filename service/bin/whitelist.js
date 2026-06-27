export default {
  allowedHosts: [
    'www.google.com',
    'www.google.cn',
    'webst01.is.autonavi.com',
    'webst02.is.autonavi.com',
    'webst03.is.autonavi.com',
    'webst04.is.autonavi.com',
    'webrd01.is.autonavi.com',
    'webrd02.is.autonavi.com',
    'webrd03.is.autonavi.com',
    'webrd04.is.autonavi.com',
    'wprd01.is.autonavi.com',
    'wprd02.is.autonavi.com',
    'wprd03.is.autonavi.com',
    'wprd04.is.autonavi.com',
  ],
  allowedPathPatterns: [
    /^\/maps\/vt$/,
    /^\/appmaptile$/,
  ],
  isAllowed (url) {
    try {
      const urlObj = new URL(url)
      const hostname = urlObj.hostname.toLowerCase()
      const pathname = urlObj.pathname

      return this.allowedHosts.includes(hostname) &&
        this.allowedPathPatterns.some(pattern => pattern.test(pathname))
    } catch (err) {
      return false
    }
  },
}
