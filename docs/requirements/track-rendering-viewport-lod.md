# 轨迹渲染视口过滤与 LOD 分级优化需求

## 状态

- 状态：规划中，待实施
- 建立日期：2026-07-12
- 适用范围：前台 2D 地图（Leaflet）、3D 地图（Cesium）持续定位轨迹渲染
- 关联需求：[持续定位长期运行可靠性](./continuous-location-reliability.md)

## 背景和目标

### 问题现象

持续定位轨迹渲染当前采用三重固定截断策略（取尾部 N 个），在长途场景下存在严重缺陷：

| 层级 | 常量 | 当前值 | 位置 | 问题 |
|------|------|--------|------|------|
| 直接地图渲染 | `MAX_RENDERED_HISTORY_POINTS` | 120 | `src/map/location.js`、`src/map3d/location.js` | 15 秒间隔下 30 分钟即超限，旧轨迹点从地图消失 |
| KML 点特征 | `LIVE_TRACK_RENDER_POINT_LIMIT` | 120 | `src/map/location-track.js` | KML 图层面板仅显示最后 120 个点 |
| KML 线顶点 | `LIVE_TRACK_RENDER_LINE_POINT_LIMIT` | 2000 | `src/map/location-track.js` | 长途轨迹线被大幅抽稀，失真严重 |

当前数据流：

```
GPS 定位 → historyPoints[] (默认无限)
              ├─→ renderHistoryPoints()     ← slice(-120) 直接渲染 circleMarker/entity
              └─→ recordingSession → persistTrack → updateTrackKml()
                                                    └─→ getTrackDisplayFeatures()  ← 截断 120 点 + 2000 线顶点
                                                          ├─→ KML 图层渲染
                                                          └─→ 面板列表显示
```

### 目标

将"取尾部 N 个"的固定截断替换为**视口过滤 + LOD 分级 + 硬上限**三重控制，确保：

1. 长途轨迹在地图上完整可见（视口范围内的点全部渲染）。
2. 不同缩放级别下渲染密度合理，不因点过密导致性能下降。
3. 硬上限防止极端情况（GPS 抖动产生大量密集点）的性能崩溃。
4. 存储层、KML 导出和面板列表的数据完整性不受影响。

## 用户和场景

- **长途驾驶**：以 15 秒间隔持续定位 2-4 小时，产生 500-1000 个轨迹点，跨越数百公里。
- **城市步行**：以 3-5 秒间隔定位，短时间内产生密集点，但视口范围小。
- **骑行/徒步**：中等速度，长时间运行，轨迹点分布范围大且不均匀。
- **缩放浏览**：用户在查看全程概览和放大查看局部细节之间频繁切换。

## 范围

### 范围内

- 2D 地图（Leaflet）轨迹点的视口过滤渲染。
- 3D 地图（Cesium）轨迹实体的视口过滤渲染。
- KML 图层 `getTrackDisplayFeatures` 的视口感知过滤。
- 缩放级别驱动的 LOD（Level of Detail）分级抽稀。
- 地图视口变化（平移、缩放）时的按需重渲染。
- 线顶点的视口内裁剪 + 均匀采样抽稀。
- 硬上限保护，防止极端情况下渲染过多图元。
- 相关自动化测试。

### 范围外

- 轨迹数据的存储层修改（`historyPoints[]`、`recordingSession` 保持不变）。
- KML 导出格式修改（导出仍包含全部记录）。
- 面板历史列表修改（保持 100 条上限）。
- 服务端轨迹同步或云端存储。
- 矢量瓦片化渲染（后续路线）。

## 功能需求

### 1. 视口过滤

在渲染轨迹点和线之前，先根据当前地图视口范围过滤，只渲染可见区域（含缓冲区）内的点。

#### 参数

| 参数 | 值 | 说明 |
|------|----|------|
| `VIEWPORT_BUFFER_RATIO` | 1.5 | 渲染范围 = 当前视口 × 1.5，预渲染视口外 25% 的区域，平移时不出现空白 |

#### 2D（Leaflet）

- 使用 `map.getBounds()` 获取当前视口边界。
- 扩展边界 `bounds.pad(0.25)` 作为缓冲区。
- 过滤 `historyPoints` 中坐标在扩展边界内的点。
- 对线特征坐标进行视口裁剪（保留视口内及相邻段的顶点）。

#### 3D（Cesium）

- 使用 `viewer.camera.positionCartographic` 获取相机位置。
- 通过 `viewer.scene.globe.ellipsoid.cartesianToCartographic` 或视口四角投影计算可见范围。
- 过滤逻辑与 2D 一致。

### 2. LOD 分级抽稀

根据当前缩放级别（2D: `map.getZoom()`，3D: 由相机高度换算）确定渲染密度。

#### LOD 配置表

| 缩放级别 | 场景 | 点标记上限 | 线顶点上限 | 点抽取间隔 | 说明 |
|----------|------|-----------|-----------|-----------|------|
| 0-7 | 国家/大区域 | 0 | 300 | — | 只显示线轮廓，点在此尺度不可见 |
| 8-12 | 省级/区域 | 80 | 1,000 | 每 5 取 1 | 稀疏点 + 中等线密度 |
| 13-15 | 城市/城区 | 200 | 3,000 | 每 2 取 1 | 中等密度，路线清晰可辨 |
| 16+ | 街道/步行 | 500 | 5,000 | 每 1 取 1 | 全密度，视口过滤后通常远少于 500 |

#### 3D 缩放级别换算

3D 场景无直接缩放级别，通过相机高度换算：

```
zoom ≈ log2(20000000 / cameraHeightMeters)
```

其中 `20000000` 为初始高度基准（与 `startIntervalLocation3d` 中的换算一致）。

#### 点抽取策略

- 按 LOD 配置的间隔（每 N 取 1）均匀抽样。
- 始终保留最新的点（最后定位点）。
- 始终保留每个线段的首尾点。

#### 线顶点抽稀策略

- 对每条 LineString 的坐标数组进行均匀采样。
- 采样数 = `min(坐标数, lodConfig.maxLineVertices)`。
- 均匀采样：首尾必保留，中间按等间距取点。

### 3. 硬上限保护

跨 LOD 级别的绝对天花板，防止视口内点异常密集时性能崩溃。

| 参数 | 值 | 理由 |
|------|----|------|
| `VIEWPORT_MAX_POINTS` | 500 | Leaflet circleMarker 带 popup 绑定，500 个在中端手机上仍流畅；Cesium point entity 同理 |
| `VIEWPORT_MAX_LINE_VERTICES` | 5,000 | Leaflet polyline 5000 顶点平移无卡顿；Cesium clampToGround polyline 5000 顶点同样流畅 |

### 4. 视口变化按需重渲染

#### 2D（Leaflet）

- 在 `startIntervalLocation2d` 中注册 `map.on('moveend zoomend', debouncedRerender)`。
- 在 `stopIntervalLocation2d` 中注销监听。
- 使用 200ms debounce + `requestAnimationFrame` 节流。

#### 3D（Cesium）

- 在 `startIntervalLocation3d` 中注册 `viewer.camera.changed.addEventListener(debouncedRerender)`。
- 在 `stopIntervalLocation3d` 中注销监听。
- 同样使用 200ms debounce 节流。

#### 触发时机

| 事件 | 触发直接层重渲染 | 触发 KML 层重渲染 | 说明 |
|------|:---:|:---:|------|
| 新定位点到达 | ✅ | ✅ | 同当前逻辑，但使用新过滤 |
| 地图平移结束 (`moveend`) | ✅ | ❌ | KML 层数据未变，仅直接层需适应新视口 |
| 地图缩放结束 (`zoomend`) | ✅ | ✅ | LOD 级别可能变化，KML 层也需重算 |
| 停止定位 | ✅ | ✅ | 最终持久化，同当前逻辑 |

### 5. 数据完整性保障

| 层级 | 修改 | 说明 |
|------|------|------|
| `historyPoints[]` | ❌ 不修改 | 内存中保留全部轨迹点，默认无限 |
| `recordingSession` | ❌ 不修改 | 持久化会话保持完整 |
| KML `features` | ❌ 不修改 | `updateTrackKml2d/3d` 仍生成全部 features |
| KML 导出 | ❌ 不修改 | 导出使用 `kmlFile.features`（全量），不经过 `getTrackDisplayFeatures` |
| 面板历史列表 | ❌ 不修改 | 保持 100 条上限不变 |
| `getTrackDisplayFeatures` | ✅ 增强 | 新增可选参数 `{ viewportBounds, zoom }`，不传时退化为当前行为（向后兼容） |

## 非功能需求

### 性能

- 视口过滤 + LOD 抽稀后的渲染操作在 16ms 内完成（60fps）。
- 10000 个轨迹点时，视口过滤 + LOD 后渲染点数不超过 500 个。
- 视口变化触发重渲染的 debounce 延迟不超过 300ms。
- 内存不因轨迹点增长而持续增长（渲染层只持有过滤后的图层引用）。

### 兼容性

- `getTrackDisplayFeatures` 不带新参数时，行为与当前版本一致。
- 现有 `LIVE_TRACK_RENDER_POINT_LIMIT` / `LIVE_TRACK_RENDER_LINE_POINT_LIMIT` 作为 LOD fallback。
- `MAX_RENDERED_HISTORY_POINTS` 被新逻辑替代，但保留常量作为 hard cap fallback。
- 2D 和 3D 共享 `location-track.js` 中的 LOD 配置和工具函数。

### 安全

- 无新增网络请求或外部数据访问。
- 视口过滤在客户端完成，不泄露位置信息。

## API 和数据模型

### 新增常量（`location-track.js`）

```javascript
// 视口缓冲系数：渲染范围 = 当前视口 × 1.5
export const VIEWPORT_BUFFER_RATIO = 1.5

// 硬上限（跨 LOD 的绝对天花板）
export const VIEWPORT_MAX_POINTS = 500
export const VIEWPORT_MAX_LINE_VERTICES = 5000

// LOD 分级配置
export const TRACK_LOD_CONFIGS = [
  { zoomMin: 0,  zoomMax: 7,  maxPoints: 0,   maxLineVertices: 300,  pointInterval: Infinity },
  { zoomMin: 8,  zoomMax: 12, maxPoints: 80,  maxLineVertices: 1000, pointInterval: 5 },
  { zoomMin: 13, zoomMax: 15, maxPoints: 200, maxLineVertices: 3000, pointInterval: 2 },
  { zoomMin: 16, zoomMax: 99, maxPoints: 500, maxLineVertices: 5000, pointInterval: 1 },
]
```

### 新增工具函数（`location-track.js`）

```javascript
// 根据缩放级别获取 LOD 配置
export function getTrackLodConfig(zoom)

// 均匀采样线坐标（首尾必保留）
export function downsampleLineCoordinates(coordinates, maxVertices)

// 对点列表按间隔抽样 + 上限截断（保留最新点）
export function applyLodToPointList(points, lodConfig)

// 2D 视口过滤：根据 Leaflet bounds 过滤点
export function filterPointsInViewport2d(points, bounds, bufferRatio)

// 3D 视口过滤：根据 Cesium 相机视口过滤点
export function filterPointsInViewport3d(points, viewer, bufferRatio)

// 3D 相机高度 → 缩放级别换算
export function cameraHeightToZoom(cameraHeightMeters)
```

### `getTrackDisplayFeatures` 增强

```javascript
// 增强签名（新增可选参数，向后兼容）
export function getTrackDisplayFeatures(kmlFile, options = {})
// options.viewportBounds: { south, west, north, east } | null
// options.zoom: number | null
```

### 2D 渲染函数增强

```javascript
// renderHistoryPoints 增强签名
function renderHistoryPoints(map, points)
// 内部自动获取 map.getBounds() 和 map.getZoom() 进行过滤
```

### 3D 渲染函数增强

```javascript
// renderHistoryPoints3d 增强签名
function renderHistoryPoints3d(viewer, points)
// 内部自动获取相机视口和缩放级别进行过滤
```

## 验收标准

### 功能验收

1. **长途轨迹完整可见**：以 15 秒间隔持续定位 2 小时（约 480 个点），在缩放级别 16 下平移地图，视口内的轨迹点全部可见，不因超过 120 个而消失。
2. **缩放级别自适应**：在缩放级别 5 查看全程时，不渲染点标记，仅显示线轮廓；缩放到级别 14 时，点和线均可见且密度合理。
3. **线顶点不丢失**：长途轨迹线在缩放到最高级别时，视口内的线段完整不抽稀（或抽稀后视觉无差异）。
4. **视口外不渲染**：视口外的轨迹点不创建图层/实体，平移到该区域时按需渲染。
5. **平移流畅**：平移地图时轨迹点无闪烁，debounce 后 200-300ms 内完成重渲染。
6. **数据完整性**：停止定位后导出 KML，导出文件包含全部轨迹点和线段，不因渲染过滤而丢失数据。

### 性能验收

7. **10000 点压力测试**：模拟 10000 个轨迹点，在缩放级别 16 下渲染帧率不低于 30fps。
8. **视口过滤耗时**：10000 个点的视口过滤 + LOD 抽稀操作在 5ms 内完成。
9. **内存稳定**：持续运行 1 小时后，渲染层内存不持续增长。

### 兼容性验收

10. **向后兼容**：`getTrackDisplayFeatures(kmlFile)` 不带第二个参数时，行为与当前版本一致。
11. **2D/3D 一致**：同一轨迹在 2D 和 3D 中相同缩放级别下渲染的点数和线顶点数一致。

## 后续路线

- **矢量瓦片化**：将轨迹渲染为矢量瓦片，支持更大规模数据（10万+ 点）。
- **轨迹简化算法**：引入 Douglas-Peucker 或 Visvalingam 算法替代均匀采样，在更少顶点数下保持轨迹形状。
- **离屏 Canvas 渲染**：将轨迹点渲染到离屏 Canvas，进一步提升性能。
- **时间轴回放**：基于完整轨迹数据实现时间轴回放功能。
