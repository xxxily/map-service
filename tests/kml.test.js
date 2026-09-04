import assert from 'node:assert/strict'
import { test } from 'node:test'
import { gcj02ToWgs84, normalizeLongitude, wgs84ToGcj02 } from '../src/map/coord-transform.js'
import { generateKmlText, parseKML, parseKmlDocument } from '../src/map/kml-format.js'

// Node 测试环境无 DOM，注入覆盖 parseKML 调用面的轻量 DOMParser mock
class MockElement {
  constructor (node) {
    this.tagName = node.tag
    this.localName = node.tag
    this.nodeType = node.tag === '#text' ? 3 : 1
    this.nodeValue = node.tag === '#text' ? node.text : null
    this.attributes = node.attributes || {}
    this.children = node.children.map(child => new MockElement(child))
    this.childNodes = this.children
    this.textContent = node.tag === '#text'
      ? node.text
      : this.children.map(child => child.textContent).join('')
  }

  getAttribute (name) {
    return this.attributes[name] ?? null
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

  const decodeXml = value => String(value || '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')

  const parseAttributes = source => {
    const attributes = {}
    const pattern = /([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g
    let attributeMatch
    while ((attributeMatch = pattern.exec(source || '')) !== null) {
      attributes[attributeMatch[1]] = attributeMatch[2] ?? attributeMatch[3] ?? ''
    }
    return attributes
  }

  while ((match = tagRe.exec(cleaned)) !== null) {
    const text = cleaned.slice(lastIndex, match.index)
    if (text.trim()) {
      stack[stack.length - 1].children.push({ tag: '#text', text: decodeXml(text), children: [], })
    }
    lastIndex = tagRe.lastIndex
    const [, closing, tag, attributeSource, selfClosing] = match
    if (selfClosing) {
      stack[stack.length - 1].children.push({ tag, children: [], text: '', attributes: parseAttributes(attributeSource) })
    } else if (closing) {
      if (stack.length > 1) stack.pop()
    } else {
      const el = { tag, children: [], text: '', attributes: parseAttributes(attributeSource) }
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
globalThis.Node = { TEXT_NODE: 3, CDATA_SECTION_NODE: 4 }
globalThis.XMLSerializer = class MockXMLSerializer {
  serializeToString (node) {
    if (node.nodeType === Node.TEXT_NODE || node.nodeType === Node.CDATA_SECTION_NODE) return node.nodeValue || ''
    return `<${node.tagName}>${node.childNodes.map(child => this.serializeToString(child)).join('')}</${node.tagName}>`
  }
}

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

test('KML 要素显隐状态按 Placemark visibility 往返并兼容缺省值', () => {
  const source = [
    {
      type: 'Point',
      name: '隐藏点位',
      description: '',
      visible: false,
      coordinates: [113.264385, 23.129112],
    },
    {
      type: 'LineString',
      name: '默认显示线段',
      description: '',
      coordinates: [[113.2, 23.1], [113.3, 23.2]],
    },
  ]
  const exported = generateKmlText('显隐测试', source)
  assert.match(exported, /<visibility>0<\/visibility>/)
  const parsed = parseKmlDocument(exported)
  assert.equal(parsed.warnings.length, 0)
  assert.equal(parsed.features[0].visible, false)
  assert.equal(Object.hasOwn(parsed.features[1], 'visible'), false)

  const invalid = parseKmlDocument(`<?xml version="1.0"?><kml><Document>
    <Placemark><visibility>2</visibility><Point><coordinates>113.2,23.1,0</coordinates></Point></Placemark>
  </Document></kml>`)
  assert.equal(invalid.features.length, 1)
  assert.equal(Object.hasOwn(invalid.features[0], 'visible'), false)
  assert.equal(invalid.warnings.length, 1)
  assert.match(invalid.warnings[0], /显隐状态已忽略/)
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

test('KML 文档解析保留文件级名称和介绍，导出时继续写入 Document.description', () => {
  const kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>带统计信息的路线</name>
    <description><p><strong>总里程：</strong>12.34 km</p><p><strong>原作者：</strong>山友阿明</p></description>
    <Placemark><Point><coordinates>113.26,23.13,0</coordinates></Point></Placemark>
  </Document>
</kml>`

  const parsed = parseKmlDocument(kml)
  const exported = generateKmlText(parsed.name, parsed.features, parsed.description)

  assert.equal(parsed.name, '带统计信息的路线')
  assert.match(parsed.description, /总里程：<\/strong>12\.34 km/)
  assert.match(parsed.description, /原作者：<\/strong>山友阿明/)
  assert.equal(parsed.features.length, 1)
  assert.match(exported, /<description>&lt;p&gt;&lt;strong&gt;总里程：/)
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

test('KML resource collections round-trip through standard ExtendedData', () => {
  const source = {
    type: 'Point',
    name: '全景集合',
    description: '',
    markerIcon: 'collection',
    coordinates: [113.264385, 23.129112],
    resourceCollection: {
      version: 1,
      viewMode: 'list',
      items: [{
        id: 'res-scene',
        title: '夜景视角',
        url: 'https://www.720yun.com/t/demo?scene_id=4279442',
        type: 'iframe',
        coverUrl: 'https://cdn.example.com/night-view.jpg',
      }],
    },
  }
  const kml = generateKmlText('资源集合', [source])
  assert.match(kml, /name="map-service:resource-collection"/)
  const parsed = parseKmlDocument(kml)
  assert.equal(parsed.warnings.length, 0)
  assert.deepEqual(parsed.features[0].resourceCollection, source.resourceCollection)
  assert.equal(parsed.features[0].markerIcon, 'collection')
})

test('invalid resource collection data is ignored without blocking other KML features', () => {
  const kml = `<?xml version="1.0"?><kml><Document>
    <Placemark><ExtendedData><Data name="map-service:resource-collection"><value>{&quot;version&quot;:99,&quot;items&quot;:[]}</value></Data></ExtendedData><Point><coordinates>113.2,23.1,0</coordinates></Point></Placemark>
    <Placemark><Point><coordinates>113.3,23.2,0</coordinates></Point></Placemark>
  </Document></kml>`
  const parsed = parseKmlDocument(kml)
  assert.equal(parsed.features.length, 2)
  assert.equal(Object.hasOwn(parsed.features[0], 'resourceCollection'), false)
  assert.equal(parsed.warnings.length, 1)
  assert.match(parsed.warnings[0], /资源集合已忽略/)
})
