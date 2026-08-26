import { performance } from 'node:perf_hooks'
import { clusterKmlPoints } from '../src/map/kml-point-clustering.js'
import { generateKmlText, parseKmlText } from '../service/bin/user/userContent.js'

const pointScales = [10, 100, 1_000, 10_000, 50_000, 100_000, 200_000]
const fileScales = [1, 10, 50, 100]
const assertMode = process.argv.includes('--assert')

function point (id, index = 0) {
  const column = index % 400
  const row = Math.floor(index / 400)
  return {
    id,
    type: 'Point',
    name: `点位 ${id}`,
    description: '',
    coordinates: [111 + column * 0.00005, 22 + row * 0.00005],
  }
}

function line (id, index = 0, vertices = 24) {
  const startLng = 111 + (index % 100) * 0.001
  const startLat = 22 + Math.floor(index / 100) * 0.001
  return {
    id,
    type: 'LineString',
    name: `线段 ${id}`,
    description: '',
    coordinates: Array.from({ length: vertices }, (_, vertex) => [
      startLng + vertex * 0.00003,
      startLat + Math.sin(vertex / 3) * 0.00005,
    ]),
  }
}

function polygon (id, index = 0) {
  const lng = 111 + (index % 100) * 0.001
  const lat = 22 + Math.floor(index / 100) * 0.001
  return {
    id,
    type: 'Polygon',
    name: `区域 ${id}`,
    description: '',
    coordinates: [[lng, lat], [lng + 0.0004, lat], [lng + 0.0004, lat + 0.0004], [lng, lat + 0.0004]],
  }
}

function measure (run, repetitions = 1) {
  const samples = []
  let value
  for (let index = 0; index < repetitions; index += 1) {
    const started = performance.now()
    value = run()
    samples.push(performance.now() - started)
  }
  samples.sort((left, right) => left - right)
  return {
    value,
    minMs: Number(samples[0].toFixed(2)),
    medianMs: Number(samples[Math.floor(samples.length / 2)].toFixed(2)),
  }
}

function project ({ lat, lng }) {
  return { x: lng * 8192, y: lat * 8192 }
}

const cluster = pointScales.map(count => {
  const points = Array.from({ length: count }, (_, index) => point(`cluster-${index}`, index))
  const measured = measure(() => clusterKmlPoints(points, 10, {
    enabled: true,
    gridSize: 64,
    minClusterPoints: 250,
    maxMembersPerCluster: 5000,
  }, project), 3)
  return {
    pointCount: count,
    outputCount: measured.value.length,
    minMs: measured.minMs,
    medianMs: measured.medianMs,
  }
})

const mixedFeatures = [
  ...Array.from({ length: 4000 }, (_, index) => point(`mixed-point-${index}`, index)),
  ...Array.from({ length: 800 }, (_, index) => line(`mixed-line-${index}`, index)),
  ...Array.from({ length: 200 }, (_, index) => polygon(`mixed-polygon-${index}`, index)),
]

const mixed = (() => {
  const generated = measure(() => generateKmlText('混合几何基准', mixedFeatures), 3)
  const parsed = measure(() => parseKmlText(generated.value), 3)
  return {
    featureCount: mixedFeatures.length,
    pointCount: 4000,
    lineCount: 800,
    polygonCount: 200,
    byteSize: Buffer.byteLength(generated.value),
    generateMinMs: generated.minMs,
    generateMedianMs: generated.medianMs,
    parseMinMs: parsed.minMs,
    parseMedianMs: parsed.medianMs,
  }
})()

const files = fileScales.map(fileCount => {
  const perFile = Array.from({ length: 100 }, (_, index) => (
    index % 5 === 0 ? line(`line-${index}`, index) : point(`point-${index}`, index)
  ))
  const generated = measure(() => Array.from({ length: fileCount }, (_, index) => (
    generateKmlText(`基准文件 ${index + 1}`, perFile)
  )), 3)
  const parsed = measure(() => generated.value.map(parseKmlText), 3)
  return {
    fileCount,
    totalFeatureCount: fileCount * perFile.length,
    totalBytes: generated.value.reduce((total, text) => total + Buffer.byteLength(text), 0),
    generateMinMs: generated.minMs,
    generateMedianMs: generated.medianMs,
    parseMinMs: parsed.minMs,
    parseMedianMs: parsed.medianMs,
  }
})

const result = {
  generatedAt: new Date().toISOString(),
  node: process.version,
  cluster,
  mixed,
  files,
  thresholds: {
    cluster200kMedianMs: 750,
    mixedGenerateMedianMs: 1500,
    mixedParseMedianMs: 1500,
    files100GenerateMedianMs: 1500,
    files100ParseMedianMs: 1500,
  },
}

if (assertMode) {
  const failures = []
  const cluster200k = cluster.find(item => item.pointCount === 200_000)
  const files100 = files.find(item => item.fileCount === 100)
  if (cluster200k.medianMs > result.thresholds.cluster200kMedianMs) failures.push(`20 万点聚合中位耗时 ${cluster200k.medianMs}ms`)
  if (mixed.generateMedianMs > result.thresholds.mixedGenerateMedianMs) failures.push(`混合 KML 生成中位耗时 ${mixed.generateMedianMs}ms`)
  if (mixed.parseMedianMs > result.thresholds.mixedParseMedianMs) failures.push(`混合 KML 解析中位耗时 ${mixed.parseMedianMs}ms`)
  if (files100.generateMedianMs > result.thresholds.files100GenerateMedianMs) failures.push(`100 文件生成中位耗时 ${files100.generateMedianMs}ms`)
  if (files100.parseMedianMs > result.thresholds.files100ParseMedianMs) failures.push(`100 文件解析中位耗时 ${files100.parseMedianMs}ms`)
  if (failures.length) throw new Error(`KML 性能门槛未通过：${failures.join('；')}`)
}

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
