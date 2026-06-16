import typeofLibs from './typeof.js'
import stringsLibs from './string.js'
import objectLibs from './object.js'
import helperLibs from './helper.js'

const utils = {
  ...typeofLibs,
  ...stringsLibs,
  ...objectLibs,
  ...helperLibs,
}

export default utils
