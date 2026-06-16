/*!
 * @name         common.js
 * @description  公共方法
 * @version      0.0.1
 * @author       Blaze
 * @date         2020/2/21 15:14
 * @github       https://github.com/xxxily
 */

const common = {
  /**
   * 将两段url路径叠加成一段路径
   * @param pathOne {string} -必选 第一段路径
   * @param pathTow {string} -必选 第二段路径
   */
  urlPathCombine (pathOne, pathTow) {
    if (typeof pathOne !== 'string') return ''
    if (typeof pathTow !== 'string') return pathOne

    if (!pathOne.endsWith('/')) {
      pathOne = pathOne + '/'
    }

    if (pathTow.startsWith('/')) {
      pathTow = pathTow.replace(/^\//, '')
    }

    return (pathOne + pathTow).replace(/\/$/, '')
  },
  /**
   * 将多段url路径叠加成一段路径，最少两个参数，支持无限多个参数
   * @returns {string}
   */
  urlPathCombinePlus () {
    let pathTemp = arguments[0] || ''
    for (let i = 0; i < arguments.length; i++) {
      if (i > 0) {
        pathTemp = common.urlPathCombine(pathTemp, arguments[i])
      }
    }
    return pathTemp
  },
}

export default common
