function findDirectChild (element, tagName) {
  const normalizedTagName = String(tagName || '').toLowerCase()
  return [...(element?.children || [])].find(child => {
    const name = String(child?.localName || child?.tagName || '').split(':').pop().toLowerCase()
    return name === normalizedTagName
  }) || null
}

export function parseKmlDocument (kmlText) {
  const parser = new DOMParser()
  const xmlDoc = parser.parseFromString(kmlText, 'text/xml')

  const parserError = xmlDoc.querySelector('parsererror')
  if (parserError) {
    throw new Error('KML 文件解析失败，可能格式不正确')
  }

  const placemarks = xmlDoc.getElementsByTagName('Placemark')
  const features = []
  const documentNode = xmlDoc.getElementsByTagName('Document')[0]
  const documentNameNode = findDirectChild(documentNode, 'name')
  const documentDescriptionNode = findDirectChild(documentNode, 'description')

  for (let i = 0; i < placemarks.length; i++) {
    const placemark = placemarks[i]
    const nameNode = placemark.getElementsByTagName('name')[0]
    const descNode = placemark.getElementsByTagName('description')[0]
    const styleNode = placemark.getElementsByTagName('styleUrl')[0]

    const name = nameNode?.textContent.trim() || ''
    const description = descNode ? getDescriptionContent(descNode) : ''
    const styleUrl = styleNode?.textContent.trim() || ''

    let type = null
    let coordinates = null

    const pointNode = placemark.getElementsByTagName('Point')[0]
    const lineNode = placemark.getElementsByTagName('LineString')[0]
    const polygonNode = placemark.getElementsByTagName('Polygon')[0]

    if (pointNode) {
      type = 'Point'
      const coordText = pointNode.getElementsByTagName('coordinates')[0]?.textContent || ''
      coordinates = parseCoords(coordText)[0]
    } else if (lineNode) {
      type = 'LineString'
      const coordText = lineNode.getElementsByTagName('coordinates')[0]?.textContent || ''
      coordinates = parseCoords(coordText)
    } else if (polygonNode) {
      type = 'Polygon'
      const outerRing = polygonNode.getElementsByTagName('outerBoundaryIs')[0]
      const coordText = outerRing?.getElementsByTagName('coordinates')[0]?.textContent || ''
      coordinates = parseCoords(coordText)
    }

    if (type && coordinates) {
      features.push({
        id: `feat-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
        type,
        name,
        description,
        ...(styleUrl ? { styleUrl } : {}),
        coordinates,
      })
    }
  }

  return {
    name: documentNameNode?.textContent.trim() || '',
    description: documentDescriptionNode ? getDescriptionContent(documentDescriptionNode) : '',
    features,
  }
}

export function parseKML (kmlText) {
  return parseKmlDocument(kmlText).features
}

function getDescriptionContent (descriptionNode) {
  const serializer = new XMLSerializer()
  return [...descriptionNode.childNodes]
    .map(node => {
      if (node.nodeType === Node.TEXT_NODE || node.nodeType === Node.CDATA_SECTION_NODE) {
        return node.nodeValue || ''
      }
      return serializer.serializeToString(node)
    })
    .join('')
    .trim()
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

export function generateKmlText (kmlName, features, description = '') {
  const escapeXml = (unsafe) => {
    return String(unsafe ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;')
  }

  const xmlParts = []
  xmlParts.push('<?xml version="1.0" encoding="UTF-8"?>')
  xmlParts.push('<kml xmlns="http://www.opengis.net/kml/2.2">')
  xmlParts.push('  <Document>')
  xmlParts.push(`    <name>${escapeXml(kmlName)}</name>`)
  if (description) xmlParts.push(`    <description>${escapeXml(description)}</description>`)

  for (const feat of features) {
    xmlParts.push('    <Placemark>')
    xmlParts.push(`      <name>${escapeXml(feat.name)}</name>`)
    xmlParts.push(`      <description>${escapeXml(feat.description)}</description>`)

    if (feat.type === 'Point') {
      xmlParts.push('      <Point>')
      xmlParts.push(`        <coordinates>${feat.coordinates[0]},${feat.coordinates[1]},0</coordinates>`)
      xmlParts.push('      </Point>')
    } else if (feat.type === 'LineString') {
      xmlParts.push('      <LineString>')
      const coordStr = feat.coordinates.map(c => `${c[0]},${c[1]},0`).join(' ')
      xmlParts.push(`        <coordinates>${coordStr}</coordinates>`)
      xmlParts.push('      </LineString>')
    } else if (feat.type === 'Polygon') {
      xmlParts.push('      <Polygon>')
      xmlParts.push('        <outerBoundaryIs>')
      xmlParts.push('          <LinearRing>')
      const coords = [...feat.coordinates]
      const first = coords[0]
      const last = coords[coords.length - 1]
      if (first && last && (first[0] !== last[0] || first[1] !== last[1])) {
        coords.push(first)
      }
      const coordStr = coords.map(c => `${c[0]},${c[1]},0`).join(' ')
      xmlParts.push(`            <coordinates>${coordStr}</coordinates>`)
      xmlParts.push('          </LinearRing>')
      xmlParts.push('        </outerBoundaryIs>')
      xmlParts.push('      </Polygon>')
    }

    xmlParts.push('    </Placemark>')
  }

  xmlParts.push('  </Document>')
  xmlParts.push('</kml>')

  return xmlParts.join('\n')
}
