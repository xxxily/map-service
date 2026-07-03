# 矢量图源渲染、预置图源库与密钥池需求

> 状态：后端接口已实现，前端渲染与管理端交互待对接
> 创建时间：2026-07-03
> 关联文档：
>
> - `docs/requirements/tile-source-and-layer-management.md`
> - `docs/research/tile-source-and-vector-source-research-2026-07-03.md`

## 背景

当前系统已经完成图源、组合图层、代理池、缓存和对外发布项的集中管理，后续要继续提升底图质量和图源扩展能力。此前调研已确认：仅靠栅格瓦片可以快速丰富底图，但无法充分解决高清屏清晰度、标签语言、样式主题、POI 显隐、道路等级控制、离线区域包等长期诉求。

因此下一阶段需要正式支持矢量图源渲染，并把调研中整理出的国内外图源统一纳入系统预置图源库。预置图源默认禁用，不把任何 API Key、Token、tk、appid 写死在前端或源码里。需要 Key 的图源通过后台配置密钥池后启用，并支持一个图源关联多个 Key，由服务端按轮询、优先级故障切换、随机或后续扩展策略动态选择。

项目尚未对外发布，本次按全新架构设计，不需要兼容旧配置、旧字段或旧前端硬编码。旧数据可以重建、重置或通过一次性 seed 生成，不做长期兼容层。

## 核心目标

- 支持客户端矢量瓦片渲染，优先基于 MapLibre GL JS、MVT、TileJSON、Style JSON、glyphs、sprites 和 PMTiles。
- 将栅格图源、矢量图源、专题叠加图源统一纳入“预置图源库”，调研到的图源全部作为系统预置模板进入后台，默认禁用。
- 将“预置图源模板”和“实际图源实例”分离：模板描述服务商和协议能力，实例才承载启用状态、密钥池、代理、缓存、诊断和发布策略。
- 所有 Key、Token、tk、appid、请求认证头只保存在服务端，前端 catalog、Style JSON、TileJSON 和示例代码不得泄露明文密钥。
- 支持密钥池，一个服务商、一个图源或一个发布项可以配置多个 Key，并支持轮询、优先级故障切换、随机、权重等选择策略。
- 统一代理、缓存、图源访问日志和对外 API 链路，矢量派生资源也必须纳入诊断：style、tilejson、mvt、glyph、sprite、pmtiles range。
- 2D 地图支持矢量底图；3D 地图短期使用栅格 fallback，不强行在 Cesium 中直接渲染 MVT。
- 对外 API 支持发布栅格、MVT、TileJSON、Style JSON 和 PMTiles，复用同一套图源、代理、缓存和密钥池。
- 全部能力按新模型实现，不保留旧图源格式、旧 provider、旧外部 API 上游字段的长期兼容逻辑。

## 术语定义

### 预置图源模板

系统内置的图源定义模板，用于描述一个服务商或一个具体图源的默认接入方式、协议类型、是否需要 Key、默认 URL、适用区域、授权风险和推荐策略。模板默认不可直接用于前台渲染，管理员需要基于模板创建或启用图源实例。

示例：

- `preset:maptiler-streets-vector`
- `preset:tianditu-img-wmts`
- `preset:google-official-roadmap`
- `preset:protomaps-pmtiles`

### 图源实例

真正可被系统请求、缓存、代理、诊断、预缓存或发布的运行时图源。图源实例可以从预置模板创建，也可以由管理员手动创建。图源实例必须有稳定 `sourceId`。

### 矢量图源

本需求中的矢量图源特指客户端可样式化的矢量瓦片体系，包括：

- MVT/PBF 瓦片：`/{z}/{x}/{y}.pbf`
- TileJSON：描述矢量瓦片元信息和 tiles URL
- Style JSON：MapLibre/Mapbox Style Spec 样式入口
- glyphs：字体切片
- sprites：图标雪碧图
- PMTiles：单文件瓦片归档，可包含矢量或栅格数据

注意：天地图 `vec_w`、高德标准图、Google official roadmap 这类“由矢量数据渲染成图片”的图源，最终返回 PNG/JPEG，仍按栅格图源管理。

### 密钥池

一组同服务商或同图源可用的 Key/Token/tk/appid。密钥池由服务端保存和调度，前端不可见。图源请求时由服务端从密钥池中选择一个可用密钥并注入到上游请求。

### 密钥选择策略

服务端从密钥池中选择 Key 的策略。首期至少支持：

- `round_robin`：健康 Key 之间轮询。
- `priority_failover`：按优先级选择，失败后切换备用 Key。
- `random`：健康 Key 中随机选择。
- `weighted_round_robin`：按权重轮询，可后置实现。

后续可扩展：

- `quota_aware`：按日/月额度、QPS、错误率动态选择。
- `least_recently_used`：选择最久未使用的健康 Key。

## 用户与场景

### 管理员

- 在后台查看系统预置图源库，看到天地图、腾讯、Google、MapTiler、Mapbox、Stadia、HERE、ArcGIS、OSM、OpenMapTiles、PMTiles 等图源模板。
- 为需要 Key 的图源配置一个或多个 Key，并决定 Key 的使用策略。
- 启用某个预置图源，配置代理、缓存、诊断、合规说明和前台可见性。
- 通过 MapLibre 预览矢量图源是否能正常渲染、标签是否显示、glyph/sprite 是否可达。
- 为同一个服务商配置多个 Key，在单个 Key 超限、失效或失败时自动切换。
- 查看某次图源请求使用了哪个 Key 别名、哪个代理出口、是否命中缓存、耗时和上游状态码。
- 将矢量图源发布给外部客户端，提供 MapLibre、OpenLayers、QGIS 接入示例。

### 普通前台用户

- 在 2D 地图中选择管理员启用的矢量底图。
- 获得更清晰的文字、道路和 POI，支持高 DPI 显示和后续主题切换。
- 在 3D 地图中继续使用对应栅格 fallback，不因为矢量能力影响 3D 可用性。

### 开发和运维人员

- 新增服务商时优先添加预置模板或适配器，不再在前端写死 URL。
- 排查问题时能看到 style、tilejson、mvt、glyph、sprite、pmtiles 的完整请求链路。
- 可以按图源、服务商、密钥池、Key 别名、代理出口维度分析失败率和耗时。

## 范围

### 本次纳入

- 新建预置图源库模型，集成调研报告中涉及的图源模板，全部默认禁用。
- 新建密钥池模型，支持多 Key 配置、脱敏展示、轮询和故障切换。
- 扩展图源模型，支持栅格、WMTS、ArcGIS、Google 官方 Map Tiles API、MVT、TileJSON、Style JSON、PMTiles。
- 2D 地图引入 MapLibre GL JS 或等价矢量渲染引擎，支持矢量底图渲染。
- 服务端代理 Style JSON、TileJSON、MVT、glyph、sprite、PMTiles Range 请求，并做 URL 重写和密钥注入。
- 矢量资源纳入统一缓存、代理池、诊断日志和对外 API。
- 管理后台提供预置图源库、图源实例、密钥池、矢量预览、健康检查和诊断视图。
- 对外 API 支持矢量发布：Style JSON、TileJSON、MVT、PMTiles。
- 对现有默认图源按新模型重新 seed，不做旧字段兼容。

### 本次不纳入

- 复杂在线样式编辑器，例如可视化拖拽修改每一个 MapLibre layer。
- 专业 Key 计费系统，不做复杂账单、余额、成本归集。
- 按地理区域、延迟和服务商 SLA 自动做最优 Key/代理路由。
- Cesium 中直接渲染 MVT。3D 使用栅格 fallback 或服务端渲染栅格。
- 地图审图自动化。系统只提供合规字段、风险提示和启用确认，不自动判断图源是否满足国内公开发布要求。
- 旧配置、旧 provider、旧外部 API 上游字段的长期兼容。

## 产品需求

### P1. 预置图源库

系统应内置预置图源模板库。模板默认禁用，管理员必须显式启用或基于模板创建图源实例。

预置模板字段：

- `presetId`：稳定模板 ID。
- `name`：显示名称。
- `vendor`：服务商。
- `category`：`street`、`satellite`、`terrain`、`label`、`overlay`、`vector`、`weather`、`custom`。
- `kind`：协议类型。
- `adapter`：请求适配器。
- `defaultDisabled`：固定为 `true`。
- `requiresKey`：是否需要 Key。
- `requiredSecretTypes`：需要的密钥类型，例如 `api_key`、`token`、`tk`、`appid`。
- `defaultKeyPlacement`：`query`、`header`、`bearer`、`session`。
- `template`、`styleJsonUrl`、`tileJsonUrl`、`pmtilesUrl`：默认入口。
- `subdomains`：子域。
- `minZoom`、`maxZoom`、`bounds`。
- `coordinateSystem`：`EPSG:3857`、`GCJ02`、`BD09`、`EPSG:4326`。
- `schema`：矢量 schema，例如 `openmaptiles`、`shortbread`、`mapbox-streets-v8`、`here`、`esri`、`custom`。
- `attribution`、`termsUrl`、`officialStatus`、`licenseType`。
- `cacheAllowedByLicense`：默认缓存许可建议。
- `publicUseAllowed`：是否建议对外公开发布。
- `chinaPublicUseRisk`：国内公开使用风险说明。
- `status`：`ready`、`requires_adapter`、`research_only`。

模板状态说明：

- `ready`：当前系统完成该协议/适配器后可直接启用。
- `requires_adapter`：已纳入模板库，但需要对应 adapter 实现后才能启用。
- `research_only`：仅作为调研记录和后续方向，不在首期提供启用入口。

后台预置图源库应支持：

- 按服务商、类型、是否需要 Key、状态、地区、风险筛选。
- 一键“创建图源实例”。
- 对需要 Key 的模板，在创建图源实例前提示选择或创建密钥池。
- 对合规风险高的模板，在启用前要求管理员确认风险说明。

### P2. 首批预置图源清单

以下图源模板应进入系统预置图源库，全部默认禁用。

#### 国内和区域图源

| presetId | 名称 | kind | adapter | Key | 默认状态 | 备注 |
| --- | --- | --- | --- | --- | --- | --- |
| `amap-standard-raster` | 高德标准图栅格版 | `xyz-raster` | `template` | 否/视接入方式 | `ready` | 非官方直连 URL 需标注风险 |
| `amap-satellite-raster` | 高德卫星 | `xyz-raster` | `template` | 否/视接入方式 | `ready` | 已有能力按新模型重建 |
| `amap-road-raster` | 高德道路注记 | `xyz-raster` | `template` | 否/视接入方式 | `ready` | 常用于影像叠加 |
| `amap-traffic-raster` | 高德实时路况 | `xyz-raster` / `sdk` | `requires_adapter` | 可能需要 | `requires_adapter` | 官方 JSAPI 能力，直连模板需验证 |
| `tianditu-vec-wmts` | 天地图矢量底图栅格版 | `wmts-raster` | `wmts-kvp` | tk | `ready` | `vec_w`，返回栅格图片 |
| `tianditu-cva-wmts` | 天地图矢量注记 | `wmts-raster` | `wmts-kvp` | tk | `ready` | `cva_w` |
| `tianditu-img-wmts` | 天地图影像 | `wmts-raster` | `wmts-kvp` | tk | `ready` | `img_w` |
| `tianditu-cia-wmts` | 天地图影像注记 | `wmts-raster` | `wmts-kvp` | tk | `ready` | `cia_w` |
| `tianditu-ter-wmts` | 天地图地形 | `wmts-raster` | `wmts-kvp` | tk | `ready` | `ter_w` |
| `tianditu-cta-wmts` | 天地图地形注记 | `wmts-raster` | `wmts-kvp` | tk | `ready` | `cta_w` |
| `tencent-wmts` | 腾讯位置服务 WMTS | `wmts-raster` | `wmts-kvp` | key | `requires_adapter` | 需按官方 WMTS 参数校验 |
| `baidu-map-sdk` | 百度地图官方 SDK | `sdk-raster` | `baidu-sdk` | ak | `research_only` | 坐标和渲染体系特殊，不混入默认 XYZ |

#### 国际栅格和商业图源

| presetId | 名称 | kind | adapter | Key | 默认状态 | 备注 |
| --- | --- | --- | --- | --- | --- | --- |
| `google-vt-road` | Google 传统道路图 | `xyz-raster` | `template` | 否 | `ready` | 非官方，默认禁用 |
| `google-vt-satellite` | Google 传统卫星 | `xyz-raster` | `template` | 否 | `ready` | 非官方，默认禁用 |
| `google-vt-hybrid` | Google 传统卫星混合 | `xyz-raster` | `template` | 否 | `ready` | `lyrs=y` |
| `google-vt-labels` | Google 传统道路注记 | `xyz-raster` | `template` | 否 | `ready` | `lyrs=h` |
| `google-vt-terrain` | Google 传统地形 | `xyz-raster` | `template` | 否 | `ready` | `lyrs=p/t` |
| `google-official-roadmap` | Google 官方 Roadmap Tiles | `google-map-tiles-api` | `google-session` | key | `requires_adapter` | session token 型 |
| `google-official-satellite` | Google 官方 Satellite Tiles | `google-map-tiles-api` | `google-session` | key | `requires_adapter` | session token 型 |
| `google-official-terrain` | Google 官方 Terrain Tiles | `google-map-tiles-api` | `google-session` | key | `requires_adapter` | session token 型 |
| `arcgis-world-imagery` | ArcGIS World Imagery | `arcgis-raster` | `arcgis-tile` | 通常否 | `ready` | 全球影像 |
| `arcgis-world-street` | ArcGIS World Street Map | `arcgis-raster` | `arcgis-tile` | 视服务 | `ready` | 需确认条款 |
| `arcgis-world-topo` | ArcGIS World Topographic | `arcgis-raster` | `arcgis-tile` | 视服务 | `ready` | 地形综合 |
| `carto-positron` | CARTO Positron | `xyz-raster` | `template` | 视用途 | `ready` | 数据叠加浅色底图 |
| `carto-dark-matter` | CARTO Dark Matter | `xyz-raster` | `template` | 视用途 | `ready` | 深色底图 |
| `carto-voyager` | CARTO Voyager | `xyz-raster` | `template` | 视用途 | `ready` | 通用彩色底图 |
| `osm-standard-dev` | OSM 官方瓦片测试源 | `xyz-raster` | `template` | 否 | `ready` | 仅低流量测试，不默认生产 |
| `opentopomap` | OpenTopoMap | `xyz-raster` | `template` | 否 | `ready` | 户外地形，需注意限流 |
| `maptiler-satellite-raster` | MapTiler Satellite Raster | `xyz-raster` | `template` | key | `ready` | 需密钥池 |
| `mapbox-satellite-raster` | Mapbox Satellite Raster | `xyz-raster` | `template` | token | `ready` | 需评估 SDK 和条款 |
| `stadia-alidade-raster` | Stadia Alidade Smooth | `xyz-raster` | `template` | key | `ready` | 需密钥池 |
| `here-raster` | HERE Raster Tile | `xyz-raster` | `template` | apiKey | `requires_adapter` | 参数需适配 |
| `bing-azure-raster` | Bing/Azure Maps Raster | `quadkey-raster` | `bing-quadkey` | key | `requires_adapter` | 需要 `{quadkey}` |
| `thunderforest-outdoors` | Thunderforest Outdoors | `xyz-raster` | `template` | key | `ready` | 需密钥池 |

#### 矢量图源

| presetId | 名称 | kind | adapter | Key | 默认状态 | 备注 |
| --- | --- | --- | --- | --- | --- | --- |
| `maptiler-streets-vector` | MapTiler Streets Vector | `vector-style` | `maplibre-style` | key | `ready` | 首批 PoC 推荐 |
| `maptiler-basic-vector` | MapTiler Basic Vector | `vector-style` | `maplibre-style` | key | `ready` | 首批 PoC 推荐 |
| `maptiler-outdoor-vector` | MapTiler Outdoor Vector | `vector-style` | `maplibre-style` | key | `ready` | 户外场景 |
| `mapbox-streets-vector` | Mapbox Streets Vector | `vector-style` | `mapbox-style` | token | `requires_adapter` | `mapbox://` 需适配和条款评估 |
| `mapbox-outdoors-vector` | Mapbox Outdoors Vector | `vector-style` | `mapbox-style` | token | `requires_adapter` | 同上 |
| `stadia-osm-bright-vector` | Stadia OSM Bright Vector | `vector-style` | `maplibre-style` | key | `ready` | MapLibre 友好 |
| `stadia-outdoors-vector` | Stadia Outdoors Vector | `vector-style` | `maplibre-style` | key | `ready` | 首批 PoC 推荐 |
| `here-vector` | HERE Vector Tile API | `mvt` / `vector-style` | `here-vector` | apiKey | `requires_adapter` | 企业地图，schema 独立 |
| `esri-vector-basemap` | Esri VectorTileServer | `vector-style` | `esri-vector` | token/否 | `requires_adapter` | Esri style 适配 |
| `openmaptiles-selfhost` | OpenMapTiles 自托管 | `vector-style` | `maplibre-style` | 否/自管 | `ready` | 长期自主路线 |
| `protomaps-pmtiles` | Protomaps PMTiles | `pmtiles-vector` | `pmtiles` | 否/视托管 | `ready` | 单文件区域包 |
| `osm-shortbread-vector` | OSMF Shortbread Vector | `mvt` / `vector-style` | `maplibre-style` | 否/视服务 | `requires_adapter` | 官方轻量 schema |

#### 专题叠加图源

| presetId | 名称 | kind | adapter | Key | 默认状态 | 备注 |
| --- | --- | --- | --- | --- | --- | --- |
| `openweathermap-clouds` | OpenWeatherMap 云图 | `xyz-raster` | `template` | appid | `ready` | 短 TTL |
| `openweathermap-precipitation` | OpenWeatherMap 降水 | `xyz-raster` | `template` | appid | `ready` | 短 TTL |
| `rainviewer-radar` | RainViewer 雷达 | `time-raster` | `rainviewer-time` | 否 | `requires_adapter` | 需 metadata + time |
| `nasa-gibs-wmts` | NASA GIBS | `wmts-raster` | `wmts-kvp` | 否/视图层 | `requires_adapter` | 常带 TIME |
| `openseamap` | OpenSeaMap | `xyz-raster` | `template` | 否 | `ready` | 航海叠加 |
| `openrailwaymap` | OpenRailwayMap | `xyz-raster` | `template` | 否 | `ready` | 铁路叠加 |

### P3. 密钥池管理

后台新增“密钥池”能力，可放在图源管理下，也可作为独立安全配置入口。

密钥池字段：

- `keyPoolId`：稳定 ID。
- `name`：名称。
- `vendor`：服务商。
- `scope`：`global`、`source`、`publish`。
- `allowedPresetIds`：允许绑定的预置模板。
- `allowedSourceIds`：允许绑定的图源实例。
- `strategy`：密钥选择策略。
- `cooldownMs`：Key 失败后的冷却时间。
- `maxRetriesPerRequest`：单次请求最大换 Key 次数。
- `defaultSecretType`：该池默认 Key 类型，用于新增 Key 时预填。
- `defaultPlacement`：该池默认注入方式。
- `defaultParamName`：该池默认查询参数或 Header 名。
- `credentialUrl`：官方 Key 申请、控制台或账号入口。
- `enabled`：是否启用。
- `description`：备注。

Key 条目字段：

- `keyId`：稳定 ID，不使用明文截断作为 ID。
- `alias`：管理员可读别名。
- `secretType`：`api_key`、`token`、`tk`、`appid`、`bearer`、`header`。
- `secretRef`：服务端密钥引用。
- `placement`：`query`、`header`、`bearer`、`session`。
- `paramName`：查询参数名或 header 名。
- `enabled`：是否启用。
- `priority`：优先级，数字越小越优先。
- `weight`：权重。
- `qpsLimit`：可选，每秒请求上限。
- `dailyLimit`：可选，每日请求上限。
- `monthlyLimit`：可选，每月请求上限。
- `usedCount`：统计值。
- `errorCount`：统计值。
- `lastUsedAt`、`lastSuccessAt`、`lastFailureAt`。
- `cooldownUntil`。
- `maskedPreview`：脱敏展示，例如 `abcd****wxyz`。

密钥池要求：

- 系统应根据预置图源中 `requiresKey=true` 的厂商自动创建默认空密钥池，覆盖天地图、腾讯位置服务、百度地图、Google Maps Platform、MapTiler、Mapbox、Stadia Maps、HERE、Azure Maps、Thunderforest 和 OpenWeatherMap。
- 默认密钥池不内置任何 Key，只保存厂商默认参数、允许关联的预设和官方申请入口；管理员在对应池中添加 Key 后即可启用图源。
- 基于需要 Key 的预设创建图源时，应自动关联对应厂商默认密钥池；用户仍可手动切换到其它密钥池。
- 密钥明文只允许在创建和更新时提交，不允许通过 API 读回。
- 管理后台列表只显示别名、状态、脱敏预览、最近使用和健康状态。
- 图源、预置模板和发布项只能引用 `keyPoolId` 或 `secretRef`，不能保存明文 Key。
- 服务端请求上游时按策略选择 Key 并注入到 URL、Header 或 session 创建流程。
- 诊断日志只记录 `keyPoolId`、`keyId`、`alias`、选择策略和失败原因，不记录明文。
- Key 失效、超限、上游返回鉴权错误时，应将该 Key 标记为失败并按策略切换。
- 单次请求换 Key 后仍失败，应返回明确错误，并在诊断日志中记录尝试过的 Key 别名和错误摘要。

### P4. 图源实例模型

图源实例应统一支持栅格、矢量、专题和发布专用图源。

建议模型：

```json
{
  "id": "maptiler-streets-vector",
  "presetId": "preset:maptiler-streets-vector",
  "name": "MapTiler Streets Vector",
  "enabled": false,
  "vendor": "maptiler",
  "category": "vector",
  "kind": "vector-style",
  "adapter": "maplibre-style",
  "schema": "openmaptiles",
  "entry": {
    "template": "",
    "styleJsonUrl": "https://api.maptiler.com/maps/streets-v2/style.json?key={key}",
    "tileJsonUrl": "",
    "pmtilesUrl": ""
  },
  "secrets": {
    "keyPoolId": "maptiler-main",
    "required": true,
    "placement": "query",
    "paramName": "key"
  },
  "rendering": {
    "engine": "maplibre",
    "clients": ["2d"],
    "fallbackRasterSourceId": ""
  },
  "zoom": {
    "min": 0,
    "max": 22,
    "maxNative": 14
  },
  "bounds": [-180, -85.051129, 180, 85.051129],
  "coordinateSystem": "EPSG:3857",
  "proxy": {
    "mode": "never",
    "poolId": "",
    "outboundId": ""
  },
  "cache": {
    "enabled": true,
    "ttlMs": 86400000,
    "staleTtlMs": 604800000,
    "respectUpstreamCacheControl": true
  },
  "permissions": {
    "frontendVisible": false,
    "externalApiAllowed": false,
    "precacheAllowed": false,
    "userSelectable": false
  },
  "license": {
    "attribution": "",
    "termsUrl": "",
    "officialStatus": "official",
    "licenseType": "api-key",
    "cacheAllowedByLicense": true,
    "publicUseAllowed": false,
    "chinaPublicUseReviewed": false
  },
  "diagnostics": {
    "enabled": true,
    "maxLogCount": 500
  }
}
```

规则：

- 预置图源创建出的实例默认 `enabled: false`、`frontendVisible: false`、`externalApiAllowed: false`。
- 图源启用前必须通过基础连通性测试；矢量图源还必须通过 Style JSON/TileJSON/glyph/sprite 关键资源测试。
- `tileSize` 不再允许管理员随意填写任意像素。栅格瓦片默认 256；高清通过 scale/retina 策略表达。
- 缓存时间在管理后台以天、小时、分钟编辑，API 内部可存毫秒。
- 需要 Key 的图源必须绑定密钥池，且启用前密钥池内必须至少有一个已配置密钥的启用 Key；默认空池只允许创建禁用草稿。
- 需要适配器但适配器未实现的模板不能创建可启用实例，只能显示“待支持”。

### P5. 矢量渲染和前端 catalog

2D 地图应支持 MapLibre 渲染路径。建议把 MapLibre 作为 2D 主渲染引擎，统一承载栅格和矢量底图：

- 栅格图源在 MapLibre 中作为 `raster` source/layer。
- MVT 图源作为 `vector` source。
- Style JSON 图源由服务端返回重写后的 style。
- PMTiles 图源通过 `pmtiles://` 协议或服务端代理 URL 加载。

公开 catalog 要返回前端渲染所需字段，但不返回服务端内部字段和密钥。

示例：

```json
{
  "sources": [
    {
      "id": "maptiler-streets-vector",
      "name": "MapTiler Streets",
      "kind": "vector-style",
      "engine": "maplibre",
      "styleUrl": "/api/v1/vector/styles/maptiler-streets-vector/style.json",
      "attribution": "..."
    },
    {
      "id": "arcgis-world-imagery",
      "name": "ArcGIS World Imagery",
      "kind": "xyz-raster",
      "tileUrl": "/api/v1/tiles/arcgis-world-imagery/{z}/{x}/{y}",
      "tileSize": 256
    }
  ],
  "layers": [
    {
      "id": "maptiler-streets",
      "name": "MapTiler Streets",
      "type": "base",
      "renderMode": "maplibre-style",
      "items": [
        { "sourceId": "maptiler-streets-vector", "role": "base", "opacity": 1 }
      ],
      "clients": ["2d"]
    }
  ]
}
```

前端要求：

- 不从源码硬编码任何第三方图源 URL 或 Key。
- 不直接请求第三方 Style JSON、TileJSON、MVT、glyph、sprite。
- 不把服务端密钥拼进 MapLibre style。
- 2D 支持矢量底图切换、栅格底图切换、栅格叠加层透明度。
- 3D 只展示 `clients` 包含 `3d` 的图层；矢量图层如配置 `fallbackRasterSourceId`，3D 使用 fallback。

### P6. 服务端矢量代理和 URL 重写

新增或重构以下公开接口：

```text
GET /api/v1/vector/styles/:sourceId/style.json
GET /api/v1/vector/sources/:sourceId/tilejson.json
GET /api/v1/vector/tiles/:sourceId/:z/:x/:y.pbf
GET /api/v1/vector/glyphs/:sourceId/:fontstack/:range.pbf
GET /api/v1/vector/sprites/:sourceId/sprite.json
GET /api/v1/vector/sprites/:sourceId/sprite.png
GET /api/v1/vector/sprites/:sourceId/sprite@2x.json
GET /api/v1/vector/sprites/:sourceId/sprite@2x.png
GET /api/v1/vector/pmtiles/:sourceId.pmtiles
```

重写规则：

- Style JSON 中的 `sources.*.url`、`sources.*.tiles[]`、`glyphs`、`sprite` 都必须重写成本系统受控 URL。
- TileJSON 中的 `tiles[]` 必须重写成本系统受控 MVT URL。
- `mapbox://`、`pmtiles://`、相对路径和绝对 URL 都必须通过 adapter 解析，不能原样暴露给前端。
- 重写时注入服务端密钥到上游请求，不把密钥出现在返回给前端的 JSON 中。
- 允许域名必须来自图源配置或管理员白名单，不允许 Style JSON 自带任意外链绕过 SSRF 防护。
- 上游请求禁止访问内网、localhost、link-local、metadata 服务和非 HTTP/HTTPS 协议。

响应要求：

- MVT/PBF 返回正确 `Content-Type`，推荐 `application/vnd.mapbox-vector-tile` 或兼容类型。
- 正确保留或处理 `Content-Encoding`，不能对已压缩 PBF 错误二次压缩。
- PMTiles 必须支持 `Range`、`206 Partial Content`、`If-Range`、`416 Range Not Satisfiable`。
- 所有矢量资源请求写入图源访问日志。

### P7. 缓存

矢量资源缓存必须复用现有图源级缓存治理，但需要拆分资源类型：

- `style`
- `tilejson`
- `mvt`
- `glyph`
- `sprite`
- `pmtiles-range`
- `rendered-raster`

缓存键必须包含：

- `sourceId`
- `resourceType`
- `z/x/y` 或 Range 区间
- `styleVersion`
- `schema`
- `keyPoolId` 和可选 `keyId`，仅当不同 Key 会影响返回内容时纳入
- `encoding`
- `scale` 或 pixel ratio

规则：

- 默认尊重上游 `Cache-Control`。
- `license.cacheAllowedByLicense=false` 时，即使管理员勾选缓存也不能写入持久缓存。
- Style JSON 和 TileJSON 的 TTL 应短于 MVT 瓦片。
- glyph/sprite 可较长 TTL，但必须绑定 style version。
- PMTiles Range 缓存应限制数量和大小，避免 Range 碎片无限增长。
- 缓存清理支持按图源、资源类型、style version、发布项清理。

### P8. 代理

图源代理策略继续作为图源级配置。矢量图源派生的 style、tilejson、mvt、glyph、sprite、pmtiles 请求默认继承图源代理策略。

规则：

- 图源可以配置 `never`、`fixed`、`pool` 三种代理模式。
- 需要 Key 的图源，Key 选择和代理选择是两个独立步骤：先选 Key，再按代理策略请求上游。
- 某个代理出口失败时，允许在同一次请求内按代理池策略切换出口。
- 某个 Key 失败时，允许在同一次请求内按密钥池策略切换 Key。
- 单次请求最大重试次数必须受控，避免 Key 和代理组合爆炸式重试。
- 日志中要记录 `proxyOutboundId`、`keyId`、`attempt`、`durationMs`、`upstreamStatus`。

### P9. 对外 API

对外发布项应支持以下发布类型：

- `raster_xyz`：发布栅格 XYZ。
- `vector_mvt`：发布 MVT。
- `vector_tilejson`：发布 TileJSON。
- `vector_style`：发布 Style JSON。
- `pmtiles`：发布 PMTiles。
- `layer_manifest`：发布组合图层清单，由外部客户端自行叠加。

建议路径：

```text
GET /api/v1/external/:publishId/{z}/{x}/{y}
GET /api/v1/external/:publishId/style.json
GET /api/v1/external/:publishId/tilejson.json
GET /api/v1/external/:publishId/tiles/:z/:x/:y.pbf
GET /api/v1/external/:publishId/glyphs/:fontstack/:range.pbf
GET /api/v1/external/:publishId/sprites/sprite.json
GET /api/v1/external/:publishId/sprites/sprite.png
GET /api/v1/external/:publishId.pmtiles
```

规则：

- 发布项引用图源实例或组合图层，不直接保存上游 URL 明文密钥。
- 发布项可以覆盖图源的密钥池、代理和缓存策略，但必须显式展示“已覆盖”。
- 对外 Style JSON 必须重写为发布项路径，不能暴露内部 `sourceId`、`keyPoolId`、上游 Key。
- 发布项默认禁用，管理员显式启用后才可访问。
- 对外访问日志和图源访问日志分开保留，但字段结构对齐。

### P10. 管理后台

图源管理需要新增或调整以下视图：

- 预置图源库：展示所有内置模板，支持按模板创建图源实例。
- 图源实例：管理启用状态、渲染类型、代理、缓存、权限、合规。
- 密钥池：管理服务商 Key、Token、tk、appid。
- 矢量预览：MapLibre 预览 Style JSON、MVT、PMTiles。
- 资源测试：测试 style、tilejson、mvt、glyph、sprite、pmtiles range。
- 诊断日志：按资源类型、图源、Key、代理、缓存状态筛选。

关键交互：

- 创建需要 Key 的图源时，默认自动选择厂商预置密钥池，并提供官方申请入口；如果管理员选择其它池，应清晰展示当前关联池。
- 启用图源前执行基础测试；测试失败允许保存但不允许启用，除非管理员选择“强制启用并记录风险”。
- 图源列表状态支持直接启用/禁用，不必进入编辑页。
- 密钥池列表状态支持直接启用/禁用单个 Key。
- 密钥明文输入后不回显，更新时留空表示不变。
- 所有提示使用统一 toast/dialog，不使用 `alert`、`confirm`、`prompt`。

## 数据模型草案

### PresetSource

```json
{
  "presetId": "preset:maptiler-streets-vector",
  "name": "MapTiler Streets Vector",
  "vendor": "maptiler",
  "kind": "vector-style",
  "adapter": "maplibre-style",
  "category": "vector",
  "requiresKey": true,
  "requiredSecretTypes": ["api_key"],
  "defaultKeyPlacement": {
    "placement": "query",
    "paramName": "key"
  },
  "entry": {
    "styleJsonUrl": "https://api.maptiler.com/maps/streets-v2/style.json?key={key}"
  },
  "schema": "openmaptiles",
  "defaultDisabled": true,
  "status": "ready",
  "license": {
    "attribution": "",
    "termsUrl": "",
    "cacheAllowedByLicense": true,
    "publicUseAllowed": false,
    "chinaPublicUseRisk": "境外图源国内公开展示需单独评估。"
  }
}
```

### KeyPool

```json
{
  "id": "maptiler-main",
  "name": "MapTiler 主密钥池",
  "vendor": "maptiler",
  "enabled": true,
  "strategy": "round_robin",
  "cooldownMs": 300000,
  "maxRetriesPerRequest": 2,
  "keys": [
    {
      "id": "maptiler-key-a",
      "alias": "主 Key",
      "enabled": true,
      "secretType": "api_key",
      "secretRef": "secret:maptiler-key-a",
      "placement": "query",
      "paramName": "key",
      "priority": 10,
      "weight": 1,
      "maskedPreview": "abcd****wxyz"
    }
  ]
}
```

### SourceResourceRequestLog

```json
{
  "id": "log_001",
  "time": "2026-07-03T12:00:00.000Z",
  "sourceId": "maptiler-streets-vector",
  "resourceType": "mvt",
  "z": 10,
  "x": 843,
  "y": 421,
  "keyPoolId": "maptiler-main",
  "keyId": "maptiler-key-a",
  "proxyMode": "pool",
  "proxyOutboundId": "proxy-hk-1",
  "cacheState": "MISS",
  "statusCode": 200,
  "durationMs": 183,
  "upstreamHost": "api.maptiler.com",
  "errorCode": "",
  "errorMessage": ""
}
```

## API 草案

管理接口：

```text
GET    /api/v1/admin/source-presets
POST   /api/v1/admin/source-presets/:presetId/create-source

GET    /api/v1/admin/key-pools
POST   /api/v1/admin/key-pools
GET    /api/v1/admin/key-pools/:id
PUT    /api/v1/admin/key-pools/:id
DELETE /api/v1/admin/key-pools/:id
POST   /api/v1/admin/key-pools/:id/test
POST   /api/v1/admin/key-pools/:id/keys/:keyId/test

GET    /api/v1/admin/tile-sources
POST   /api/v1/admin/tile-sources
PUT    /api/v1/admin/tile-sources/:id
POST   /api/v1/admin/tile-sources/:id/test
POST   /api/v1/admin/tile-sources/:id/vector-test
GET    /api/v1/admin/tile-sources/:id/access-logs
GET    /api/v1/admin/source-access-logs
```

公开接口：

```text
GET /api/v1/map/catalog
GET /api/v1/tiles/:sourceId/:z/:x/:y
GET /api/v1/vector/styles/:sourceId/style.json
GET /api/v1/vector/sources/:sourceId/tilejson.json
GET /api/v1/vector/tiles/:sourceId/:z/:x/:y.pbf
GET /api/v1/vector/glyphs/:sourceId/:fontstack/:range.pbf
GET /api/v1/vector/sprites/:sourceId/sprite.json
GET /api/v1/vector/sprites/:sourceId/sprite.png
GET /api/v1/vector/pmtiles/:sourceId.pmtiles
```

## 安全要求

- 禁止新增任意 URL 代理入口，所有请求必须通过 sourceId、presetId 或 publishId 解析。
- 密钥明文不得进入前端、日志、公开 catalog、Style JSON、TileJSON、OpenAPI 示例。
- Style JSON、TileJSON、glyph、sprite、MVT URL 必须经过服务端白名单和 SSRF 校验。
- 禁止访问内网、localhost、link-local、metadata 服务和非预期协议。
- 管理接口必须鉴权。
- 公开矢量接口必须遵守前台访问控制和发布项访问控制。
- 诊断日志必须脱敏 Key、Token、Authorization、Cookie、Proxy-Authorization。
- 对外 API Token 和上游图源 Key 是两套凭证，不能复用或混淆。

## 非功能要求

- 矢量瓦片请求应支持高并发下的稳定缓存和代理复用。
- MVT/PBF、glyph、sprite、PMTiles Range 不能被错误转码或错误压缩。
- MapLibre 首屏加载失败时，应提供可诊断错误，不出现空白且无日志的状态。
- 预置图源库 seed 应可重复执行，结果幂等。
- 图源启用、禁用、Key 禁用、代理切换应尽量即时生效，不要求重启服务。
- 公开 catalog 体积应受控，不返回完整后台模板库。

## 验收标准

### 预置图源库

- 后台可看到本需求列出的预置图源模板。
- 所有预置模板默认禁用。
- 需要 Key 的模板会自动关联厂商默认密钥池，但默认池为空时只能创建禁用实例，不能直接启用。
- 非官方或高风险图源启用前有明确风险提示。

### 密钥池

- 可为同一服务商配置多个 Key。
- 可选择 `round_robin`、`priority_failover`、`random` 策略。
- 请求日志能看到使用的 Key 别名和 keyId，不能看到明文。
- 单个 Key 禁用后不再被选中。
- Key 失败后按策略切换到其他健康 Key。

### 矢量渲染

- 至少一个 MapTiler 或 Stadia 矢量 Style JSON 图源可以在 2D 地图正常渲染。
- Style JSON 中的 tiles、glyphs、sprites 已被重写到本服务路径。
- 前端网络请求中看不到第三方 Key 明文。
- 禁用图源后，Style JSON、MVT、glyph、sprite 请求均不可访问。
- 3D 地图不会加载不支持的矢量图层；配置 fallback 后可加载栅格替代。

### 缓存、代理和日志

- MVT、Style JSON、TileJSON、glyph、sprite 请求均写入图源访问日志。
- 日志包含资源类型、缓存状态、代理出口、Key 别名、耗时和状态码。
- 开启缓存后重复请求可命中缓存。
- 关闭缓存后矢量派生资源绕过持久缓存。
- 代理池和密钥池重试次数受控，不出现无限重试。

### 对外 API

- 可创建一个矢量 Style JSON 发布项。
- 外部 MapLibre 示例可通过发布项 URL 正常加载。
- 对外 Style JSON 不暴露内部 sourceId、KeyPool、上游 Key。
- 对外日志与图源访问日志分开保留，但可通过 sourceId/publishId 关联排查。

## 实施阶段建议

### 阶段 1：新模型和预置库

- 新建预置图源库和 seed。
- 新建密钥池模型和管理接口。
- 重建默认高德、Google、天地图、ArcGIS、CARTO、OSM、OpenTopoMap 等栅格图源实例，默认禁用新增项。
- 完成密钥脱敏、服务端注入和基础轮询。

### 阶段 2：MapLibre 和 Style JSON

- 引入 MapLibre 2D 渲染路径。
- 支持 `vector-style` 图源。
- 支持 Style JSON/TileJSON/MVT/glyph/sprite 代理和重写。
- 完成 MapTiler 或 Stadia 矢量图源 PoC。

### 阶段 3：PMTiles 和对外矢量发布

- 支持 PMTiles Range 代理。
- 支持对外发布 Style JSON、TileJSON、MVT、PMTiles。
- 增加外部 MapLibre/OpenLayers/QGIS 示例。

### 阶段 4：高级适配器

- Google 官方 Map Tiles API session adapter。
- Bing/Azure quadkey adapter。
- RainViewer/NASA GIBS time adapter。
- Esri/HERE/Mapbox 特殊 style 或协议 adapter。

### 阶段 5：样式管理和自托管

- OpenMapTiles/Shortbread 自托管模板完善。
- 样式版本管理、主题切换、多语言标签、POI 显隐。
- 3D 栅格 fallback 自动生成或服务端矢量转栅格能力评估。
