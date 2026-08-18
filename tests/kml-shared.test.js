import assert from 'node:assert/strict'
import { test } from 'node:test'
import SharedKmlManager from '../service/bin/admin/sharedKml.js'

class MockStore {
  constructor () {
    this.data = {}
  }
  async read (name, fallback) {
    return this.data[name] !== undefined ? JSON.parse(JSON.stringify(this.data[name])) : fallback
  }
  async write (name, value) {
    this.data[name] = JSON.parse(JSON.stringify(value))
    return value
  }
}

test('SharedKmlManager CRUD functionality', async () => {
  const store = new MockStore()
  const manager = new SharedKmlManager({ store })

  // 1. List initially empty
  let list = await manager.list(true)
  assert.equal(list.length, 0)

  // 2. Create public KML
  const created = await manager.create({
    name: '测试图层',
    status: 'draft',
    coordCorrection: 'wgs84-to-gcj02',
    features: [
      {
        id: 'feat-1',
        type: 'Point',
        name: '点位1',
        description: '点位描述',
        coordinates: [113.26, 23.12]
      }
    ]
  })

  assert.ok(created.id.startsWith('shared-kml-'))
  assert.equal(created.name, '测试图层')
  assert.equal(created.status, 'draft')
  assert.equal(created.features.length, 1)

  // 3. List as admin returns full details
  list = await manager.list(true)
  assert.equal(list.length, 1)
  assert.equal(list[0].id, created.id)
  assert.equal(list[0].features.length, 1)

  // 4. List as normal user filters draft KML
  list = await manager.list(false)
  assert.equal(list.length, 0) // because it's draft

  // 5. Update KML to published
  const updated = await manager.update(created.id, { status: 'published' })
  assert.equal(updated.status, 'published')

  // 6. List as normal user now returns published KML summary
  list = await manager.list(false)
  assert.equal(list.length, 1)
  assert.equal(list[0].id, created.id)
  assert.equal(list[0].featureCount, 1)
  assert.equal(Object.hasOwn(list[0], 'features'), false) // Summary strips features array

  // 7. Get full KML
  const fetched = await manager.get(created.id, false)
  assert.equal(fetched.name, '测试图层')
  assert.equal(fetched.features.length, 1)

  // 8. Delete KML
  await manager.delete(created.id)
  list = await manager.list(true)
  assert.equal(list.length, 0)
})

test('SharedKmlManager KML parser supports Point, LineString, Polygon and CDATA', async () => {
  const store = new MockStore()
  const manager = new SharedKmlManager({ store })

  const kmlText = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>测试导入</name>
    <Placemark>
      <name><![CDATA[ 广州塔 ]]></name>
      <description><![CDATA[ 核心地标 ]]></description>
      <Point>
        <coordinates>113.3248,23.1085,0</coordinates>
      </Point>
    </Placemark>
    <Placemark>
      <name>海心桥</name>
      <description>人行桥</description>
      <LineString>
        <coordinates>
          113.3240,23.1090,0
          113.3245,23.1095,0
        </coordinates>
      </LineString>
    </Placemark>
    <Placemark>
      <name>花城广场</name>
      <Polygon>
        <outerBoundaryIs>
          <LinearRing>
            <coordinates>
              113.321,23.111,0
              113.323,23.111,0
              113.323,23.115,0
              113.321,23.115,0
              113.321,23.111,0
            </coordinates>
          </LinearRing>
        </outerBoundaryIs>
      </Polygon>
    </Placemark>
  </Document>
</kml>`

  const imported = await manager.import(Buffer.from(kmlText), '广州景点.kml', {
    status: 'published',
    coordCorrection: 'wgs84-to-gcj02'
  })

  assert.equal(imported.name, '广州景点')
  assert.equal(imported.status, 'published')
  assert.equal(imported.features.length, 3)

  // Point
  const point = imported.features[0]
  assert.equal(point.name, '广州塔')
  assert.equal(point.description, '核心地标')
  assert.equal(point.type, 'Point')
  assert.deepEqual(point.coordinates, [113.3248, 23.1085])

  // LineString
  const line = imported.features[1]
  assert.equal(line.name, '海心桥')
  assert.equal(line.description, '人行桥')
  assert.equal(line.type, 'LineString')
  assert.equal(line.coordinates.length, 2)
  assert.deepEqual(line.coordinates[0], [113.3240, 23.1090])

  // Polygon
  const poly = imported.features[2]
  assert.equal(poly.name, '花城广场')
  assert.equal(poly.type, 'Polygon')
  assert.equal(poly.coordinates.length, 5)
  assert.deepEqual(poly.coordinates[0], [113.321, 23.111])
})

test('SharedKmlManager returns published feature content view', async () => {
  const store = new MockStore()
  const manager = new SharedKmlManager({
    store,
    contentOptions: {
      iframeAllowlist: ['portal.example.com'],
    },
  })

  const created = await manager.create({
    name: '内容图层',
    status: 'published',
    features: [{
      id: 'feat-rich',
      type: 'Point',
      name: '富媒体点位',
      description: 'https://cdn.example.com/a.webp\nhttps://portal.example.com/detail/1',
      coordinates: [113.26, 23.12],
    }],
  })

  const view = await manager.getFeatureContent(created.id, 'feat-rich', false)
  assert.equal(view.sharedKmlId, created.id)
  assert.equal(view.featureId, 'feat-rich')
  assert.equal(view.contentSummary.imageCount, 1)
  assert.equal(view.contentSummary.iframeCount, 1)

  await assert.rejects(
    () => manager.getFeatureContent(created.id, 'missing', false),
    /KML 点位不存在或未发布/
  )
})

test('SharedKmlManager preserves KML media HTML and style hints', async () => {
  const store = new MockStore()
  const manager = new SharedKmlManager({ store })
  const kmlText = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <Placemark>
      <name>图片点位</name>
      <styleUrl>#MarkerStylePicture</styleUrl>
      <ExtendedData><Data name="map-service:marker-icon"><value>camera</value></Data></ExtendedData>
      <description><![CDATA[<div><img src="https://cdn.example.com/media?id=1" alt="现场照片"></div>]]></description>
      <Point><coordinates>111.4585,21.8390,0</coordinates></Point>
    </Placemark>
  </Document>
</kml>`

  const imported = await manager.import(Buffer.from(kmlText), '媒体点位.kml', {
    status: 'published',
  })
  const feature = imported.features[0]
  const view = await manager.getFeatureContent(imported.id, feature.id, false)

  assert.equal(feature.styleUrl, '#MarkerStylePicture')
  assert.equal(feature.markerIcon, 'camera')
  assert.match(feature.description, /<img src=/)
  assert.equal(view.contentSummary.imageCount, 1)
  assert.equal(view.groups.find(group => group.type === 'image').items[0].title, '现场照片')
})

test('SharedKmlManager validates marker icons on managed feature writes', async () => {
  const store = new MockStore()
  const manager = new SharedKmlManager({ store })

  const created = await manager.create({
    name: '图标图层',
    features: [{
      id: 'feat-camp',
      type: 'Point',
      name: '营地',
      markerIcon: 'campsite',
      coordinates: [113.26, 23.12],
    }],
  })
  assert.equal(created.features[0].markerIcon, 'campsite')

  await assert.rejects(
    () => manager.update(created.id, {
      features: [{
        id: 'feat-unsafe',
        type: 'Point',
        name: '非法图标',
        markerIcon: 'https://evil.example/icon.svg',
        coordinates: [113.26, 23.12],
      }],
    }),
    error => error.statusCode === 400 && error.code === 'VALIDATION_FAILED'
  )
})

test('SharedKmlManager validates resource collections and reports ignored import extensions', async () => {
  const store = new MockStore()
  const manager = new SharedKmlManager({ store })
  const created = await manager.create({
    name: '资源集合',
    features: [{
      id: 'feat-collection',
      type: 'Point',
      name: '集合点',
      coordinates: [113.26, 23.12],
      resourceCollection: {
        version: 1,
        viewMode: 'grid',
        items: [{ id: 'scene', title: '视角', url: 'https://www.720yun.com/t/demo?scene_id=1', type: 'iframe' }],
      },
    }],
  })
  assert.equal(created.features[0].resourceCollection.items[0].url, 'https://www.720yun.com/t/demo?scene_id=1')

  await assert.rejects(
    () => manager.update(created.id, {
      features: [{
        id: 'feat-collection',
        type: 'Point',
        coordinates: [113.26, 23.12],
        resourceCollection: { version: 1, items: [{ url: 'https://cdn.example.com/a.jpg?token=secret', type: 'image' }] },
      }],
    }),
    error => error.statusCode === 400 && error.code === 'VALIDATION_FAILED'
  )

  const imported = await manager.import(Buffer.from(`<?xml version="1.0"?><kml><Document><Placemark>
    <ExtendedData><Data name="map-service:resource-collection"><value>{&quot;version&quot;:99,&quot;items&quot;:[]}</value></Data></ExtendedData>
    <Point><coordinates>113.2,23.1,0</coordinates></Point>
  </Placemark></Document></kml>`), '未知集合.kml')
  assert.equal(Object.hasOwn(imported.features[0], 'resourceCollection'), false)
  assert.equal(imported.warnings.length, 1)
})
