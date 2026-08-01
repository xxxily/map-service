import assert from 'node:assert/strict'
import { test } from 'node:test'
import { gcj02ToWgs84, normalizeLongitude, wgs84ToGcj02 } from '../src/map/coord-transform.js'
import { generateKmlText, parseKML } from '../src/map/kml-format.js'

// Node 测试环境无 DOM，注入覆盖 parseKML 调用面的轻量 DOMParser mock
class MockElement {
  constructor (node) {
    this.tagName = node.tag
    this.children = node.children.map(child => new MockElement(child))
    this.textContent = node.children
      .filter(child => child.tag === '#text')
      .map(child => child.text)
      .join('')
  }

  getElementsByTagName (tag) {
    const result = []
    const walk = (el) => {
      for (const child of el.children) {
        if (child.tagName === tag) result.push(child)
        walk(child)
      }
    }
    walk(this)
    return result
  }

  querySelector (selector) {
    // parseKML 仅用 querySelector 检测 parsererror，mock 场景均无解析错误
    return selector === 'parsererror' ? null : null
  }
}

function parseSimpleXml (xml) {
  const cleaned = xml.replace(/<\?xml[^>]*\?>/, '').trim()
  const root = { tag: 'root', children: [], text: '' }
  const stack = [root]
  const tagRe = /<(\/?)([\w-]+)((?:\s[^<>]*)?)(\/?)>/g
  let lastIndex = 0
  let match

  while ((match = tagRe.exec(cleaned)) !== null) {
    const text = cleaned.slice(lastIndex, match.index)
    if (text.trim()) {
      stack[stack.length - 1].children.push({ tag: '#text', text, children: [], })
    }
    lastIndex = tagRe.lastIndex
    const [, closing, tag, , selfClosing] = match
    if (selfClosing) {
      stack[stack.length - 1].children.push({ tag, children: [], text: '' })
    } else if (closing) {
      if (stack.length > 1) stack.pop()
    } else {
      const el = { tag, children: [], text: '' }
      stack[stack.length - 1].children.push(el)
      stack.push(el)
    }
  }

  return new MockElement(stack[0])
}

class MockDOMParser {
  parseFromString (text) {
    return parseSimpleXml(text)
  }
}

globalThis.DOMParser = MockDOMParser

test('WGS84 coordinates convert to GCJ-02 for AMap display and restore accurately', () => {
  const source = [111.3950162020138, 22.3796367459376]
  const converted = wgs84ToGcj02(source)
  const restored = gcj02ToWgs84(converted)

  assert.ok(Math.abs(converted[0] - source[0]) > 0.001)
  assert.ok(Math.abs(converted[1] - source[1]) > 0.001)
  assert.ok(Math.abs(restored[0] - source[0]) < 1e-7)
  assert.ok(Math.abs(restored[1] - source[1]) < 1e-7)
})

test('KML export keeps stored standard coordinates unchanged', () => {
  const feature = {
    type: 'Point',
    name: '信宜地点',
    description: '标准 KML 坐标',
    coordinates: [111.3950162020138, 22.3796367459376],
  }

  const kml = generateKmlText('export.kml', [feature])

  assert.match(kml, /<coordinates>111\.3950162020138,22\.3796367459376,0<\/coordinates>/)
  assert.doesNotMatch(kml, /111\.400306/)
})

test('KML export is independent from file visibility state', () => {
  const kmlFile = {
    name: 'hidden.kml',
    enabled: false,
    features: [{
      type: 'Point',
      name: '隐藏点位',
      description: '禁用显示时仍允许导出',
      coordinates: [113.264385, 23.129112],
    }],
  }

  const kml = generateKmlText(kmlFile.name, kmlFile.features)

  assert.match(kml, /<name>hidden\.kml<\/name>/)
  assert.match(kml, /<name>隐藏点位<\/name>/)
  assert.match(kml, /<coordinates>113\.264385,23\.129112,0<\/coordinates>/)
})

test('wrapped western longitudes are normalized before KML serialization', () => {
  const wrappedLongitude = 237.5805
  const normalized = normalizeLongitude(wrappedLongitude)
  const coordinates = gcj02ToWgs84([normalized, 37.3352])
  const kml = generateKmlText('western-track.kml', [{
    type: 'Point',
    name: '西半球轨迹点',
    coordinates,
  }])

  assert.ok(normalized >= -180 && normalized <= 180)
  assert.ok(Math.abs(normalized - (-122.4195)) < 1e-10)
  assert.doesNotMatch(kml, /237\.5805/)
  assert.match(kml, /-122\.41949/)
})

test('parseKML keeps empty name for unnamed placemarks', () => {
  const kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <Placemark>
      <name>已命名点位</name>
      <Point><coordinates>113.26,23.13,0</coordinates></Point>
    </Placemark>
    <Placemark>
      <Point><coordinates>113.27,23.14,0</coordinates></Point>
    </Placemark>
    <Placemark>
      <name>   </name>
      <Point><coordinates>113.28,23.15,0</coordinates></Point>
    </Placemark>
  </Document>
</kml>`

  const features = parseKML(kml)

  assert.equal(features.length, 3)
  assert.equal(features[0].name, '已命名点位')
  assert.equal(features[1].name, '')
  assert.equal(features[2].name, '')
})

test('KML export keeps empty name for unnamed features', () => {
  const kml = generateKmlText('unnamed.kml', [{
    type: 'Point',
    name: '',
    description: '',
    coordinates: [113.264385, 23.129112],
  }])

  assert.match(kml, /<name><\/name>/)
  assert.match(kml, /<coordinates>113\.264385,23\.129112,0<\/coordinates>/)
})
