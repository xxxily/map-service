export const DEFAULT_TILE_EDGE_OVERSCAN_PX = 1
export const DEFAULT_TILE_KEEP_BUFFER = 2
export const DEFAULT_TILE_PRELOAD_BUFFER_PX = 256

function positiveInteger (value, fallback) {
  const number = Number(value)
  return Number.isInteger(number) && number > 0 ? number : fallback
}

export function getOverscannedTileSize (tileSize, edge = DEFAULT_TILE_EDGE_OVERSCAN_PX) {
  const width = positiveInteger(tileSize?.x ?? tileSize?.width, 256)
  const height = positiveInteger(tileSize?.y ?? tileSize?.height, width)
  const overscan = positiveInteger(edge, DEFAULT_TILE_EDGE_OVERSCAN_PX)
  return {
    width,
    height,
    edge: overscan,
    canvasWidth: width + overscan * 2,
    canvasHeight: height + overscan * 2,
  }
}

export function drawTileWithEdgeOverscan (context, image, tileSize, edge = DEFAULT_TILE_EDGE_OVERSCAN_PX) {
  if (!context?.drawImage) throw new TypeError('瓦片绘制上下文不可用')

  const sourceWidth = positiveInteger(image?.naturalWidth ?? image?.width, 0)
  const sourceHeight = positiveInteger(image?.naturalHeight ?? image?.height, 0)
  if (!sourceWidth || !sourceHeight) throw new TypeError('瓦片图片尺寸无效')

  const size = getOverscannedTileSize(tileSize, edge)
  const { width, height, edge: overscan } = size

  // 中心区域保持 Leaflet 的标准瓦片尺寸；四边与四角仅复制源图最外侧
  // 像素，避免把整张瓦片强行拉伸到 258px 后造成额外模糊。
  context.drawImage(image, overscan, overscan, width, height)
  context.drawImage(image, 0, 0, sourceWidth, 1, overscan, 0, width, overscan)
  context.drawImage(image, 0, sourceHeight - 1, sourceWidth, 1, overscan, overscan + height, width, overscan)
  context.drawImage(image, 0, 0, 1, sourceHeight, 0, overscan, overscan, height)
  context.drawImage(image, sourceWidth - 1, 0, 1, sourceHeight, overscan + width, overscan, overscan, height)
  context.drawImage(image, 0, 0, 1, 1, 0, 0, overscan, overscan)
  context.drawImage(image, sourceWidth - 1, 0, 1, 1, overscan + width, 0, overscan, overscan)
  context.drawImage(image, 0, sourceHeight - 1, 1, 1, 0, overscan + height, overscan, overscan)
  context.drawImage(image, sourceWidth - 1, sourceHeight - 1, 1, 1, overscan + width, overscan + height, overscan, overscan)

  return size
}
