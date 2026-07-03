# 国内外图源与矢量图源接入调研报告

> 调研时间：2026-07-03
> 适用项目：map-service 图源管理、代理池、缓存、对外 API 重构后续规划
> 目标：扩充现有高德、Google 图源，并评估矢量图源接入路线，提升底图质量、样式可控性和后续扩展能力。

## 结论先行

当前系统已经具备“图源 ID -> 服务端代理/缓存 -> 前端组合图层”的基础，因此短期扩充栅格图源的性价比最高。建议按以下优先级推进：

1. **第一批直接新增栅格/WMTS 图源**：天地图、ArcGIS World Imagery、CARTO Positron/Dark Matter/Voyager、OSM 低流量测试源、OpenTopoMap、Google `lyrs` 参数变体。
2. **第二批接入需要 API Key 的商业图源**：MapTiler、Mapbox、Stadia Maps、HERE、Thunderforest、腾讯位置服务 WMTS。
3. **第三批接入需要适配器的图源**：Google 官方 Map Tiles API、Bing/Azure Maps、RainViewer、NASA GIBS、复杂 WMTS GetCapabilities 图源。
4. **矢量图源建议作为下一阶段能力建设**：以 MapLibre GL JS + Mapbox Vector Tile (MVT) + TileJSON/Style JSON 为主线；2D 先支持矢量底图，3D 初期继续使用栅格化 fallback。

最关键的产品判断：

- **栅格图源**适合快速丰富底图选择、保持 Leaflet/Cesium 现有渲染路径稳定。
- **矢量图源**适合提升高清屏显示、样式定制、多语言标签、昼夜主题、道路/POI 层级控制和长期可维护性。
- **“矢量底图栅格版”和“客户端矢量瓦片”必须区分**：天地图 `vec_w`、高德标准图、Google roadmap 这类服务经常以矢量数据生产底图，但最终返回 PNG/JPEG 图片；本报告里的“矢量图源能力”特指 MVT/TileJSON/Style JSON/PMTiles 这类前端可样式化的客户端矢量瓦片。
- **Google 传统 `vt?lyrs=` URL**可以继续作为工程可用的非官方图源，但应在后台标注“非官方、稳定性和合规风险较高”；如果要正式商用，应优先评估 Google 官方 Map Tiles API。
- **国内图源必须关注坐标系**：高德、腾讯、Google `gl=cn` 场景通常涉及 GCJ-02；天地图 Web Mercator 服务一般可按 EPSG:3857 接入；百度瓦片涉及 BD-09/百度墨卡托，当前 Leaflet/Cesium 栅格链路不建议直接接。
- **国内公开商用还要关注地图合规**：境外商业图源和 OSM 衍生图源在中国边界、海域线、地名、审图号、测绘资质方面可能不满足国内公开展示要求；面向国内用户上线前，需要单独走图源授权、审图和合规评估。

## 当前系统适配边界

当前后端图源模板支持：

- 协议：`http`、`https`
- 占位符：`{s}`、`{x}`、`{y}`、`{z}`、`{scale}`、`{yTms}`
- 瓦片尺寸：固定 `256`
- scale：`1`、`2`、`3`
- 能力：服务端代理、服务端缓存、访问日志、外部发布、图层组合

当前不直接支持但后续建议补充：

- `{quadkey}`：Bing/Azure Maps 传统瓦片常用。
- `{r}` 或 retina 后缀：如 Stadia/Stamen 常用 `@2x`。
- `{format}`、`{token}`、`{time}`、`{style}`、`{layer}` 等命名占位符。
- 动态会话 token：Google 官方 Map Tiles API 需要先 `createSession`。
- TileJSON/Style JSON：矢量图源必须支持。
- HTTP Range：PMTiles 需要。
- MVT 专用响应头：`.pbf/.mvt` 通常需要正确处理 `Content-Type`、`Content-Encoding`、`ETag`、`Cache-Control`。
- WMTS Capabilities 解析：天地图、腾讯、NASA GIBS、很多政企 GIS 服务可通过 GetCapabilities 获取层和矩阵。

## 推荐优先级总表

| 优先级 | 图源/体系 | 类型 | 可直接用现有模板 | Token | 代理建议 | 缓存建议 | 备注 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| P0 | 天地图 `*_w` WMTS | 栅格/WMTS | 是 | 是 | 直连 | 可缓存 | 国内官方，优先补齐 |
| P0 | ArcGIS World Imagery | 栅格 XYZ/REST | 是 | 多数公开源不需要 | 直连 | 可缓存 | 全球影像质量稳定 |
| P0 | CARTO Basemaps | 栅格/Style | 是 | 视用途 | 直连 | 可缓存 | 适合数据叠加底图 |
| P0 | Google `vt?lyrs=` 变体 | 栅格 XYZ | 是 | 否 | 代理池 | 谨慎缓存 | 非官方，适合内部使用 |
| P1 | MapTiler | 栅格/矢量 | 栅格可直接，矢量需改造 | 是 | 直连或代理 | 可缓存 | 文档完善，适合矢量主路线 |
| P1 | Mapbox | 栅格/矢量 | 栅格可直接，矢量需改造 | 是 | 直连或代理 | 遵守条款 | 商业能力强，成本和 SDK 条款需评估 |
| P1 | Stadia Maps/Stamen | 栅格/矢量 | 栅格基本可直接 | 是 | 直连 | 可缓存 | 样式丰富，适合补充视觉风格 |
| P1 | HERE | 栅格/矢量 | 部分可直接 | 是 | 直连或代理 | 遵守条款 | 商业地图，国际覆盖好 |
| P1 | 腾讯位置服务 WMTS | 栅格/WMTS | 可通过 KVP 模板 | 是 | 直连 | 可缓存 | 国内官方，需要验证矩阵和 Key |
| P2 | Google 官方 Map Tiles API | 栅格/2D/3D | 需适配器 | 是 | 代理池 | 严格按政策 | 合规路线，但有 session token |
| P2 | Bing/Azure Maps | 栅格 | 需 `{quadkey}` 或适配器 | 是 | 直连或代理 | 遵守条款 | 传统 Bing 用 quadkey |
| P2 | RainViewer/NASA GIBS/OpenWeatherMap | 叠加专题 | 多数需适配器 | 多数需要 | 直连 | 短 TTL | 天气、遥感专题叠加 |
| P2 | OSMF Shortbread Vector Tiles | 矢量 | 需矢量改造 | 否/视服务 | 直连 | 谨慎缓存 | 官方轻量矢量路线，适合研究和低流量验证 |
| P3 | OpenMapTiles/PMTiles 自托管 | 矢量 | 需矢量改造 | 否/自管 | 直连 | 可缓存 | 长期最佳自主路线 |

## 国内图源调研

### 1. 高德地图

当前系统已内置：

```text
高德卫星：
https://wprd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&style=6&x={x}&y={y}&z={z}&scl={scale}

高德道路：
https://wprd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&style=8&x={x}&y={y}&z={z}&scl=1
```

可继续补充：

| 图源 | 建议 ID | 用途 | 说明 |
| --- | --- | --- | --- |
| 高德标准图 | `amap-standard` | 国内街道底图 | 可作为默认国内矢量风格栅格底图 |
| 高德卫星 | `amap-satellite` | 影像 | 已有 |
| 高德路网叠加 | `amap-road` | 影像标注叠加 | 已有 |
| 高德实时路况 | `amap-traffic` | 交通专题 | 官方 JSAPI 有 `TileLayer.Traffic`，直接瓦片模板稳定性需验证 |

注意：

- 高德官方 JS API 明确提供 `TileLayer`、`TileLayer.Satellite`、`TileLayer.RoadNet`、`TileLayer.Traffic`、`TileLayer.WMS`、`TileLayer.WMTS`、`TileLayer.Flexible` 等能力。
- 当前使用的直接瓦片 URL 更偏工程经验，并非面向第三方长期承诺的稳定开放 API。后台应增加“接入方式：官方 SDK / 非官方瓦片 URL”的合规字段。
- 高德国内坐标通常是 GCJ-02。前台定位和 KML 坐标转换已部分处理，但多源混合时仍应在图源中标记坐标偏移策略。

资料：

- 高德 JS API 图层参考：https://lbs.amap.com/api/javascript-api/reference/layer
- 高德 JS API 2.0 概述：https://lbs.amap.com/api/javascript-api-v2

### 2. 天地图

天地图是最值得优先补充的国内官方图源。其 WMTS 服务常见为：

```text
https://t{s}.tianditu.gov.cn/{layer}_w/wmts?
SERVICE=WMTS&
REQUEST=GetTile&
VERSION=1.0.0&
LAYER={layerName}&
STYLE=default&
TILEMATRIXSET=w&
FORMAT=tiles&
TILEMATRIX={z}&
TILEROW={y}&
TILECOL={x}&
tk={tk}
```

当前系统没有 `{layer}`、`{token}` 占位符，但可以直接创建多个固定模板的图源。

推荐首批新增：

| 图源 | 建议 ID | layer path | LAYER | 类型 | 用途 |
| --- | --- | --- | --- | --- | --- |
| 天地图矢量底图 | `tianditu-vec` | `vec_w` | `vec` | 栅格 WMTS | 街道/行政底图 |
| 天地图矢量注记 | `tianditu-cva` | `cva_w` | `cva` | 栅格 WMTS | 中文注记叠加 |
| 天地图影像底图 | `tianditu-img` | `img_w` | `img` | 栅格 WMTS | 国内影像 |
| 天地图影像注记 | `tianditu-cia` | `cia_w` | `cia` | 栅格 WMTS | 影像中文注记 |
| 天地图地形底图 | `tianditu-ter` | `ter_w` | `ter` | 栅格 WMTS | 地形 |
| 天地图地形注记 | `tianditu-cta` | `cta_w` | `cta` | 栅格 WMTS | 地形注记 |

示例模板：

```text
https://t{s}.tianditu.gov.cn/img_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=img&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&tk=YOUR_TK
```

建议图层组合：

- `tianditu-image-hybrid` = `tianditu-img` + `tianditu-cia`
- `tianditu-vector` = `tianditu-vec` + `tianditu-cva`
- `tianditu-terrain` = `tianditu-ter` + `tianditu-cta`

注意：

- `*_w` 是 Web Mercator 体系，适合当前 XYZ/Leaflet/Cesium 底图模型。
- 天地图还有 `*_c` 经纬度投影服务，不建议在当前默认 Web Mercator 地图里混用。
- `tk` 不应长期直接裸写在模板里，后续应支持 `secretParams` 或服务端变量插值。

资料：

- 天地图服务入口：https://lbs.tianditu.gov.cn/server/MapService.html
- OGC WMTS 标准说明：https://www.ogc.org/standards/wmts/

### 3. 腾讯位置服务

腾讯位置服务提供 OGC WMTS 栅格瓦片服务，适合作为国内官方补充源。官方文档明确其 WebService WMTS 是 OGC 标准的栅格瓦片服务。

接入建议：

- 第一阶段不要直接猜测腾讯内部 XYZ URL，优先用官方 WMTS 文档和开发者 Key。
- 后台新增 `wmts-kvp` 类型后，可通过表单字段生成模板：`SERVICE`、`REQUEST`、`VERSION`、`LAYER`、`STYLE`、`TILEMATRIXSET`、`FORMAT`、`TileMatrix`、`TileRow`、`TileCol`、`key`。
- 如果当前要先试点，可创建固定 KVP URL 模板，但要保留“需按 GetCapabilities 校验”的备注。

资料：

- 腾讯位置服务 WMTS：https://lbs.qq.com/service/webService/webServiceGuide/WMTS

### 4. 百度地图

百度地图适合通过官方 JS API 使用，不建议现阶段作为通用 XYZ 图源直接接入当前系统。

原因：

- 百度地图使用 BD-09/百度墨卡托等体系，和当前 EPSG:3857/GCJ-02 混合会有明显偏移风险。
- 直接瓦片 URL 的长期稳定性和合规性不适合作为生产图源目录的基础。
- 如果要接，建议单独做 `providerAdapter=baidu`，在 2D 前端通过百度 SDK 或自定义 CRS 渲染，不要混入默认 Leaflet XYZ。

### 5. 国内政企 GIS 服务

很多国内项目会提供：

- ArcGIS Server MapServer/WMTS
- GeoServer WMTS/WMS
- SuperMap iServer
- 自建 XYZ 静态瓦片

建议后台把这类服务作为“自定义标准服务”支持：

- `xyz-raster`
- `tms-raster`
- `wmts-kvp`
- `arcgis-tile`
- `wms-image`（可后置，WMS 不是标准瓦片网格，需要 bbox 动态参数）

## 国际栅格图源调研

### 1. Google 官方 Map Tiles API

Google 官方 Map Tiles API 提供 2D Tiles、Photorealistic 3D Tiles 和 Street View Tiles。2D Tiles 包括 roadmap、satellite、terrain。官方流程不是一个静态 XYZ URL，而是：

1. 通过 `POST https://tile.googleapis.com/v1/createSession?key=YOUR_API_KEY` 创建 session。
2. `createSession` 时指定 `mapType`、`language`、`region` 等。
3. 通过 `GET https://tile.googleapis.com/v1/2dtiles/{z}/{x}/{y}?session=...&key=...` 请求瓦片。

官方 roadmap tiles 的说明是“基于矢量地形数据并由 Google 样式渲染出来的 image tiles”。这不是客户端可自由样式化的 MVT，但质量和合规性比传统 `vt` URL 更适合生产。

需要改造：

- 新增 `providerType=google-map-tiles-api`。
- 新增服务端 session token 管理，按 `mapType + language + region + layerTypes + overlay + scale` 缓存 session。
- 图源请求不直接从模板拼 URL，而是先解析/刷新 session。
- 后台缓存策略必须参考 Google Map Tiles API policies，不能默认无限期缓存。

资料：

- Google Map Tiles API 概览：https://developers.google.com/maps/documentation/tile
- 2D Tiles 概览：https://developers.google.com/maps/documentation/tile/2d-tiles-overview
- Session token：https://developers.google.com/maps/documentation/tile/session_tokens
- Roadmap tiles：https://developers.google.com/maps/documentation/tile/roadmap
- Satellite tiles：https://developers.google.com/maps/documentation/tile/satellite
- Terrain tiles：https://developers.google.com/maps/documentation/tile/terrain
- Policies：https://developers.google.com/maps/documentation/tile/policies

### 2. Google 传统 `vt?lyrs=` URL 参数玩法

当前系统使用的是传统 `https://www.google.com/maps/vt?...` 或 `https://mt{s}.google.com/vt?...`。它工程上常见，但不是官方 Map Tiles API。

常见模板：

```text
https://mt{s}.google.com/vt?lyrs={lyrs}&hl=zh-CN&gl=cn&x={x}&y={y}&z={z}&scale={scale}
```

常见 `lyrs` 参数：

| lyrs | 含义 | 建议图源 ID | 备注 |
| --- | --- | --- | --- |
| `m` | 标准道路图 | `google-road` | 当前已有类似 |
| `r` | 替代道路图/旧样式道路图 | `google-road-alt` | 样式可能变化 |
| `s` | 卫星影像 | `google-satellite` | 当前已有 |
| `y` | 卫星 + 道路注记混合 | `google-hybrid` | 可直接作为单图源，也可用 `s+h` 分层 |
| `h` | 道路和注记叠加 | `google-labels` | 适合叠加到影像 |
| `p` | 地形 + 道路 | `google-terrain-road` | 户外/地形场景 |
| `t` | 地形/阴影 | `google-terrain` | 可和注记组合 |

可组合玩法：

- `google-satellite-labels`：`lyrs=y`，单图源混合。
- `google-satellite-custom-hybrid`：`google-satellite` + `google-labels`，后台分别控制透明度。
- `google-terrain-hybrid`：`lyrs=p` 或 `google-terrain` + `google-labels`。
- `google-road-cn`：`lyrs=m&hl=zh-CN&gl=cn`。
- `google-road-en`：`lyrs=m&hl=en&gl=us`。

常见参数：

| 参数 | 用途 | 建议后台字段 |
| --- | --- | --- |
| `lyrs` | 图层类型 | `providerOptions.lyrs` |
| `hl` | 标签语言 | `language` |
| `gl` | 地区/国家上下文 | `region` |
| `scale` | 高清倍率 | `retina` / `{scale}` |
| `x/y/z` | XYZ 瓦片坐标 | 当前已支持 |
| `s` | 服务器/版本相关参数，常见 URL 会出现 | 不建议暴露给普通管理员 |
| `@189` | 版本提示，如 `s@189` | 不稳定，建议作为模板的一部分 |

风险：

- 不是 Google 官方面向第三方的瓦片 API。
- 参数含义可能变化，版本号可能失效。
- 商用合规风险高。
- 建议仅用于内部、低风险、可替换场景；后台需要标注“非官方图源”。

资料：

- Google Maps JavaScript API Map Types：https://developers.google.com/maps/documentation/javascript/maptypes
- 非官方参数参考 1：https://dev.to/yangholmes/google-maps-tms-service-parameter-analysis-1blb
- 非官方参数参考 2：https://gist.github.com/bokub/dd85ffe1368bb10396f871111dff7201

### 3. OpenStreetMap 官方瓦片

模板：

```text
https://tile.openstreetmap.org/{z}/{x}/{y}.png
```

定位：

- 适合开发、测试、低流量场景。
- 不适合直接作为生产高流量底图，尤其不能批量预缓存或大规模代理缓存。

注意：

- 必须保留 OSM attribution。
- 不应隐藏来源，不应大量下载。
- 生产建议使用 MapTiler、Stadia、Mapbox、Thunderforest、自建 OpenMapTiles 等替代。

资料：

- OSM Tile Usage Policy：https://operations.osmfoundation.org/policies/tiles/

### 4. ArcGIS / Esri

常见 ArcGIS REST 瓦片服务 URL 形态：

```text
https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}
```

推荐图源：

| 图源 | 建议 ID | 用途 |
| --- | --- | --- |
| World Imagery | `arcgis-world-imagery` | 全球影像 |
| World Street Map | `arcgis-world-street` | 街道底图 |
| World Topographic Map | `arcgis-world-topo` | 地形/综合底图 |
| World Terrain / Hillshade | `arcgis-terrain` | 地形阴影 |

注意：

- ArcGIS REST 的路径常见为 `{z}/{y}/{x}`，当前模板可以手动调换 `{x}`、`{y}` 顺序。
- ArcGIS 也有 VectorTileServer，需要矢量支持后再接。

资料：

- ArcGIS TileLayer 说明：https://developers.arcgis.com/javascript/latest/references/core/layers/TileLayer/
- ArcGIS Static Basemap Tiles：https://developers.arcgis.com/rest/static-basemap-tiles/

### 5. MapTiler

MapTiler 同时提供栅格、矢量、TileJSON、WMTS Capabilities 和样式服务，适合作为本项目矢量化主路线之一。

栅格示例：

```text
https://api.maptiler.com/maps/streets-v2/{z}/{x}/{y}.png?key=YOUR_KEY
https://api.maptiler.com/tiles/satellite-v4/{z}/{x}/{y}.jpg?key=YOUR_KEY
```

TileJSON：

```text
https://api.maptiler.com/maps/{mapId}/256/tiles.json?key=YOUR_KEY
https://api.maptiler.com/tiles/{tilesId}/tiles.json?key=YOUR_KEY
```

推荐图源：

- `maptiler-streets`
- `maptiler-basic`
- `maptiler-outdoor`
- `maptiler-satellite`
- `maptiler-topo`
- `maptiler-openmaptiles-vector`

资料：

- MapTiler Maps API：https://docs.maptiler.com/cloud/api/maps/
- MapTiler Tiles API：https://docs.maptiler.com/cloud/api/tiles/
- MapTiler GL Style Sources：https://docs.maptiler.com/gl-style-specification/sources/

### 6. Mapbox

Mapbox 提供 Raster Tiles、Static Tiles、Vector Tiles、样式和卫星影像。

栅格示例：

```text
https://api.mapbox.com/styles/v1/mapbox/satellite-v9/tiles/256/{z}/{x}/{y}?access_token=YOUR_TOKEN
```

矢量 API 形态：

```text
https://api.mapbox.com/v4/{tileset_id}/{z}/{x}/{y}.mvt?access_token=YOUR_TOKEN
```

推荐图源：

- `mapbox-satellite`
- `mapbox-streets`
- `mapbox-outdoors`
- `mapbox-light`
- `mapbox-dark`
- `mapbox-navigation-day`
- `mapbox-navigation-night`

注意：

- Mapbox 商业条款、Token 限制和缓存策略必须在后台标注。
- Mapbox 矢量要配合 style JSON 和 `source-layer` 使用，不是单 URL 就能渲染完整底图。

资料：

- Mapbox Raster Tiles API：https://docs.mapbox.com/api/maps/raster-tiles/
- Mapbox Static Tiles API：https://docs.mapbox.com/api/maps/static-tiles/
- Mapbox Vector Tiles API：https://docs.mapbox.com/api/maps/vector-tiles/
- Mapbox Satellite：https://docs.mapbox.com/data/tilesets/reference/mapbox-satellite/

### 7. Stadia Maps / Stamen

Stadia Maps 承接了 Stamen 风格，并提供栅格和矢量瓦片。适合补充视觉差异明显的底图：

- Stamen Toner
- Stamen Terrain
- Stamen Watercolor
- Alidade Smooth
- Outdoors
- OSM Bright

栅格模板示例：

```text
https://tiles.stadiamaps.com/tiles/alidade_smooth/{z}/{x}/{y}.png?api_key=YOUR_KEY
```

当前系统不支持 `{r}` retina 后缀，建议先用 256 图；后续补 `retina.mode=suffix` 后支持 `@2x`。

资料：

- Stadia Raster Tiles：https://docs.stadiamaps.com/raster/
- Stadia Vector Tiles：https://docs.stadiamaps.com/vector/
- Stamen migration：https://docs.stadiamaps.com/guides/migrating-from-stamen-map-tiles/

### 8. CARTO Basemaps

CARTO 底图非常适合数据可视化叠加：

- Positron：浅色底图
- Dark Matter：深色底图
- Voyager：彩色综合底图

常见模板：

```text
https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png
https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png
https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png
```

建议新增：

- `carto-positron`
- `carto-dark-matter`
- `carto-voyager`
- `carto-positron-labels`
- `carto-voyager-labels-under`

注意：

- CARTO 文档提到商业使用需要 Enterprise license；后台应有授权备注。
- 作为默认全球街道图，比 OSM 官方 tile 更适合产品内置候选。

资料：

- CARTO Basemaps：https://carto.com/basemaps/
- CARTO basemap styles：https://github.com/cartodb/basemap-styles
- CARTO React basemaps：https://docs.carto.com/carto-for-developers/carto-for-react/guides/basemaps

### 9. HERE

HERE 提供商业地图渲染、Raster Tile API、Vector Tile API。适合国际化、车载、物流、企业地图场景。

接入建议：

- 如果只要底图，先接 raster tile。
- 如果要高质量矢量和多语言，后续接 vector tile。
- Token/API Key 需要服务端保存。

资料：

- HERE Raster Tile API 迁移说明：https://docs.here.com/map-rendering/docs/migration-guide-raster-tile-api
- HERE Vector Tile API：https://www.here.com/docs/bundle/vector-tile-api-developer-guide/page/topics/quick-start.html

### 10. Bing / Azure Maps

Bing 传统瓦片体系使用 QuadKey，不适合当前只支持 `{x}/{y}/{z}` 的模板。Azure Maps 新 API 则更偏官方现代路线。

需要改造：

- 新增 `{quadkey}` 占位符，或新增 `providerAdapter=bing`。
- 后台按 `{z}/{x}/{y}` 计算 quadkey。
- 支持 Azure Maps `tilesetId`、subscription key、API 版本。

资料：

- Bing Maps Tile System：https://learn.microsoft.com/en-us/bingmaps/articles/bing-maps-tile-system
- Azure Maps Render Get Map Tile：https://learn.microsoft.com/en-us/rest/api/maps/render/get-map-tile

### 11. Thunderforest / OpenTopoMap / MapQuest 等

适合作为专题或补充底图：

| 图源 | 用途 | 注意 |
| --- | --- | --- |
| Thunderforest | Outdoors、Landscape、Transport、Cycle | 需要 API key，适合户外/交通 |
| OpenTopoMap | 地形图 | 免费但限流，生产需谨慎 |
| MapQuest | 商业地图服务 | 需要 Key 和条款评估 |
| Geoapify | OSM 商业瓦片服务 | 需要 Key |

## 专题叠加图源

这些不一定作为底图，但非常适合做 overlay：

| 图源 | 类型 | 接入方式 | 典型用途 | 备注 |
| --- | --- | --- | --- | --- |
| OpenWeatherMap | 栅格 overlay | XYZ + appid | 云、降水、温度、风、气压 | TTL 短 |
| RainViewer | 栅格 overlay | 先取 metadata 再按时间请求 | 雷达降水 | 需要时间适配器 |
| NASA GIBS | WMTS | WMTS KVP/REST | 遥感、自然灾害、云图 | 常带 TIME 参数 |
| OpenSeaMap | 栅格 overlay | XYZ | 航海标记 | attribution |
| OpenRailwayMap | 栅格 overlay | XYZ | 铁路专题 | attribution |
| USGS / NOAA | ArcGIS/WMS/WMTS | 视服务而定 | 美国地形、气象、海洋 | 区域性强 |

建议后续在后台把图层类型拆成：

- `base`：底图，只能单选。
- `overlay`：叠加图层，可多选。
- `annotation`：注记叠加，跟随底图组合。
- `thematic`：专题图层，带时间、透明度和图例。

## 矢量图源深入分析

### 什么是矢量图源

栅格图源返回 PNG/JPEG/WebP 图片，浏览器只负责贴图。矢量图源返回几何和属性数据，浏览器根据样式实时渲染。

主流矢量瓦片格式是 **Mapbox Vector Tile (MVT)**，通常为 `.mvt` 或 `.pbf`。完整矢量底图通常由三部分组成：

1. **Vector Tiles**：`/{z}/{x}/{y}.pbf`，包含道路、水系、建筑、边界、POI 等 source layers。
2. **Style JSON**：MapLibre/Mapbox Style Spec，定义颜色、线宽、字体、显示层级、过滤规则。
3. **Glyphs / Sprites**：字体切片和图标雪碧图，支撑文字和 POI 图标。

矢量底图优势：

- 高清屏不糊，缩放和旋转效果更好。
- 可动态切换日间/夜间/浅色/深色/行政/户外风格。
- 可控制标签语言、隐藏 POI、突出道路等级。
- 数据和样式分离，同一套数据可复用多种主题。
- 瓦片体积通常更可控，适合长期缓存。

矢量底图成本：

- 前端必须引入 WebGL 矢量渲染引擎，Leaflet 原生不够。
- 需要管理 Style JSON、source-layer、glyphs、sprites。
- 3D Cesium 当前底图链路更偏 raster imagery，矢量底图需要 fallback 或额外适配。
- 服务端代理缓存要正确处理 gzip/br、MIME、TileJSON URL 重写和跨域。

资料：

- Mapbox Vector Tile Spec：https://github.com/mapbox/vector-tile-spec
- MVT 2.1 规范：https://github.com/mapbox/vector-tile-spec/blob/master/2.1/README.md
- MapLibre GL JS：https://www.maplibre.org/maplibre-gl-js/docs/
- MapLibre Style Spec Sources：https://www.maplibre.org/maplibre-style-spec/sources/
- MapLibre Style Spec Layers：https://www.maplibre.org/maplibre-style-spec/layers/

### 可用矢量图源

| 图源 | 类型 | 推荐程度 | 说明 |
| --- | --- | --- | --- |
| MapTiler / OpenMapTiles | MVT + Style JSON | 高 | 最适合作为首个矢量 PoC |
| Mapbox Vector Tiles | MVT + Style JSON | 高 | 商业能力强，Token 和成本需评估 |
| Stadia Vector | MVT，OpenMapTiles schema compatible | 高 | 支持 MapLibre，样式路线友好 |
| HERE Vector Tile API | 商业矢量 | 中高 | 国际化和企业场景好 |
| Esri VectorTileServer | Esri vector tile | 中高 | ArcGIS 生态强，需适配 Esri style |
| OpenMapTiles 自托管 | MVT/MBTiles | 高 | 可控性强，运维成本高 |
| Protomaps / PMTiles | 单文件矢量瓦片 | 高 | 静态托管、低运维、适合离线/区域包 |
| OSMF Shortbread Vector Tiles | MVT + Shortbread schema | 中 | OSM 官方轻量矢量路线，适合研究和低流量验证 |
| Google Map Tiles API Roadmap | image tiles based on vector data | 中 | 质量好但不是客户端 MVT，不能自由改样式 |

### 矢量图源接入形态对比

矢量图源不应该只按“一个 URL 模板”管理。实际接入时至少有四种形态：

| 形态 | 入口 | 前端渲染 | 服务端职责 | 适合场景 |
| --- | --- | --- | --- | --- |
| MVT URL 模板 | `/{z}/{x}/{y}.pbf` | MapLibre/OpenLayers 自行配置 source/layers | 鉴权、代理、缓存、日志 | 单数据源、样式由项目自管 |
| TileJSON | `tiles.json` | MapLibre 读取 `tiles/bounds/minzoom/maxzoom` | 拉取并重写 tiles URL | 商业托管矢量源、QGIS 兼容 |
| Style JSON | `style.json` | MapLibre 完整加载底图样式 | 重写 sources/glyphs/sprite/tiles | 完整矢量底图首选 |
| PMTiles | `.pmtiles` | MapLibre `pmtiles://` protocol | 静态托管或 Range 代理 | 离线包、区域包、低运维自托管 |

项目首个矢量 PoC 建议选择 **Style JSON 入口**，因为完整底图不只是瓦片数据，还需要样式、字体和图标；如果只接 MVT URL，前端仍要手写大量 layer 规则，验证成本反而更高。

### 推荐矢量 PoC 候选

| 候选 | 推荐程度 | 原因 | 主要验证点 |
| --- | --- | --- | --- |
| MapTiler Streets/Basic Vector | 高 | 文档完整、MapLibre 兼容、同时有栅格 fallback | Style JSON 代理、Token 服务端保存、glyph/sprite 重写 |
| Stadia Outdoors/OSM Bright Vector | 高 | MapLibre 友好，适合验证 OSM 风格矢量底图 | API Key、OpenMapTiles schema、retina/语言 |
| OpenMapTiles + TileServer GL | 高 | 自主可控，便于以后做私有部署 | MBTiles 服务、样式版本、服务端缓存 |
| Protomaps PMTiles | 中高 | 单文件托管，适合离线和区域包 | HTTP Range、CORS、CDN 缓存、PMTiles 协议 |
| OSMF Shortbread Vector | 中 | 代表 OSM 官方轻量 schema，适合理解开放生态方向 | 使用政策、schema 差异、低流量测试 |

不建议把 Mapbox 作为第一个 PoC，原因不是能力不足，而是 Mapbox 的 SDK、Token、计费和许可边界更复杂；可以等内部矢量管线跑通后，再作为商业候选评估。

### OSMF Shortbread Vector Tiles

OSMF Shortbread 是 OpenStreetMap 官方推进的轻量矢量瓦片 schema。它和 OpenMapTiles 的关系可以理解为：

- OpenMapTiles 更成熟，生态广，图层丰富，适合生产和自托管。
- Shortbread 更轻量，更接近 OSMF 官方矢量路线，适合低流量验证、研究和自建简化底图。

接入建议：

- 不把 OSMF 公共矢量服务作为默认生产图源。
- 后台新增 `schema` 字段，支持 `openmaptiles`、`shortbread`、`custom`，避免前端错误套用 source-layer。
- 如果自托管，可用 Tilemaker/osm2pgsql 等工具生成 Shortbread MVT，再通过 TileServer GL、Martin、tileserver、PMTiles 等方式发布。
- 保留 OSM attribution，并遵守 ODbL 和 OSMF 使用政策。

需要注意：

- Shortbread schema 追求轻量，不一定覆盖业务需要的全部 POI、道路属性和专题标签。
- 用 Shortbread 做底图时，前端 style JSON 不能直接复用 OpenMapTiles 样式，必须按 Shortbread 的 source-layer 和字段改样式。

### PMTiles 值得重点关注

PMTiles 是把瓦片金字塔打包为单个文件的格式，可包含矢量或栅格瓦片。浏览器通过 HTTP Range 请求读取需要的瓦片。

适用场景：

- 离线包、内网部署、区域地图。
- 自托管成本敏感，不想维护 tile server。
- 需要把某个城市、省份、项目区域固化成一个可版本化文件。

接入方式：

- 前端：MapLibre + `pmtiles` protocol。
- 服务端：可只做静态文件托管，或代理 Range 请求。
- 后台：把 PMTiles 当成 `source.kind=pmtiles-vector` 或 `pmtiles-raster`。

资料：

- PMTiles docs：https://docs.protomaps.com/pmtiles/
- PMTiles for MapLibre：https://docs.protomaps.com/pmtiles/maplibre
- MapLibre PMTiles example：https://www.maplibre.org/maplibre-gl-js/docs/examples/pmtiles-source-and-protocol/
- PMTiles GitHub：https://github.com/protomaps/pmtiles

### OpenMapTiles 自托管路线

OpenMapTiles 是基于 OSM 等数据的开放矢量瓦片 schema 和工具链。可以：

- 使用 MapTiler Cloud 直接消费托管数据。
- 下载/生成 MBTiles 后用 TileServer GL 发布。
- 自己用 PostGIS/OSM 数据生成区域矢量瓦片。

推荐路线：

1. 第一阶段用 MapTiler Cloud 或 Stadia Vector 做 PoC，验证 MapLibre 前端。
2. 第二阶段用 OpenMapTiles schema 理解 source-layer 和 style。
3. 第三阶段按区域自托管 MBTiles/PMTiles。

资料：

- OpenMapTiles：https://openmaptiles.org/
- OpenMapTiles schema：https://openmaptiles.org/schema/
- OpenMapTiles docs：https://openmaptiles.org/docs/
- TileServer GL：https://openmaptiles.org/docs/host/tileserver-gl/

## 为支持矢量图源需要怎么改

### 1. 数据模型扩展

当前 `kind` 更偏 raster XYZ。建议扩展：

```json
{
  "kind": "xyz-raster | tms-raster | wmts-raster | arcgis-raster | wms-image | mvt | vector-tilejson | vector-style | pmtiles-vector | pmtiles-raster | google-map-tiles-api",
  "format": "png | jpg | webp | pbf | mvt",
  "tileJsonUrl": "",
  "styleJsonUrl": "",
  "glyphsUrl": "",
  "spritesUrl": "",
  "pmtilesUrl": "",
  "schema": "openmaptiles | shortbread | mapbox-streets-v8 | here | esri | custom",
  "sourceLayers": [],
  "encoding": "gzip | br | identity",
  "projection": "EPSG:3857",
  "coordinateSystem": "EPSG:3857 | GCJ02 | BD09 | EPSG:4326",
  "minZoom": 0,
  "maxZoom": 18,
  "bounds": [-180, -85.051129, 180, 85.051129],
  "attribution": "",
  "requiresAttribution": true,
  "tokenPolicy": {
    "type": "none | query | header | bearer | session",
    "secretRef": "",
    "param": "key"
  },
  "licensePolicy": {
    "officialStatus": "official | unofficial | community | internal",
    "licenseType": "free | api-key | commercial | unknown",
    "termsUrl": "",
    "cacheAllowed": true,
    "publicUseAllowed": false,
    "chinaPublicUseReviewed": false
  },
  "rendering": {
    "clients": ["2d"],
    "engine": "leaflet | maplibre | cesium",
    "fallbackRasterSourceId": ""
  },
  "proxyPolicy": {
    "mode": "direct | proxy | proxy-pool",
    "proxyIds": []
  },
  "cachePolicy": {
    "enabled": true,
    "ttlSeconds": 86400,
    "namespace": "vector"
  },
  "diagnostics": {
    "enabled": true,
    "logCategory": "tile-source"
  }
}
```

需要新增的图源类型：

- `xyz-raster`：现有能力。
- `tms-raster`：TMS Y 轴翻转图源，可复用 `{yTms}`。
- `wmts-raster`：标准 WMTS KVP/REST。
- `arcgis-raster`：ArcGIS MapServer tile。
- `wms-image`：WMS 动态图片，后置支持，适合专题图，不适合标准底图瓦片。
- `mvt`：单纯矢量瓦片 URL。
- `vector-tilejson`：以 TileJSON 为入口的矢量图源。
- `vector-style`：以 style JSON 为入口的完整矢量地图。
- `pmtiles-vector`：PMTiles 矢量。
- `pmtiles-raster`：PMTiles 栅格。
- `google-map-tiles-api`：Google 官方 session 型图源。

建模重点：

- `kind` 表示数据和协议，不再用一个“图层类型”同时表达栅格、矢量、底图、叠加层。
- `schema` 对矢量非常重要，决定前端 style JSON 里可用的 `source-layer` 和字段。
- `licensePolicy.cacheAllowed` 必须参与缓存开关校验，不能只由管理员界面勾选决定。
- `rendering.fallbackRasterSourceId` 用于解决 3D/Cesium 暂不支持客户端矢量底图的问题。
- `tokenPolicy.secretRef` 只指向服务端密钥引用，公开 catalog 不返回真实密钥。

### 2. 服务端接口扩展

建议新增：

```text
GET /api/v1/vector/styles/:styleId/style.json
GET /api/v1/vector/sources/:sourceId/tilejson.json
GET /api/v1/vector/tiles/:sourceId/:z/:x/:y.pbf
GET /api/v1/vector/glyphs/:sourceId/{fontstack}/{range}.pbf
GET /api/v1/vector/sprites/:sourceId/sprite.json
GET /api/v1/vector/sprites/:sourceId/sprite.png
GET /api/v1/vector/pmtiles/:sourceId.pmtiles
```

服务端要做：

- 代理 TileJSON，并把其中 `tiles` URL 重写成本站 `/api/v1/vector/tiles/...`。
- 代理 Style JSON，并把 `sources`、`glyphs`、`sprite` 重写成本站受控 URL。
- 缓存 `.pbf/.mvt` 时保留 `Content-Encoding`、`Content-Type`、`ETag`、`Last-Modified`，避免把压缩后的 PBF 当普通二进制错误二次压缩。
- PMTiles 代理必须支持 `Range`、`If-Range`、`206 Partial Content`、`416 Range Not Satisfiable`，否则性能和兼容性会很差。
- 校验 style JSON 中的外部 URL，禁止任意 URL 绕过 SSRF 防护。
- 限制 Style JSON 允许的源域名和协议，默认只允许本图源配置中的上游域名以及管理员显式允许的 glyph/sprite 域名。
- Token/API Key 只在服务端保存，不返回给前端。
- 图源访问诊断日志要覆盖 TileJSON、Style JSON、MVT、glyph、sprite、PMTiles Range 请求，并记录缓存命中、代理出口、状态码、耗时和上游错误摘要。

### 2.1 样式代理和 URL 重写规则

矢量 Style JSON 是一个“会继续引用外部资源的配置文件”，不能简单原样返回给前端。建议重写策略：

| 字段 | 原始形态 | 重写目标 | 注意 |
| --- | --- | --- | --- |
| `sources.*.url` | `mapbox://...` / `https://.../tiles.json` | `/api/v1/vector/sources/:sourceId/tilejson.json` | `mapbox://` 需适配器，不建议第一阶段支持 |
| `sources.*.tiles[]` | `https://.../{z}/{x}/{y}.pbf` | `/api/v1/vector/tiles/:sourceId/{z}/{x}/{y}.pbf` | 保留 `{z}/{x}/{y}` 占位 |
| `glyphs` | `https://.../{fontstack}/{range}.pbf` | `/api/v1/vector/glyphs/:sourceId/{fontstack}/{range}.pbf` | 字体名必须 URL encode |
| `sprite` | `https://.../sprite` | `/api/v1/vector/sprites/:styleId/sprite` | 要同时代理 `.json` 和 `.png`，以及 `@2x` |
| `metadata` | 服务商自定义 | 可保留但脱敏 | 不保留 token、账号信息 |

后台保存原始 style 后，建议生成内部 `styleVersion`。缓存键和前端 URL 都带版本，管理员改样式后可以立即切换，不需要手动清浏览器缓存。

### 3. 前端渲染路线

当前 2D 使用 Leaflet，3D 使用 Cesium。建议不要强行让 Leaflet 原生渲染 MVT，而是引入 MapLibre。

可选方案：

| 方案 | 描述 | 优点 | 缺点 | 建议 |
| --- | --- | --- | --- | --- |
| A. MapLibre 作为独立 2D 地图引擎 | 2D 主地图从 Leaflet 逐步迁到 MapLibre | 矢量体验最佳 | KML、辅助线、现有交互要迁移 | 中长期最佳 |
| B. Leaflet + MapLibre overlay | 保留 Leaflet 控件，用 MapLibre 渲染底图 | 改动较小 | 双地图同步复杂 | 短期 PoC 可用 |
| C. OpenLayers VectorTile | 换 OpenLayers | GIS 能力强 | 当前代码迁移大 | 不作为首选 |
| D. Leaflet vector tile 插件 | Leaflet 插件渲染 MVT | 改动小 | 标签和复杂样式弱 | 不推荐做完整底图 |

建议：

- 第一阶段做 `MapLibreVectorMap` 试验页或隐藏功能开关，不影响现有 Leaflet。
- 第二阶段抽象地图引擎接口：`MapEngine = leaflet | maplibre`。
- 第三阶段逐步迁移 KML、定位、搜索、辅助线、分享状态。

### 4. 3D 场景处理

Cesium 对传统 ImageryProvider 更适合栅格底图。矢量图源有三种处理方式：

1. **继续使用栅格 fallback**：对矢量 style 用 TileServer GL 服务端渲染成 raster tiles，Cesium 加载 raster。
2. **只在 2D 支持矢量，3D 使用同名 raster 替代源**：图层配置中增加 `clients: ["2d"]` 或 `fallbackRasterSourceId`。
3. **研究 Cesium + MVT 插件/自定义 Primitive**：复杂度高，不建议近期做底图。

建议短期采用第 1 或第 2 种。

### 5. 缓存策略

矢量缓存需要拆分：

- `raw-vector-tile-cache`：缓存 `.pbf/.mvt` 原始瓦片。
- `style-cache`：缓存 style JSON、sprite、glyphs。
- `rendered-raster-cache`：如果服务端把矢量渲染成栅格，要把 `styleId` 纳入缓存键。
- `pmtiles-range-cache`：如果代理 PMTiles，可选缓存文件头、目录和热点 Range；不要把每个 Range 当成独立无限缓存对象。

缓存键建议：

```text
vector:{sourceId}:{z}:{x}:{y}:{format}:{encoding}
style:{styleId}:{version}
glyph:{sourceId}:{fontstack}:{range}
sprite:{styleId}:{pixelRatio}
rendered:{styleId}:{sourceVersion}:{z}:{x}:{y}:{scale}
pmtiles:{sourceId}:{etag}:{rangeStart}:{rangeEnd}
```

缓存规则建议：

- 商业图源默认遵守上游 `Cache-Control`，后台不能绕过许可证强开长缓存。
- 对 MVT/PBF 不做内容改写时，可以缓存压缩原文；一旦服务端改写内容，必须重新计算 `Content-Length`、`ETag` 和压缩。
- Style JSON 和 TileJSON 的 TTL 应短于瓦片 TTL，便于管理员调整样式或密钥后快速生效。
- glyph 和 sprite 变化频率低，可以长 TTL，但缓存键必须包含 style/version/pixelRatio。
- 诊断日志要区分 `cacheHit=raw-vector`、`cacheHit=style`、`cacheHit=glyph`、`cacheHit=sprite`、`cacheHit=pmtiles-range`，避免和现有栅格瓦片缓存混淆。

### 5.1 代理策略

矢量图源与代理池的关系比栅格更复杂，因为一次地图加载会同时请求 style、TileJSON、tiles、glyphs、sprites。建议：

- 图源级代理策略应覆盖该图源派生出的全部资源请求。
- 支持为 glyph/sprite 单独设置 `resourceProxyPolicy`，但第一阶段可以复用图源代理策略。
- 代理诊断日志记录 `resourceType`：`style`、`tilejson`、`mvt`、`glyph`、`sprite`、`pmtiles`。
- 如果一个图源关联多个代理，第一阶段只需要支持“按顺序故障切换”或“简单轮询”，不急着做最优路由。
- 某个代理失败时，错误上下文要写入图源访问日志，字段包括 `proxyId`、`attempt`、`upstreamStatus`、`durationMs`、`errorCode`。

### 6. 后台管理能力

新增矢量图源后，后台需要：

- 图源类型选择：栅格 XYZ、WMTS、ArcGIS、MVT、Style JSON、PMTiles。
- TileJSON URL 输入和测试。
- Style JSON URL 输入、解析、预览。
- source-layer 列表解析，显示可用图层。
- glyphs/sprite 可达性测试。
- style JSON 安全扫描：外链域名、HTTP 协议、内网地址、Token 泄露。
- MapLibre 预览面板。
- 样式版本管理：同一矢量数据支持多个样式。
- License/合规字段：官方状态、条款链接、attribution、是否允许缓存、是否允许公开发布、国内公开商用是否已审查。
- 坐标和偏移字段：投影、坐标系、纠偏策略、适用区域。

后台测试按钮建议拆成：

- `测试入口`：Style JSON/TileJSON 是否能拉取。
- `测试瓦片`：按默认 z/x/y 请求一个 MVT 或 PNG。
- `测试资源`：glyph/sprite 是否可达。
- `安全扫描`：外链、内网地址、敏感参数、HTTP 明文。
- `渲染预览`：用 MapLibre 加载代理后的 style。

### 7. 对外 API 扩展

对外发布项应支持：

- 发布 raster XYZ：现有。
- 发布 TileJSON：`/api/v1/external/:publishId/tilejson`
- 发布 MVT：`/api/v1/external/:publishId/:z/:x/:y.pbf`
- 发布 Style JSON：`/api/v1/external/:publishId/style.json`
- 发布 PMTiles：`/api/v1/external/:publishId.pmtiles` 或 Range 代理。
- 发布栅格 fallback：`/api/v1/external/:publishId/raster/:z/:x/:y.png`，用于不支持矢量的客户端或 3D 场景。

外部客户端示例要补：

- MapLibre GL JS
- OpenLayers VectorTile
- QGIS XYZ/Vector Tile
- Leaflet + MapLibre plugin

对外发布的关键规则：

- 发布项可以引用系统已有图源或单独配置上游，但最终必须统一进入同一套代理、缓存、日志和密钥脱敏逻辑。
- 对外发布 Style JSON 时，必须把 style 内所有上游 URL 改写成发布项 URL，不能暴露内部 sourceId 或服务商 token。
- 对外发布 MVT 时，响应头至少包含正确 `Content-Type`、`Content-Encoding`、`Cache-Control`。
- 对外 API 的日志保留策略继续和图源访问日志分开控制，但字段结构尽量对齐，方便排查同一上游图源在内部/外部两条链路的差异。

## 推荐实施路线

### 阶段 1：快速丰富栅格图源

新增图源：

- 天地图：`vec/cva/img/cia/ter/cta`
- ArcGIS World Imagery
- CARTO Positron/Dark Matter/Voyager
- Google `lyrs` 全套变体
- OpenTopoMap
- OSM 测试源

后台改动：

- 增加图源“官方/非官方/内部测试”标识。
- 增加 Token 敏感字段，不再把 `tk/key/token` 硬写在模板字符串里。
- 增加 `retina.mode=suffix`，支持 `@2x`。
- 增加 `{format}`、`{token}`、`{layer}`、`{style}` 占位符。

### 阶段 2：标准协议适配

新增：

- `wmts-kvp` 类型。
- `arcgis-tile` 类型。
- `{quadkey}` 支持。
- Google 官方 Map Tiles API session 适配。
- `secretRef` 密钥引用和服务端变量插值，替代把 token 写进 URL 模板。

价值：

- 腾讯 WMTS、天地图 WMTS、NASA GIBS、Azure/Bing 等可以更规范地进后台。

### 阶段 3：矢量 PoC

目标：

- 用 MapLibre GL JS 加载一个 MapTiler 或 Stadia Vector 图源，优先走 Style JSON 入口。
- 支持服务端代理 TileJSON、Style JSON 和 MVT。
- 后台只做最小配置：styleJsonUrl、secretRef、attribution、代理、缓存、licensePolicy。
- 图源访问日志覆盖 style、tilejson、mvt、glyph、sprite 请求。

验收：

- 2D 页面可选择矢量底图。
- 标签清晰、缩放旋转正常。
- Token 不出现在前端。
- MVT 请求进入图源访问日志。
- 禁用图源后矢量瓦片不可访问。
- 关闭缓存后所有矢量派生资源都绕过本地缓存；开启缓存后日志能区分资源类型命中。

### 阶段 4：矢量正式化

目标：

- 完整 MapLibre 地图引擎。
- 图层组合支持 raster + vector + overlay。
- style 管理和预览。
- 外部发布支持 TileJSON/Style JSON。
- 3D 使用 raster fallback。
- 支持 `schema` 管理和 source-layer 检查，避免样式与数据 schema 不匹配导致空白地图。
- 支持多语言标签、主题切换、POI 显隐、道路等级显隐等样式级能力。

### 阶段 5：自托管与离线

目标：

- OpenMapTiles + TileServer GL。
- PMTiles 上传和托管。
- 区域地图包版本管理。
- 按区域/城市裁剪图源。
- 可选支持 Shortbread schema，自建轻量 OSM 矢量底图。
- 对象存储/CDN 的 Range、CORS、缓存策略检查。

## 首批建议添加的图源清单

### 国内优先

| ID | 名称 | 模板/入口 | 图层组合 |
| --- | --- | --- | --- |
| `tianditu-img` | 天地图影像 | `t{s}.tianditu.gov.cn/img_w/wmts?...` | `tianditu-image-hybrid` |
| `tianditu-cia` | 天地图影像注记 | `t{s}.tianditu.gov.cn/cia_w/wmts?...` | `tianditu-image-hybrid` |
| `tianditu-vec` | 天地图矢量底图栅格版 | `t{s}.tianditu.gov.cn/vec_w/wmts?...` | `tianditu-vector` |
| `tianditu-cva` | 天地图矢量注记 | `t{s}.tianditu.gov.cn/cva_w/wmts?...` | `tianditu-vector` |
| `tianditu-ter` | 天地图地形 | `t{s}.tianditu.gov.cn/ter_w/wmts?...` | `tianditu-terrain` |
| `tianditu-cta` | 天地图地形注记 | `t{s}.tianditu.gov.cn/cta_w/wmts?...` | `tianditu-terrain` |

### 国际优先

| ID | 名称 | 模板/入口 | 备注 |
| --- | --- | --- | --- |
| `arcgis-world-imagery` | ArcGIS 全球影像 | `services.arcgisonline.com/.../World_Imagery/...` | 影像补充 |
| `carto-positron` | CARTO Positron | `basemaps.cartocdn.com/light_all/...` | 浅色数据底图 |
| `carto-dark-matter` | CARTO Dark Matter | `basemaps.cartocdn.com/dark_all/...` | 深色数据底图 |
| `carto-voyager` | CARTO Voyager | `basemaps.cartocdn.com/rastertiles/voyager/...` | 彩色通用底图 |
| `osm-standard-dev` | OSM 官方测试源 | `tile.openstreetmap.org/...` | 仅低流量测试 |
| `opentopomap` | OpenTopoMap | `tile.opentopomap.org/...` | 户外地形 |
| `google-hybrid` | Google 卫星混合 | `lyrs=y` | 非官方 |
| `google-labels` | Google 道路注记 | `lyrs=h` | 非官方，适合叠加 |
| `google-terrain` | Google 地形 | `lyrs=p/t` | 非官方 |

### 矢量 PoC

| ID | 名称 | 类型 | 入口 |
| --- | --- | --- | --- |
| `maptiler-streets-vector` | MapTiler Streets Vector | `vector-style` | MapTiler style JSON |
| `stadia-outdoors-vector` | Stadia Outdoors Vector | `vector-style` | Stadia style/vector docs |
| `openmaptiles-selfhost` | OpenMapTiles 自托管 | `vector-style` | TileServer GL style JSON |
| `protomaps-pmtiles` | Protomaps PMTiles | `pmtiles-vector` | `.pmtiles` URL |
| `osm-shortbread-vector` | OSMF Shortbread Vector | `mvt` / `vector-style` | Shortbread MVT/Style JSON |

## 需要补充的后台字段

建议近期补字段：

```json
{
  "kind": "xyz-raster | wmts-raster | arcgis-raster | vector-style | vector-tilejson | mvt | pmtiles-vector",
  "officialStatus": "official | unofficial | community | internal",
  "licenseType": "free | api-key | commercial | unknown",
  "termsUrl": "",
  "requiresAttribution": true,
  "attribution": "",
  "coordinateSystem": "EPSG:3857 | GCJ02 | BD09 | EPSG:4326",
  "schema": "openmaptiles | shortbread | mapbox-streets-v8 | here | esri | custom",
  "styleJsonUrl": "",
  "tileJsonUrl": "",
  "glyphsUrl": "",
  "spritesUrl": "",
  "sourceLayers": [],
  "secretRefs": [
    { "name": "tk", "placement": "query", "param": "tk" }
  ],
  "templatePlaceholders": ["s", "x", "y", "z", "scale", "token", "quadkey", "time"],
  "adapter": "template | wmts | arcgis | google-map-tiles | bing-quadkey | vector-style | pmtiles",
  "cacheAllowedByLicense": true,
  "publicUseAllowed": false,
  "chinaPublicUseReviewed": false,
  "fallbackRasterSourceId": ""
}
```

## 风险与治理建议

1. **合规风险**：Google `vt`、高德直接瓦片、百度直接瓦片、部分社区整理 URL 都应标记为非官方。
2. **缓存风险**：商业服务可能限制缓存、预取和离线保存，后台要有 `cacheAllowedByLicense` 字段。
3. **密钥风险**：所有 `key/tk/token/appid` 应服务端保存，公开 catalog 不返回。
4. **代理风险**：海外图源走代理池时，诊断日志应记录代理出口、耗时、状态码、缓存命中。
5. **坐标风险**：不同坐标系混合会造成叠加偏移。图源必须标记坐标系和纠偏策略。
6. **前端复杂度风险**：矢量图源不要直接塞进现有 Leaflet tileLayer；应引入 MapLibre 并做地图引擎抽象。
7. **国内地图合规风险**：境外图源和 OSM 衍生图源在国内公开展示时，可能存在国界、海域、地名、审图号和测绘资质问题；对公众开放前必须单独评估。
8. **样式供应链风险**：Style JSON 可引用外部 glyph/sprite/tile URL，服务端必须做 URL 重写、域名白名单和 SSRF 防护。
9. **许可证归因风险**：OSM/ODbL、CARTO、MapTiler、Mapbox、Stadia、HERE、Esri 的 attribution 和缓存条款不同，后台应强制展示和继承 attribution。

## 资料来源

- Google Map Tiles API：https://developers.google.com/maps/documentation/tile
- Google 2D Tiles：https://developers.google.com/maps/documentation/tile/2d-tiles-overview
- Google Roadmap Tiles：https://developers.google.com/maps/documentation/tile/roadmap
- Google Satellite Tiles：https://developers.google.com/maps/documentation/tile/satellite
- Google Terrain Tiles：https://developers.google.com/maps/documentation/tile/terrain
- Google Session Tokens：https://developers.google.com/maps/documentation/tile/session_tokens
- Google Map Types：https://developers.google.com/maps/documentation/javascript/maptypes
- Mapbox Raster Tiles API：https://docs.mapbox.com/api/maps/raster-tiles/
- Mapbox Static Tiles API：https://docs.mapbox.com/api/maps/static-tiles/
- Mapbox Vector Tiles API：https://docs.mapbox.com/api/maps/vector-tiles/
- Mapbox Vector Tile Spec：https://github.com/mapbox/vector-tile-spec
- MapLibre GL JS：https://www.maplibre.org/maplibre-gl-js/docs/
- MapLibre Style Spec Sources：https://www.maplibre.org/maplibre-style-spec/sources/
- MapTiler Maps API：https://docs.maptiler.com/cloud/api/maps/
- MapTiler Tiles API：https://docs.maptiler.com/cloud/api/tiles/
- OpenMapTiles：https://openmaptiles.org/
- OpenMapTiles Schema：https://openmaptiles.org/schema/
- TileServer GL：https://openmaptiles.org/docs/host/tileserver-gl/
- PMTiles：https://docs.protomaps.com/pmtiles/
- PMTiles for MapLibre：https://docs.protomaps.com/pmtiles/maplibre
- Stadia Raster Tiles：https://docs.stadiamaps.com/raster/
- Stadia Vector Tiles：https://docs.stadiamaps.com/vector/
- CARTO Basemaps：https://carto.com/basemaps/
- CARTO basemap styles：https://github.com/cartodb/basemap-styles
- OSM Tile Usage Policy：https://operations.osmfoundation.org/policies/tiles/
- ArcGIS TileLayer：https://developers.arcgis.com/javascript/latest/references/core/layers/TileLayer/
- ArcGIS Static Basemap Tiles：https://developers.arcgis.com/rest/static-basemap-tiles/
- HERE Raster Tile API：https://docs.here.com/map-rendering/docs/migration-guide-raster-tile-api
- HERE Vector Tile API：https://www.here.com/docs/bundle/vector-tile-api-developer-guide/page/topics/quick-start.html
- Bing Maps Tile System：https://learn.microsoft.com/en-us/bingmaps/articles/bing-maps-tile-system
- Azure Maps Render Tile：https://learn.microsoft.com/en-us/rest/api/maps/render/get-map-tile
- OSMF Vector Tiles：https://vector.openstreetmap.org/
- Shortbread schema：https://shortbread.geofabrik.de/
- 天地图 MapService：https://lbs.tianditu.gov.cn/server/MapService.html
- 腾讯位置服务 WMTS：https://lbs.qq.com/service/webService/webServiceGuide/WMTS
- 高德 JS API 图层：https://lbs.amap.com/api/javascript-api/reference/layer
- 高德 JS API 2.0：https://lbs.amap.com/api/javascript-api-v2

## 搜索摘要

- 网站：Google / 官方文档 | 查询词：Google Map Tiles API、MapLibre vector tile、Mapbox Vector Tiles、PMTiles、MapTiler Tiles API、Stadia Vector、HERE Vector Tile、ArcGIS VectorTileServer、OSMF Shortbread Vector Tiles | 次数：多源交叉核验
- 网站：Gemini | 查询词：Web 地图主流矢量图源和接入方式，覆盖 MapTiler、Mapbox、Stadia、HERE、Esri、OpenMapTiles、PMTiles、OSMF Shortbread | 次数：1
