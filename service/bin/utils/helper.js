/*!
 * @name         helper.js
 * @description  工具方法，必须符号依赖最小化才能加进来
 * @version      0.0.1
 * @author       Blaze
 * @date         2021/9/22 16:55
 * @github       https://github.com/xxxily
 */
import { createHash } from 'crypto'

/**
 * 模拟睡眠等待
 * @param time {number} -可选 等待时间，默认1000*1 ms
 * @returns {Promise<any>}
 */
function sleep (time) {
  return new Promise(function (resolve) {
    setTimeout(function () {
      resolve(true)
    }, time || 1000 * 1)
  })
}

/**
 * 给数字字符串补零，不支持负数
 * 改自：http://blog.csdn.net/aimingoo/article/details/4492592
 * @param num
 * @param fill
 * @returns {string}
 */
function padNumber (num, fill) {
  const len = ('' + num).length
  return (Array(fill > len ? fill - len + 1 || 0 : 0).join(0) + num)
}

/**
 * 获取一个以当前日期标记，可作为按天进行信息记录的id
 * @param splitStr - 年月日只讲的分割符号，默认无，常见可传: - _ / 等
 * @returns {string}
 */
function getDayTag (splitStr) {
  const d = new Date()
  const curDateArr = [
    d.getFullYear(),
    padNumber(d.getMonth() + 1, 2),
    padNumber(d.getDate(), 2),
  ]
  return curDateArr.join(splitStr || '')
}

/**
 * 间隔控制器，某个间隔内的值只允许出现一次
 * @param id {string} 控制器的id，任意字符串
 * @param interval {number} 要控制的间隔，必须为整数
 * @param curVal {number} 要控制的当前值
 * @returns {boolean} 返回要控制的值，是否已在某个范围内调用过
 */
const intervalController = (function () {
  const _cache = {}
  return function (id, interval, curVal, returnMoreInfo) {
    if (!_cache[id]) {
      _cache[id] = {}
    }
    const dataMap = _cache[id]
    const key = parseInt(curVal / (interval + 1)) + 1
    const isNew = typeof dataMap[key] === 'undefined'
    dataMap[key] = true

    if (returnMoreInfo) {
      return {
        id,
        isNew,
        key,
        interval,
        curVal,
      }
    } else {
      return isNew
    }
  }
})()

/* 判断一个对象是否为Promise对象 */
function isPromise (obj) {
  return !!obj && (typeof obj === 'object' || typeof obj === 'function') && typeof obj.then === 'function'
}

function isEmail (str) {
  const pattern = /^([A-Za-z0-9_\-.\u4e00-\u9fa5])+@([A-Za-z0-9_\-.])+\.([A-Za-z]{2,8})$/
  return pattern.test(str)
}

/**
 * 将毫秒数转为天/时/分/秒的表达形式
 * @param msd {number} -必选 毫秒数
 * @param retuenDefText -可选 默认出数组信息，true则输出统计结果的默认文本
 * @returns {string|[number, number, number, number, number]}
 */
function millisecondToDate (msd, retuenDefText) {
  /* 数据预处理 */
  let msdTotal = parseFloat(msd)
  if (msdTotal < 0) msdTotal = 0

  /**
   * parseInt(1/(1000*60*60*24))将出现计算异常
   * 所以需要加上Math.floor进行修正
   * 必须是向下取整，四舍五入或向上取整都将导致出现负数的情况
   * @param num
   * @returns {number}
   */
  function convert (num) {
    return parseInt(Math.floor(num))
  }

  /* 进行硬编码式的递归计算 */
  const oneMillisecond = 1
  const oneSecond = oneMillisecond * 1000
  const oneMinute = oneSecond * 60
  const oneHour = oneMinute * 60
  const oneDay = oneHour * 24
  const dayCount = convert(msdTotal / oneDay)
  msdTotal = msdTotal - dayCount * oneDay
  const hourCount = convert(msdTotal / oneHour)
  msdTotal = msdTotal - hourCount * oneHour
  const minuteCount = convert(msdTotal / oneMinute)
  msdTotal = msdTotal - minuteCount * oneMinute
  const secondCount = convert(msdTotal / oneSecond)
  msdTotal = msdTotal - secondCount * oneSecond
  const millisecondCount = convert(msdTotal / oneMillisecond)
  const result = [dayCount, hourCount, minuteCount, secondCount, millisecondCount]

  /* 输出结果 */
  if (retuenDefText) {
    let str = ''
    const textMap = ['天', '小时', '分钟', '秒', '毫秒']
    result.forEach((val, index) => {
      if (val) str += val + textMap[index] + ' '
    })
    return str
  } else {
    return result
  }
}

function getUrlOrigin (url) {
  if (typeof url === 'string') {
    const result = url.match(/^https?:\/\/[\w.:]+/)
    if (result) {
      return result[0]
    }
  }
  return null
}

function md5 (str) {
  const md5 = createHash('md5')
  return md5.update(str).digest('hex')
}

/**
 * 将字符串转成Boolean类型，该方法将 '', '0', 'false' 亦视为false
 * @param str {String|Number} -必选 要转换的字符串或数字
 */
function strToBoolean (str) {
  return str === '0' || str === 'false' ? false : Boolean(str)
}

/**
 * 将params对象转换成字符串模式
 * @param params {Object} - 必选 params对象
 * @returns {string}
 */
function stringifyParams (params) {
  const strArr = []

  if (!Object.prototype.toString.call(params) === '[object Object]') {
    return ''
  }

  for (const key in params) {
    if (Object.hasOwnProperty.call(params, key)) {
      let val = params[key]
      const valType = Object.prototype.toString.call(val)

      if (val === '' || valType === '[object Undefined]') continue

      if (valType === '[object Array]') {
        strArr.push(key + '=' + val.join(','))
      } else {
        val = (JSON.stringify(val) || '' + val).replace(/(^"|"$)/g, '')
        strArr.push(key + '=' + val)
      }
    }
  }
  return strArr.join('&')
}

/**
 * 解析字符串的时间间隔
 * @param str {String} 必选，例如 8:30-18:30
 */
function timeRangeParse (str) {
  if (typeof str !== 'string' || !str.includes('-')) {
    return false
  }

  const timeRange = str.split('-')

  if (timeRange.length < 2) {
    return false
  }

  function rangeCheck (num, rangeStart, rangeEnd) {
    if (typeof num !== 'number' || Number.isNaN(num)) {
      return false
    }

    if (num >= rangeStart && num <= rangeEnd) {
      return true
    }
    return false
  }

  const startTime = timeRange[0].trim().split(':')
  const endTime = timeRange[1].trim().split(':')
  const startHour = Number(startTime[0])
  const startMinute = Number(startTime[1])
  const endHour = Number(endTime[0])
  const endMinute = Number(endTime[1])

  const checkResult = [
    rangeCheck(startHour, 0, 23),
    rangeCheck(endHour, 0, 23),
    rangeCheck(startMinute, 0, 59),
    rangeCheck(endMinute, 0, 59),
  ]

  if (checkResult.includes(false)) {
    return false
  }

  return {
    startTime,
    endTime,
    startHour,
    startMinute,
    endHour,
    endMinute,
  }
}

/**
 * 判断当前是否处于给出的时间范围内
 * @param str {String} 必选，例如 8:30-18:30
 */
function isInTimeRange (str) {
  const timeRange = timeRangeParse(str)

  if (!timeRange) {
    return false
  }

  const curTime = Date.now()
  const startTime = new Date()
  const endTime = new Date()

  if (timeRange.startHour > timeRange.endHour) {
    startTime.setHours(timeRange.endHour, timeRange.endMinute)
    endTime.setHours(timeRange.startHour, timeRange.startMinute)

    return !(curTime >= startTime.getTime() && curTime < endTime.getTime())
  }
  startTime.setHours(timeRange.startHour, timeRange.startMinute)
  endTime.setHours(timeRange.endHour, timeRange.endMinute)
  return curTime >= startTime.getTime() && curTime < endTime.getTime()
}

/**
 * JavaScript异步队列实现，原代码实现见
 * https://juejin.cn/post/6844903501219233800
 * 对逻辑进行了部分调整，实现list调用后自动移除，对超大队列，或持续添加的任务队列内存占用较少
 * 改造后不再支持队列重试
 * @returns {{add: add, stop: stop, goOn: goOn, run: run}}
 */
const queueTask = () => {
  const list = []
  let isStop = false

  const next = () => {
    /* 将前面执行过的弹出 */
    list.shift()

    if (!list.length || isStop) return
    run()
  }

  const add = (...fn) => {
    list.push(...fn)
  }

  const run = (...args) => {
    const cur = list[0]
    cur instanceof Function && cur(next)
  }

  const stop = () => {
    isStop = true
  }

  const goOn = () => {
    isStop = false
    next()
  }

  return {
    add,
    run,
    stop,
    goOn,
  }
}

// function queueTaskTest () {
//   const async = (x) => {
//     return (next) => {
//       setTimeout(() => {
//         console.log(x)
//         next()
//       }, 100)
//     }
//   }
//
//   const q = queueTask()
//   const funs = '123456'.split('').map(x => async(x))
//   q.add(...funs)
//   q.run()
//
//   setTimeout(() => {
//     q.stop()
//
//     const funs2 = '789'.split('').map(x => async(x))
//     q.add(...funs2)
//     console.log('789------')
//   }, 350)
//
//   setTimeout(() => {
//     q.goOn()
//   }, 2000)
//
//   setTimeout(() => {
//     console.log('----------------')
//     q.add(...funs)
//     q.run()
//   }, 1000 * 3)
// }
// queueTaskTest()

// module.exports = { sleep, padNumber, getDayTag, intervalController, isPromise, isEmail, millisecondToDate, getUrlOrigin, md5, strToBoolean, stringifyParams, timeRangeParse, isInTimeRange, queueTask, }
export default { sleep, padNumber, getDayTag, intervalController, isPromise, isEmail, millisecondToDate, getUrlOrigin, md5, strToBoolean, stringifyParams, timeRangeParse, isInTimeRange, queueTask, }
