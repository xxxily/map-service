# 地图图层最大层级调研报告

调研时间：2026-06-22 14:15 CST  
项目路径：`/Users/blaze/work/github/map-service`  
调研范围：当前前台图层、后台预缓存图层目录、图源公开资料和样本瓦片请求。  
本次操作：仅新增调研文档并同步 Outline，未修改业务代码。

## 结论摘要

1. 当前“谷歌卫星最大只能到 19 级”的判断不准确。项目里的纯 `谷歌/卫星` 图层当前配置为 `maxZoom: 20`，`谷歌高德/卫星` 混合图层才是 `maxZoom: 19`。
2. 以项目当前使用的 `https://www.google.com/maps/vt?lyrs=s@189...` 地址做样本请求，广州和曼哈顿在 z=22 都返回了 JPEG 瓦片，z=23 返回 400。因此从样本看，当前 Google 卫星瓦片不止 19，也不止 20，更合理的硬上限是 22，但它是非官方接入地址，稳定性和授权风险需要单独评估。
3. Google 官方 Map Tiles API 文档说明 2D tiles 的 zoom 范围为 0-22，并要求通过 viewport information 判断当前区域是否有对应层级影像。Google Maps JavaScript 的 `MaxZoomService` 也明确说明卫星影像最大层级随地点变化。
4. 高德当前 `webst0{s}.is.autonavi.com/appmaptile` 图源原生可用层级应按 18 处理。样本请求中 z=19、z=20 虽然返回 200，但返回的是很小的 PNG 占位图，不是有效高分辨率瓦片。项目前台对高德设置了 `maxNativeZoom: 18`，后台预缓存目录设置 `maxZoom: 18`，这个口径是合理的。
5. 其他可选图源中，ArcGIS World Imagery 的 REST 元数据声明 LOD 0-23，Mapbox 官方文档声明 zoom 0-22。两者都可能支持比当前 Google 配置更高或相当的层级，但需要 API key、授权、署名、费用和覆盖质量评估。

## 当前代码中的图层层级

### 前台 Leaflet 图层

来源：`src/map/layers.js`

| 图层 | URL 类型 | 前台显示范围 | 原生瓦片请求上限 | 判断 |
| --- | --- | ---: | ---: | --- |
| 高德/卫星 | 高德卫星 + 高德街道叠加 | 3-20 | 18 | z19-z20 由 Leaflet 拉伸 z18，配置合理 |
| 高德/街道 | 高德街道 | 3-20 | 18 | z19-z20 由 Leaflet 拉伸 z18，配置合理 |
| 谷歌高德/卫星 | Google 卫星 + 高德街道叠加 | 3-19 | Google 到 19，高德到 18 | 保守且与纯 Google 图层不一致 |
| 谷歌/卫星 | Google 卫星 | 3-20 | 20 | 当前可用，但未用满样本和官方资料显示的 z22 能力 |
| 谷歌/街道 | Google 街道 | 3-20 | 20 | 当前可用，但未用满 Google 2D tiles 通常 z22 的能力 |

补充说明：

- `createTileLayer()` 默认给所有前台瓦片设置 `minZoom: 3`。
- 高德图层设置 `maxNativeZoom: 18` 后，Leaflet 在地图缩放到 19 或 20 时不会请求 z19/z20 原生瓦片，而是拉伸 z18 瓦片。
- Google 图层未设置 `maxNativeZoom`，因此地图缩放到多少就请求多少级原生瓦片。
- `src/main.js` 中没有设置 map 级别的 `minZoom` / `maxZoom`，实际缩放边界主要由当前活动瓦片图层决定。

### 后台预缓存图层目录

来源：`service/bin/admin/tileProviders.js`

| providerId | 名称 | minZoom | maxZoom | 判断 |
| --- | --- | ---: | ---: | --- |
| `amap-satellite` | 高德卫星 | 3 | 18 | 正确，符合当前高德原生瓦片样本 |
| `amap-road` | 高德街道 | 3 | 18 | 正确，符合当前高德原生瓦片样本 |
| `google-satellite` | 谷歌卫星 | 3 | 20 | 可用但偏保守，样本显示可到 22 |
| `google-street` | 谷歌街道 | 3 | 20 | 可用但偏保守，Google 官方 2D tiles 口径为 0-22 |

后台预缓存的参数保护是有效的：

- `src/admin/pages/precache.js` 使用当前 provider 的 `minZoom` / `maxZoom` 渲染输入框范围。
- `service/bin/admin/precache.js` 在服务端校验 `minZoom` 和 `maxZoom` 必须位于 provider 范围内。
- 预缓存页地图预览单独使用高德街道底图，配置为 `minZoom: 3, maxZoom: 18`，符合高德原生瓦片范围。

## 样本请求验证

样本坐标：

- 广州：`23.129112, 113.264385`
- 曼哈顿：`40.758, -73.9855`
- 请求时间：2026-06-22 CST

### Google 卫星

当前项目 URL 模板：`https://www.google.com/maps/vt?lyrs=s@189&gl=cn&x={x}&y={y}&z={z}`

| 区域 | z | HTTP | Content-Type | 字节数 | 判断 |
| --- | ---: | ---: | --- | ---: | --- |
| 广州 | 19 | 200 | image/jpeg | 17800 | 有瓦片 |
| 广州 | 20 | 200 | image/jpeg | 11150 | 有瓦片 |
| 广州 | 21 | 200 | image/jpeg | 8391 | 有瓦片 |
| 广州 | 22 | 200 | image/jpeg | 6158 | 有瓦片 |
| 广州 | 23 | 400 | text/html | 1555 | 不支持 |
| 曼哈顿 | 19 | 200 | image/jpeg | 15228 | 有瓦片 |
| 曼哈顿 | 20 | 200 | image/jpeg | 12473 | 有瓦片 |
| 曼哈顿 | 21 | 200 | image/jpeg | 10066 | 有瓦片 |
| 曼哈顿 | 22 | 200 | image/jpeg | 10115 | 有瓦片 |
| 曼哈顿 | 23 | 400 | text/html | 1555 | 不支持 |

结论：当前 Google 卫星样本不是 19 级封顶，也不是 20 级封顶。若继续使用当前 URL，z22 是更接近实测能力的上限。

### 高德卫星与街道

当前项目 URL 模板：

- 高德卫星：`https://webst0{s}.is.autonavi.com/appmaptile?style=6&x={x}&y={y}&z={z}`
- 高德街道：`https://webst0{s}.is.autonavi.com/appmaptile?style=8&x={x}&y={y}&z={z}`

| 图层 | 区域 | z | HTTP | Content-Type | 字节数 | 判断 |
| --- | --- | ---: | ---: | --- | ---: | --- |
| 高德卫星 | 广州 | 18 | 200 | image/jpeg | 11711 | 有效瓦片 |
| 高德卫星 | 广州 | 19 | 200 | image/png | 4235 | 疑似占位图 |
| 高德卫星 | 广州 | 20 | 200 | image/png | 4235 | 疑似占位图 |
| 高德街道 | 广州 | 18 | 200 | image/png | 11370 | 有效瓦片 |
| 高德街道 | 广州 | 19 | 200 | image/png | 192 | 空白或占位图 |
| 高德街道 | 广州 | 20 | 200 | image/png | 192 | 空白或占位图 |

结论：高德原生最大层级按 18 处理是正确的。前台允许显示到 20 但设置 `maxNativeZoom: 18`，属于过度缩放显示，不会错误请求高德 z19/z20 原生瓦片。

### ArcGIS World Imagery

REST 元数据地址：`https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer?f=pjson`

实测元数据：

- `tileInfo.lods.length = 24`
- 最小 level：0
- 最大 level：23
- 版权字段：`Source: Esri, Vantor, Earthstar Geographics, and the GIS User Community`

样本瓦片：

| 区域 | z | HTTP | Content-Type | 字节数 | 判断 |
| --- | ---: | ---: | --- | ---: | --- |
| 广州 | 22 | 200 | image/jpeg | 2521 | 有响应，但疑似低信息占位或低覆盖 |
| 广州 | 23 | 200 | image/jpeg | 2521 | 有响应，但疑似低信息占位或低覆盖 |
| 曼哈顿 | 23 | 200 | image/jpeg | 2521 | 有响应，但仍需视觉质量验证 |

结论：ArcGIS World Imagery 的切片方案支持到 23，但具体区域的有效影像质量需要视觉验证，不能只凭 HTTP 200 判定可用。

## 公开资料核对

- Google Map Tiles API 文档说明 2D tiles 范围是 0-22，并且要求先拿 session token；文档还建议用 viewport information 判断特定视口有哪些 zoom 可用，避免请求不存在的影像。
- Google Maps JavaScript API 的 `MaxZoomService` 文档说明卫星影像最大层级因地点而异，并给出东京区域通常在 18-21 的示例。
- Mapbox zoom level 文档说明 Mapbox 提供 0-22 共 23 个 zoom levels，最高为 22。
- ArcGIS World Imagery REST 元数据当前声明 LOD 0-23。

## 是否已经正确设置最大最小图层参数

### 已经正确的部分

1. 高德后台预缓存最大 18 是正确的。否则会缓存到占位图或空白图，浪费任务配额和磁盘。
2. 高德前台设置 `maxNativeZoom: 18` 是正确的。它允许用户继续放大查看标注，但不会误请求高德 z19/z20 原生瓦片。
3. 后台预缓存 UI 和服务端校验都使用 provider 目录的 `minZoom` / `maxZoom`，参数约束链路是完整的。
4. 所有当前 provider 的 `minZoom: 3` 对当前应用默认视图和预缓存场景是可用的。

### 需要重新决策的部分

1. Google 卫星当前纯图层和后台目录都只到 20，低于官方 2D tiles 范围和样本 `maps/vt` 实测 z22。
2. `谷歌高德/卫星` 混合图层只到 19，低于纯 `谷歌/卫星` 的 20，也低于样本实测能力。若希望混合图层承担高倍卫星查看，它是当前最明显的保守配置。
3. 如果定义“最大层级”为“原生瓦片最大层级”，高德前台 `maxZoom: 20` 容易被误读。它实际上是显示上限，不是原生请求上限。文档或 UI 上最好区分 `maxZoom` 与 `maxNativeZoom`。

## 可选方案

### 方案 A：保持现状

适合目标：优先稳定，不扩大图源请求范围。

- 高德继续按 18 缓存。
- Google 继续按 20 缓存和显示。
- 风险最低，但会浪费 Google z21/z22 的潜在细节。

### 方案 B：把当前 Google 图层提升到 22

适合目标：尽快获得更高细节，不切换图源。

- 前台 `谷歌/卫星`、`谷歌/街道` 可考虑提升到 `maxZoom: 22`。
- 后台 `google-satellite`、`google-street` 可考虑提升到 `maxZoom: 22`。
- `谷歌高德/卫星` 若继续叠加高德道路，需要决定道路层在 z20-z22 是否拉伸 z18，或在高 zoom 隐藏道路叠加。
- 风险：当前 `www.google.com/maps/vt` 是非官方瓦片入口，稳定性、授权和限流风险高于 Google 官方 Map Tiles API。

### 方案 C：改用 Google 官方 Map Tiles API

适合目标：长期合规和可控。

- 使用 session token 请求官方 2D tiles。
- 通过 viewport information 或 Maps JavaScript `MaxZoomService` 判断特定区域最大层级。
- 需要接入 API key、计费、署名和策略约束。

### 方案 D：新增 ArcGIS / Mapbox 作为可选图源

适合目标：需要备选影像源或更高 LOD。

- ArcGIS World Imagery 元数据到 23，但要验证目标区域有效影像质量。
- Mapbox 官方 zoom 到 22，接入方式和授权较清晰。
- 需要新增 provider 配置、署名、代理策略、缓存策略和费用评估。

## 建议

短期建议采用“高德保持 18，Google 先评估提升到 22”的策略：

1. 不改高德后台目录，高德原生最大继续锁定 18。
2. 若业务需要更高卫星细节，优先把 Google 纯卫星链路作为试点提升到 22，并加入小范围人工视觉验证。
3. 混合图层不要直接盲目提升到 22。因为 Google 卫星可到 22，但高德道路原生只有 18，叠加层在 z20-z22 会明显拉伸或错位风险更大。
4. 如果后续要把 z22 纳入预缓存，需要重新评估任务上限。每增加 1 个 zoom，瓦片数量大约增加 4 倍；从 z20 扩到 z22，最高层级区域的请求量会显著增加。
5. 若要长期稳定使用高 zoom Google 影像，建议规划官方 Map Tiles API 接入，而不是继续依赖 `www.google.com/maps/vt`。

## 参考来源

- Google Map Tiles API 2D Tiles Overview：`https://developers.google.com/maps/documentation/tile/2d-tiles-overview`
- Google Maps JavaScript API Maximum Zoom Imagery Service：`https://developers.google.com/maps/documentation/javascript/maxzoom`
- Mapbox zoom level 文档：`https://docs.mapbox.com/help/glossary/zoom-level/`
- ArcGIS World Imagery REST 元数据：`https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer?f=pjson`
- 项目代码：`src/map/layers.js`
- 项目代码：`service/bin/admin/tileProviders.js`
- 项目代码：`service/bin/admin/precache.js`
- 项目代码：`src/admin/pages/precache.js`
