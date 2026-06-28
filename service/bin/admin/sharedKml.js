import { AdminStore } from './store.js'

function parseKml (kmlText) {
  // Regex parsing of KML features (Placemark)
  const placemarkRegex = /<Placemark[^>]*>([\s\S]*?)<\/Placemark>/gi
  const features = []
  let match
  let i = 0

  // Helper to extract text contents safely and strip CDATA
  function extractTagContent (text, tagName) {
    const regex = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'i')
    const match = regex.exec(text)
    if (!match) return ''
    let content = match[1].trim()
    // Strip CDATA wrapper if present
    if (content.startsWith('<![CDATA[') && content.endsWith(']]>')) {
      content = content.slice(9, -3).trim()
    }
    return content
  }

  // Helper to decode XML entities
  function decodeXmlEntities (str) {
    return str
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
  }

  function parseCoords (coordText) {
    return coordText
      .trim()
      .split(/\s+/)
      .map(coordStr => {
        const parts = coordStr.split(',').map(Number)
        return [parts[0], parts[1]]
      })
      .filter(coord => !isNaN(coord[0]) && !isNaN(coord[1]))
  }

  while ((match = placemarkRegex.exec(kmlText)) !== null) {
    i++
    const placemarkContent = match[1]
    const rawName = extractTagContent(placemarkContent, 'name')
    const rawDesc = extractTagContent(placemarkContent, 'description')

    const name = rawName ? decodeXmlEntities(rawName) : `未命名要素 ${i}`
    const description = rawDesc ? decodeXmlEntities(rawDesc) : ''

    let type = null
    let coordinates = null

    // Check for Point, LineString, Polygon
    const pointMatch = /<Point[^>]*>([\s\S]*?)<\/Point>/i.exec(placemarkContent)
    const lineMatch = /<LineString[^>]*>([\s\S]*?)<\/LineString>/i.exec(placemarkContent)
    const polygonMatch = /<Polygon[^>]*>([\s\S]*?)<\/Polygon>/i.exec(placemarkContent)

    if (pointMatch) {
      type = 'Point'
      const coordText = extractTagContent(pointMatch[1], 'coordinates')
      const allCoords = parseCoords(coordText)
      if (allCoords.length > 0) {
        coordinates = allCoords[0]
      }
    } else if (lineMatch) {
      type = 'LineString'
      const coordText = extractTagContent(lineMatch[1], 'coordinates')
      coordinates = parseCoords(coordText)
    } else if (polygonMatch) {
      type = 'Polygon'
      const outerRingMatch = /<outerBoundaryIs[^>]*>([\s\S]*?)<\/outerBoundaryIs>/i.exec(polygonMatch[1])
      if (outerRingMatch) {
        const coordText = extractTagContent(outerRingMatch[1], 'coordinates')
        coordinates = parseCoords(coordText)
      } else {
        const coordText = extractTagContent(polygonMatch[1], 'coordinates')
        coordinates = parseCoords(coordText)
      }
    }

    if (type && coordinates && (type !== 'Point' ? coordinates.length > 0 : true)) {
      features.push({
        id: `feat-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
        type,
        name,
        description,
        coordinates,
      })
    }
  }

  return features
}

export class SharedKmlManager {
  constructor (options = {}) {
    this.store = options.store
    this.storeName = 'shared-kml'
  }

  async list (isAdmin = false) {
    const kmls = await this.store.read(this.storeName, [])
    if (isAdmin) {
      return kmls
    }
    return kmls
      .filter(kml => kml.status === 'published')
      .map(kml => ({
        id: kml.id,
        name: kml.name,
        coordCorrection: kml.coordCorrection,
        featureCount: kml.features ? kml.features.length : 0,
        updatedAt: kml.updatedAt,
      }))
  }

  async get (id, isAdmin = false) {
    const kmls = await this.store.read(this.storeName, [])
    const kml = kmls.find(k => k.id === id)
    if (!kml) {
      const err = new Error('KML 未找到')
      err.statusCode = 404
      throw err
    }
    if (!isAdmin && kml.status !== 'published') {
      const err = new Error('KML 未授权或未发布')
      err.statusCode = 404
      throw err
    }
    return kml
  }

  async create (input) {
    const kmls = await this.store.read(this.storeName, [])
    const name = (input.name || '新建公共 KML').trim()
    const status = input.status || 'draft'
    const coordCorrection = input.coordCorrection || 'wgs84-to-gcj02'
    const features = Array.isArray(input.features) ? input.features : []
    const now = new Date().toISOString()
    const newKml = {
      id: `shared-kml-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      name,
      status,
      coordCorrection,
      features,
      createdAt: now,
      updatedAt: now,
    }
    kmls.push(newKml)
    await this.store.write(this.storeName, kmls)
    return newKml
  }

  async update (id, input) {
    const kmls = await this.store.read(this.storeName, [])
    const index = kmls.findIndex(k => k.id === id)
    if (index === -1) {
      const err = new Error('KML 未找到')
      err.statusCode = 404
      throw err
    }
    const kml = kmls[index]
    if (input.name !== undefined) kml.name = String(input.name).trim()
    if (input.status !== undefined) kml.status = input.status
    if (input.coordCorrection !== undefined) kml.coordCorrection = input.coordCorrection
    if (input.features !== undefined) kml.features = Array.isArray(input.features) ? input.features : []
    kml.updatedAt = new Date().toISOString()
    await this.store.write(this.storeName, kmls)
    return kml
  }

  async delete (id) {
    const kmls = await this.store.read(this.storeName, [])
    const index = kmls.findIndex(k => k.id === id)
    if (index === -1) {
      const err = new Error('KML 未找到')
      err.statusCode = 404
      throw err
    }
    kmls.splice(index, 1)
    await this.store.write(this.storeName, kmls)
    return { id }
  }

  async import (fileBuffer, originalName, options = {}) {
    const kmlText = fileBuffer.toString('utf8')
    const features = parseKml(kmlText)
    if (features.length === 0) {
      throw new Error('KML 文件中未找到有效的点、线、面要素')
    }
    const name = (options.name || originalName || '未命名导入').trim().replace(/\.kml$/i, '')
    return this.create({
      name,
      status: options.status || 'draft',
      coordCorrection: options.coordCorrection || 'wgs84-to-gcj02',
      features,
    })
  }
}

export default SharedKmlManager
