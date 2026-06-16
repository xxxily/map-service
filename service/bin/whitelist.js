export default {
  domain: [
    'google.com',
    'autonavi.com',
  ],
  url: [
    'autonavi.com/appmaptile',
    'google.com/maps/vt',
  ],
  isInDomainlist (url) {
    const domain = this.domain || []
    const urlObj = new URL(url)
    const host = urlObj.host
    return domain.some((domainItem) => { return host.includes(domainItem) })
  },
  isInUrlList (url) {
    const urlList = this.url || []
    return urlList.some((urlItem) => { return url.includes(urlItem) })
  },
}
