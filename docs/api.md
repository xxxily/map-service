# API 参考

基础路径：

```text
/api/v1
```

所有 JSON 接口使用统一结构：

```json
{
  "code": 0,
  "result": {},
  "error": null
}
```

错误响应使用 `code: -1`，错误详情放在 `error.message`。二进制瓦片接口成功时直接返回图片流，不包 JSON。

## 鉴权

管理接口统一位于 `/api/v1/admin`。除登录接口外，管理接口都需要：

```text
Authorization: Bearer <admin-token>
```

前台地图访问控制由 `/api/v1/access/*` 维护；如果后台启用了访问密码，前台公开 catalog 和图源瓦片接口需要浏览器携带 `map_access_token` HttpOnly Cookie。

管理员账号通过环境变量配置：

- `MAP_SERVICE_ADMIN_USERNAME`
- `MAP_SERVICE_ADMIN_PASSWORD`
- `MAP_SERVICE_ADMIN_TOKEN_SECRET`

本地开发默认账号密码为 `admin` / `admin`。上线前必须覆盖默认值。

## 系统接口

### `GET /api/v1/health`

返回进程健康状态。

### `GET /health`

根路径健康检查，便于负载均衡或简单探活使用。

### `GET /api/v1/routes`

返回当前注册的 API 路由目录。

### `GET /api/v1/openapi.json`

返回根据路由元数据生成的轻量 OpenAPI 3.1 文档。

## 访问控制

### `GET /api/v1/access/status`

返回当前前台地图是否需要访问密码。

```json
{
  "code": 0,
  "result": {
    "required": false
  },
  "error": null
}
```

### `POST /api/v1/access/verify`

验证访问密码。成功后服务端写入 `map_access_token` HttpOnly Cookie。

```json
{
  "password": "访问密码"
}
```

## 前台图源与图层

### `GET /api/v1/map/catalog`

获取前台可见的图源和图层目录。前端 2D/3D 地图应以此接口作为底图事实来源，不再硬编码图层目录。

前台 2D 地图当前支持：

- 栅格图源：通过 `tileUrl` 使用 Leaflet 瓦片图层渲染。
- `kind=vector-style`：通过 `styleUrl` 使用 MapLibre 渲染，Style JSON、TileJSON、MVT、glyph 和 sprite 均由服务端受控重写。
- `kind=mvt`、`kind=vector-tilejson`、`kind=pmtiles-vector`：资源接口已可用，但前台直接渲染需要完整 Style 定义；若图源配置了 `rendering.fallbackRasterSourceId`，3D 或不支持的前端可使用对应栅格降级。

前台 3D 地图只渲染 Cesium 支持的栅格 imagery。矢量图源不会直接进入 3D 图层列表，除非配置了可用的 `rendering.fallbackRasterSourceId`。

返回示例：

```json
{
  "sources": [
    {
      "id": "amap-road",
      "name": "高德街道",
      "vendor": "amap",
      "category": "road",
      "kind": "xyz",
      "subdomains": ["1", "2", "3", "4"],
      "minZoom": 3,
      "maxZoom": 18,
      "maxNativeZoom": 18,
      "tileSize": 256,
      "retina": {
        "mode": "none",
        "param": "",
        "normalValue": "1",
        "retinaValue": "1"
      },
      "attribution": "高德地图 AutoNavi.com",
      "bounds": null,
      "tags": [],
      "description": "高德街道瓦片图源。",
      "tileUrl": "/api/v1/tiles/amap-road/{z}/{x}/{y}"
    }
  ],
  "layers": [
    {
      "id": "amap-hybrid",
      "name": "高德/卫星",
      "enabled": true,
      "frontendVisible": true,
      "default": true,
      "type": "base",
      "clients": ["2d", "3d"],
      "items": [
        { "sourceId": "amap-satellite", "opacity": 1, "zIndex": 0 },
        { "sourceId": "amap-road", "opacity": 0.5, "zIndex": 1 }
      ],
      "minZoom": 3,
      "maxZoom": 18,
      "sortOrder": 10,
      "description": "高德卫星叠加高德道路。"
    }
  ],
  "defaultLayerId": "amap-hybrid"
}
```

公开 catalog 不返回 `template`、代理、缓存、权限、Token、代理密码等服务端内部字段。

### `GET /api/v1/tiles/:sourceId/:z/:x/:y`

按图源 ID 获取瓦片。服务端根据图源模板生成上游 URL，并应用图源级缓存和代理策略。

查询参数：

- `scale`：可选，retina/高清比例参数；不传时使用图源默认值。

成功响应为瓦片图片流，常见响应头：

- `X-Cache: MISS`
- `X-Cache: HIT`
- `X-Cache: REVALIDATED`
- `X-Cache: STALE`
- `X-Cache: BYPASS`

常见错误：

- `404`：图源不存在。
- `403`：图源已禁用，或前台访问授权失败。
- `400`：坐标越界或缩放级别不合法。
- `502`：代理池、代理出口或上游不可用。

### `GET /api/v1/tiles/relay?url=<encoded-url>`

历史白名单瓦片代理接口。新前台不要再使用任意 `url=` 直传模式，应使用 `/api/v1/tiles/:sourceId/:z/:x/:y`。该接口当前仅保留给旧预缓存和诊断场景。

## 矢量图源资源接口

矢量资源接口面向前台 2D 地图和受控客户端使用。前端不直接请求第三方 Style JSON、TileJSON、MVT、glyph、sprite 或 PMTiles；所有资源都通过系统图源 ID 解析，服务端负责密钥池选择、代理、缓存、URL 重写和诊断日志。

所有矢量资源接口遵循前台访问控制：如果系统启用了地图访问密码，需要携带 `map_access_token` Cookie。

### `GET /api/v1/vector/styles/:sourceId/style.json`

获取重写后的 MapLibre/Mapbox Style JSON。适用于 `kind=vector-style` 的图源。

服务端会：

- 从图源 `entry.styleJsonUrl` 请求上游 Style JSON。
- 从密钥池选择 Key 并注入上游请求。
- 将 `sources.*.tiles[]`、`sources.*.url`、`glyphs`、`sprite` 改写为系统受控 URL。
- 移除返回内容中的上游 Key、Token、tk、appid 等敏感信息。

返回示例：

```json
{
  "version": 8,
  "sources": {
    "openmaptiles": {
      "type": "vector",
      "tiles": [
        "/api/v1/vector/tiles/maptiler-streets-vector/<ref>/{z}/{x}/{y}.pbf"
      ]
    }
  },
  "glyphs": "/api/v1/vector/glyphs/maptiler-streets-vector/<ref>/{fontstack}/{range}.pbf",
  "sprite": "/api/v1/vector/sprites/maptiler-streets-vector/<ref>/sprite",
  "layers": []
}
```

`<ref>` 是服务端短期资源引用，用于把上游派生资源映射回图源配置和本次重写上下文。前端只需按 Style JSON 原样加载，不需要解析或保存 `<ref>`。

### `GET /api/v1/vector/sources/:sourceId/tilejson.json`

获取图源配置的 TileJSON。适用于 `kind=vector-tilejson`，也可用于配置了 `entry.tileJsonUrl` 的矢量图源。

返回 JSON 中的 `tiles[]` 会被改写为系统受控 MVT URL，不包含上游密钥。

### `GET /api/v1/vector/sources/:sourceId/:ref/tilejson.json`

获取由 Style JSON 中 `sources.*.url` 派生出的 TileJSON。该路径通常由 `style.json` 自动生成，前端不需要手工拼接。

### `GET /api/v1/vector/tiles/:sourceId/:z/:x/:y.pbf`

获取图源直接配置的 MVT 瓦片。适用于 `kind=mvt`，或配置了 `entry.template` 的 `vector-style` / `vector-tilejson` 图源。

### `GET /api/v1/vector/tiles/:sourceId/:ref/:z/:x/:y.pbf`

获取 Style JSON 或 TileJSON 派生出来的 MVT 瓦片。该路径通常由重写后的 Style JSON 或 TileJSON 自动生成。

成功响应为 PBF/MVT 数据流，常见 `Content-Type` 为 `application/vnd.mapbox-vector-tile`、`application/x-protobuf` 或上游兼容类型。

### `GET /api/v1/vector/glyphs/:sourceId/:fontstack/:range.pbf`

获取图源直接配置的 glyph 字体切片。

### `GET /api/v1/vector/glyphs/:sourceId/:ref/:fontstack/:range.pbf`

获取 Style JSON 派生出来的 glyph 字体切片。该路径通常由重写后的 Style JSON 自动生成。

### `GET /api/v1/vector/sprites/:sourceId/sprite.json`

获取图源直接配置的 sprite JSON。

### `GET /api/v1/vector/sprites/:sourceId/sprite.png`

获取图源直接配置的 sprite 图片。

### `GET /api/v1/vector/sprites/:sourceId/:ref/sprite.json`

获取 Style JSON 派生出来的 sprite JSON。

### `GET /api/v1/vector/sprites/:sourceId/:ref/sprite.png`

获取 Style JSON 派生出来的 sprite 图片。

### `GET /api/v1/vector/sprites/:sourceId/:ref/sprite@2x.json`

获取 Style JSON 派生出来的高清 sprite JSON。

### `GET /api/v1/vector/sprites/:sourceId/:ref/sprite@2x.png`

获取 Style JSON 派生出来的高清 sprite 图片。

### `GET /api/v1/vector/pmtiles/:sourceId.pmtiles`

代理 PMTiles 文件或 Range 请求。客户端可带：

```text
Range: bytes=<start>-<end>
If-Range: <etag-or-date>
```

服务端会转发 Range 相关请求头，并把 `Range` 纳入缓存键，避免不同字节段复用同一缓存。当前属于基础 Range 代理能力，不实现 PMTiles 专用索引解析或最优分片策略。

## 管理后台基础接口

### `POST /api/v1/admin/auth/login`

```json
{
  "username": "admin",
  "password": "admin"
}
```

返回 Bearer Token、过期时间和用户信息。

### `POST /api/v1/admin/auth/logout`

校验当前 Token 并返回 `status: ok`。前端负责删除本地 Token。

### `POST /api/v1/admin/auth/password`

修改管理员密码。

```json
{
  "currentPassword": "old-password",
  "newPassword": "new-password"
}
```

### `GET /api/v1/admin/session`

校验当前 Token，返回用户名和 Token 时间信息。

### `GET /api/v1/admin/system`

返回应用版本、Node.js 版本、进程号、运行时间、环境、服务器时间和 API 基础路径。

### `GET /api/v1/admin/settings`

返回脱敏后的运行时设置。目前只保留前台访问控制配置；代理统一在代理出口、代理池和图源策略中管理。

### `PUT /api/v1/admin/settings`

更新运行时设置。

```json
{
  "access": {
    "enabled": true,
    "password": "front-access-password"
  }
}
```

设置接口不再接收或返回 `proxy` 配置，避免和图源代理策略、代理池产生交叉影响。

## 缓存接口

### `GET /api/v1/admin/cache`

返回缓存统计和最近缓存项。

关键字段：

- `files` / `bytes`：缓存文件数和体积。
- `fresh` / `stale` / `expired`：缓存新鲜度数量。
- `providers`：历史 provider 维度统计。
- `bySource`：按 `sourceId` 聚合。
- `byLayer`：按 `layerId` 聚合。
- `byPublish`：按 `publishId` 聚合。
- `byResourceType`：按矢量资源类型聚合，例如 `raster`、`style`、`tilejson`、`mvt`、`glyph`、`sprite-json`、`sprite-png`、`pmtiles-range`。
- `entries`：最多 100 条最近缓存项，包含 `key`、`url`、`sourceId`、`layerId`、`publishId`、`state`、`size`、`updatedAt`、`expiresAt`。

缓存元数据中的 `url` 会对常见密钥参数脱敏。PMTiles 或其它 Range 请求会把 `Range` 作为缓存键的一部分，避免不同字节段复用同一个缓存文件。

### `DELETE /api/v1/admin/cache`

清空全部瓦片缓存。

### `DELETE /api/v1/admin/cache?url=<encoded-url>`

清理指定白名单瓦片 URL 的缓存。

## 图源管理

图源 ID、图层 ID、代理 ID、发布项 ID 均使用稳定 slug：3-64 位小写字母、数字或短横线，不能以短横线开头或结尾。

图源模型关键字段：

- `kind`：`xyz`、`tms`、`xyz-raster`、`tms-raster`、`wmts-raster`、`arcgis-raster`、`quadkey-raster`、`mvt`、`vector-tilejson`、`vector-style`、`pmtiles-vector`、`pmtiles-raster`、`google-map-tiles-api` 等。
- `adapter`：请求适配器，例如 `template`、`wmts-kvp`、`arcgis-tile`、`maplibre-style`、`pmtiles`、`google-session`。
- `entry.template`：栅格或 MVT URL 模板。
- `entry.styleJsonUrl`：矢量 Style JSON 上游入口。
- `entry.tileJsonUrl`：矢量 TileJSON 上游入口。
- `entry.pmtilesUrl`：PMTiles 上游入口。
- `secrets.required`：是否必须绑定密钥池。
- `secrets.keyPoolId`：绑定的密钥池 ID。公开 catalog 不返回该字段。
- `rendering.engine`：`leaflet`、`maplibre`、`cesium`。
- `rendering.clients`：`2d`、`3d`。
- `license.cacheAllowedByLicense`：授权是否允许写入持久缓存。为 `false` 时，即使 `cache.enabled=true` 也不得写入持久缓存。
- `retina.mode`：`none`、`query`、`fixed`
- `tileSize`：当前固定为 `256`，高清瓦片通过 `retina.normalValue` / `retina.retinaValue` 的 `scale` 控制，不允许配置任意像素网格。
- `retina.normalValue` / `retina.retinaValue`：仅允许 `"1"`、`"2"`、`"3"`。
- `cache.ttlMs` / `cache.staleTtlMs`：接口使用毫秒；管理端应展示为天、小时、分钟并提交前换算。
- `proxy.mode`：`never`、`fixed`、`pool`
- `permissions.frontendVisible`：是否进入前台 catalog
- `permissions.precacheAllowed`：是否允许预缓存
- `permissions.externalApiAllowed`：是否允许对外发布
- `visibility.scope`：`system`、`external_only`

URL 模板只允许 `http/https`，且不允许指向 localhost、内网、link-local 或保留地址。支持占位符：`{s}`、`{x}`、`{y}`、`{z}`、`{scale}`、`{yTms}`、`{key}`、`{token}`、`{tk}`、`{appid}`、`{quadkey}`、`{fontstack}`、`{range}` 等。

### `GET /api/v1/admin/source-presets`

获取系统预置图源模板列表。预置模板只描述服务商、协议、默认入口、是否需要 Key 和合规信息，默认不可直接用于前台渲染。所有预置模板默认禁用，管理员需要基于模板创建图源实例。

返回字段包括：

- `presetId`
- `name`
- `vendor`
- `category`
- `kind`
- `adapter`
- `requiresKey`
- `requiredSecretTypes`
- `defaultKeyPlacement`
- `entry`
- `schema`
- `defaultDisabled`
- `status`：`ready`、`requires_adapter`、`research_only`
- `officialStatus`
- `licenseType`
- `cacheAllowedByLicense`
- `publicUseAllowed`
- `chinaPublicUseRisk`

### `POST /api/v1/admin/source-presets/:presetId/create-source`

基于预置模板创建图源实例。需要 Key 的模板如果未传入 `keyPoolId` 或 `secrets.keyPoolId`，后端会按预设厂商自动关联对应的系统默认密钥池，例如 `default-maptiler-key-pool`。创建后默认建议保持禁用；需要 Key 的图源只有在关联密钥池已启用且至少存在一个已配置密钥的启用 Key 时才能启用。

请求示例：

```json
{
  "id": "maptiler-streets-vector",
  "enabled": false,
  "keyPoolId": "maptiler-main",
  "permissions": {
    "frontendVisible": false,
    "externalApiAllowed": false
  }
}
```

常见错误：

- `404`：预置模板不存在。
- `400`：需要 Key 但没有可关联的密钥池，或关联密钥池没有可用 Key 却尝试启用。
- `400`：模板状态为 `requires_adapter` 或 `research_only`，却尝试直接启用。

## 密钥池管理

密钥池用于保存服务商 Key、Token、tk、ak、appid 等敏感凭证。密钥明文只允许创建或更新时提交，后端不提供读回能力。所有列表和详情接口只返回脱敏预览。

系统会根据内置预置图源中 `requiresKey=true` 的厂商自动初始化默认空密钥池。默认池不内置任何 Key，只保存厂商、默认 Key 类型、默认注入参数、允许关联的预设 ID 和官方申请/控制台入口。管理员基于预设创建图源时会自动关联对应默认池，后续只需进入该池添加并启用 Key。

当前默认池覆盖的厂商与入口：

| 厂商 | 默认池 ID | 默认参数 | 官方入口 |
| --- | --- | --- | --- |
| 天地图 | `default-tianditu-key-pool` | `tk` | `https://cloudcenter.tianditu.gov.cn/center/development/myApp` |
| 腾讯位置服务 | `default-tencent-key-pool` | `key` | `https://lbs.qq.com/console/setting.html` |
| 百度地图 | `default-baidu-key-pool` | `ak` | `https://lbsyun.baidu.com/apiconsole/key` |
| Google Maps Platform | `default-google-key-pool` | `key` | `https://console.cloud.google.com/google/maps-apis/credentials` |
| MapTiler | `default-maptiler-key-pool` | `key` | `https://cloud.maptiler.com/account/keys/` |
| Mapbox | `default-mapbox-key-pool` | `access_token` | `https://console.mapbox.com/account/access-tokens/` |
| Stadia Maps | `default-stadia-key-pool` | `api_key` | `https://client.stadiamaps.com/dashboard/` |
| HERE | `default-here-key-pool` | `apiKey` | `https://platform.here.com/access/apps` |
| Azure Maps | `default-microsoft-key-pool` | `subscription-key` | `https://portal.azure.com/` |
| Thunderforest | `default-thunderforest-key-pool` | `apikey` | `https://manage.thunderforest.com/dashboard` |
| OpenWeatherMap | `default-openweathermap-key-pool` | `appid` | `https://home.openweathermap.org/api_keys` |

密钥池选择策略：

- `round_robin`：健康 Key 轮询。
- `priority_failover`：按优先级选择，失败后可切换备用 Key。
- `random`：健康 Key 中随机选择。
- `weighted_round_robin`：按权重轮询。

### `GET /api/v1/admin/key-pools`

获取密钥池列表。返回中每个 Key 只包含 `maskedPreview`、`hasSecret`、`alias`、状态和统计字段，不包含 `secretValue` 或 `secretHash`。

### `POST /api/v1/admin/key-pools`

创建密钥池。

```json
{
  "id": "maptiler-main",
  "name": "MapTiler 主密钥池",
  "vendor": "maptiler",
  "enabled": true,
  "strategy": "round_robin",
  "cooldownMs": 300000,
  "maxRetriesPerRequest": 2,
  "defaultSecretType": "api_key",
  "defaultPlacement": "query",
  "defaultParamName": "key",
  "credentialUrl": "https://cloud.maptiler.com/account/keys/",
  "allowedPresetIds": ["preset:maptiler-streets-vector"],
  "keys": [
    {
      "id": "maptiler-key-a",
      "alias": "主 Key",
      "secretType": "api_key",
      "secret": "明文只在提交时出现",
      "placement": "query",
      "paramName": "key",
      "priority": 10,
      "weight": 1
    }
  ]
}
```

### `GET /api/v1/admin/key-pools/:id`

获取密钥池详情。不会返回密钥明文或密钥哈希。

### `PUT /api/v1/admin/key-pools/:id`

更新密钥池。Key 条目未传 `secret` 时保留原密钥；传入 `secret` 时替换密钥并更新脱敏预览。

### `DELETE /api/v1/admin/key-pools/:id`

删除密钥池。若仍被图源引用，返回错误并阻止删除。

### `POST /api/v1/admin/key-pools/:id/test`

测试密钥池是否启用且存在可用 Key。首期只做配置级测试，不请求第三方服务商。

### `POST /api/v1/admin/key-pools/:id/keys/:keyId/test`

测试密钥池中的单个 Key 是否启用且已配置密钥。首期只做配置级测试。

### `GET /api/v1/admin/tile-sources`

获取图源列表。管理接口会返回完整图源配置，包括 `template`、`cache`、`proxy`、`permissions` 和 `visibility`。

### `POST /api/v1/admin/tile-sources`

创建图源。

栅格图源请求示例：

```json
{
  "id": "custom-road",
  "name": "自定义街道",
  "enabled": true,
  "vendor": "custom",
  "category": "road",
  "kind": "xyz",
  "adapter": "template",
  "entry": {
    "template": "https://tiles.example.com/{z}/{x}/{y}.png"
  },
  "subdomains": [],
  "minZoom": 0,
  "maxZoom": 18,
  "maxNativeZoom": 18,
  "tileSize": 256,
  "retina": {
    "mode": "none",
    "param": "",
    "normalValue": "1",
    "retinaValue": "2"
  },
  "cache": {
    "enabled": true,
    "ttlMs": 21600000,
    "staleTtlMs": 2592000000
  },
  "accessLog": {
    "enabled": true,
    "maxLogCount": 500
  },
  "proxy": {
    "mode": "never",
    "poolId": "",
    "outboundId": "",
    "fallbackToDirect": false
  },
  "permissions": {
    "frontendVisible": true,
    "precacheAllowed": true,
    "externalApiAllowed": true,
    "userReferenceAllowed": true
  },
  "visibility": {
    "scope": "system"
  },
  "attribution": "",
  "bounds": null,
  "tags": [],
  "description": ""
}
```

矢量 Style 图源请求示例：

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
    "styleJsonUrl": "https://api.maptiler.com/maps/streets-v2/style.json?key={key}"
  },
  "secrets": {
    "required": true,
    "keyPoolId": "maptiler-main",
    "placement": "query",
    "paramName": "key"
  },
  "rendering": {
    "engine": "maplibre",
    "clients": ["2d"],
    "fallbackRasterSourceId": ""
  },
  "cache": {
    "enabled": true,
    "ttlMs": 86400000,
    "staleTtlMs": 604800000
  },
  "proxy": {
    "mode": "never"
  },
  "permissions": {
    "frontendVisible": false,
    "precacheAllowed": false,
    "externalApiAllowed": false,
    "userReferenceAllowed": false
  },
  "license": {
    "attribution": "MapTiler",
    "termsUrl": "",
    "officialStatus": "official",
    "licenseType": "api-key",
    "cacheAllowedByLicense": true,
    "publicUseAllowed": false
  }
}
```

### `GET /api/v1/admin/tile-sources/:id`

获取图源详情。

### `PUT /api/v1/admin/tile-sources/:id`

更新图源。路径中的 `:id` 为准，不允许通过请求体改 ID。

`accessLog` 为图源访问诊断日志策略，独立于对外发布项日志：

- `enabled`：是否记录该图源的访问诊断日志。
- `maxLogCount`：该图源最多保留的访问日志行数，范围 `0-10000`。只裁剪当前图源日志，不影响对外发布日志，也不影响其它图源。
- 当前默认记录通过代理访问或发生错误的图源请求，用于分析代理出口、代理池命中、缓存命中和耗时。

### `GET /api/v1/admin/tile-sources/:id/access-logs`

获取指定图源访问日志。日志字段包括：

- `timestamp`
- `sourceId`
- `publishId`：若访问来自对外发布项则记录发布项 ID，否则为空。
- `layerId`：若访问来自组合图层发布项则记录图层 ID，否则为空。
- `clientIp`
- `userAgent`
- `coordinates`
- `reqUrl`：已脱敏，`token` 和 `access_token` 会写为 `****`
- `statusCode`
- `duration`
- `cacheStatus`：`HIT`、`MISS`、`BYPASS`、`REVALIDATED`、`STALE` 或 `ERROR`
- `proxyMode`
- `proxyPoolId`
- `proxyOutboundId`
- `proxyConfigured`：该次请求是否配置过代理策略；若代理失败后允许直连，可能为 `true` 但 `proxyOutboundId` 为空。
- `cacheEnabled`
- `errorMessage`
- `resourceType`：`raster`、`style`、`tilejson`、`mvt`、`glyph`、`sprite-json`、`sprite-png`、`sprite-json-2x`、`sprite-png-2x`、`pmtiles-range`。
- `keyPoolId` / `keyId` / `keyAlias`：使用密钥池时记录脱敏标识，不记录明文 Key。

### `GET /api/v1/admin/source-access-logs`

获取全部图源访问日志，供后台诊断页“图源访问”视图使用。返回字段与单图源日志接口一致。该接口不读取也不占用对外发布项的 `log.maxLogCount`。

### `DELETE /api/v1/admin/tile-sources/:id`

删除图源。若图源仍被图层或发布项引用，返回错误并阻止删除。

## 图层管理

图层是一个或多个图源的展示组合。

### `GET /api/v1/admin/map-layers`

获取图层列表，按 `sortOrder` 排序。

### `POST /api/v1/admin/map-layers`

创建图层。

```json
{
  "id": "custom-hybrid",
  "name": "自定义混合图层",
  "enabled": true,
  "frontendVisible": true,
  "default": false,
  "type": "base",
  "clients": ["2d", "3d"],
  "items": [
    { "sourceId": "amap-satellite", "opacity": 1, "zIndex": 0 },
    { "sourceId": "amap-road", "opacity": 0.6, "zIndex": 1 }
  ],
  "minZoom": 3,
  "maxZoom": 18,
  "sortOrder": 100,
  "description": ""
}
```

字段约束：

- `type`：`base`、`overlay`
- `clients`：`2d`、`3d`
- `items` 至少一个，且每个 `sourceId` 必须存在。
- `opacity` 范围为 `0` 到 `1`。

### `PUT /api/v1/admin/map-layers/:id`

更新图层。

### `DELETE /api/v1/admin/map-layers/:id`

删除图层。若图层仍被对外发布项引用，返回错误并阻止删除。

### `PUT /api/v1/admin/map-layers-default`

设置默认图层。

```json
{
  "id": "amap-hybrid"
}
```

## 代理管理

代理出口表示一个具体代理连接；代理池是一组出口和选择策略。图源通过 `proxy.mode=fixed/pool` 关联代理；不再提供“继承系统默认代理”模式，默认策略应使用 `proxy.mode=never` 始终直连。

当前支持 HTTP/HTTPS 代理出口。复杂最优路由、地理位置优选、动态代理采购不在本系统内实现，可由外部代理工具暴露为普通代理出口后接入。

### `GET /api/v1/admin/proxy-outbounds`

获取代理出口列表。返回中不会包含 `password`，只包含 `hasPassword`。

### `POST /api/v1/admin/proxy-outbounds`

创建代理出口。

```json
{
  "id": "proxy-a",
  "name": "Proxy A",
  "enabled": true,
  "protocol": "http",
  "host": "proxy.example.com",
  "port": 8080,
  "username": "user",
  "password": "pass",
  "testUrl": "https://www.google.com/generate_204",
  "timeoutMs": 8000,
  "tags": ["google"],
  "description": ""
}
```

### `PUT /api/v1/admin/proxy-outbounds/:id`

更新代理出口。未传 `password` 时保留旧密码；传空字符串会清空密码。

### `DELETE /api/v1/admin/proxy-outbounds/:id`

删除代理出口。若仍被代理池或图源引用，返回错误并阻止删除。

### `GET /api/v1/admin/proxy-pools`

获取代理池列表。

### `POST /api/v1/admin/proxy-pools`

创建代理池。

```json
{
  "id": "google-pool",
  "name": "Google Pool",
  "enabled": true,
  "strategy": "priority",
  "members": [
    { "outboundId": "proxy-a", "priority": 100, "weight": 1 }
  ],
  "failover": {
    "enabled": true,
    "cooldownMs": 60000,
    "maxAttemptsPerRequest": 2
  },
  "description": ""
}
```

`strategy` 支持 `priority`、`round_robin`、`failover`。当前后端已支持优先级选择和轮询选择；出口失败后的完整多出口自动重试属于后续增强，当前请求失败会按缓存 stale 策略兜底。

### `PUT /api/v1/admin/proxy-pools/:id`

更新代理池。

### `DELETE /api/v1/admin/proxy-pools/:id`

删除代理池。若仍被图源引用，返回错误并阻止删除。

## 对外发布 API

旧版单一 upstream 接口 `/api/v1/external/tile` 已移除。对外服务统一通过“发布项”管理，一个发布项可以发布系统图源、系统图层或专用图源。

发布项模型关键字段：

- `targetType`：`source`、`layer`、`dedicated_source`
- `auth.mode`：`none`、`token`
- `rateLimit.enabled`：是否启用应用内每分钟限流
- `rateLimit.maxRequestsPerMinute`：单客户端每分钟请求上限
- `log.maxLogCount`：保留最近日志条数，`0` 表示不记录
- `overrides.proxy`：可选，覆盖图源代理策略；为 `null` 时表示不覆盖，继续使用目标图源自身策略。
- `overrides.cache`：可选，覆盖图源缓存策略；为 `null` 时表示不覆盖，继续使用目标图源自身策略。接口字段仍为毫秒，管理端展示为天、小时、分钟。

### `GET /api/v1/admin/external-publishes`

获取发布项列表。返回中的 `auth` 只包含 `mode`、`tokenPreview`、`hasToken`，不返回 `tokenHash` 或明文 Token。

### `POST /api/v1/admin/external-publishes`

创建发布项。若 `auth.mode=token` 且未传 `auth.token`，后端自动生成 Token，并且只在创建响应中返回一次。

```json
{
  "id": "amap-road-public",
  "name": "高德街道对外服务",
  "enabled": true,
  "targetType": "source",
  "targetId": "amap-road",
  "pathSlug": "amap-road-public",
  "auth": {
    "mode": "token"
  },
  "rateLimit": {
    "enabled": true,
    "maxRequestsPerMinute": 600
  },
  "log": {
    "enabled": true,
    "maxLogCount": 500
  },
  "overrides": {
    "proxy": null,
    "cache": null
  },
  "description": ""
}
```

返回示例：

```json
{
  "publish": {
    "id": "amap-road-public",
    "name": "高德街道对外服务",
    "enabled": true,
    "targetType": "source",
    "targetId": "amap-road",
    "pathSlug": "amap-road-public",
    "auth": {
      "mode": "token",
      "tokenPreview": "abcd****wxyz",
      "hasToken": true
    }
  },
  "token": "仅本次返回的明文 Token"
}
```

### `PUT /api/v1/admin/external-publishes/:id`

更新发布项。路径中的 `:id` 为准。若请求体包含 `auth.token`，后端会更新 Token 并只在本次响应返回明文。

### `DELETE /api/v1/admin/external-publishes/:id`

删除发布项。不会删除图源和缓存。

### `POST /api/v1/admin/external-publishes/:id/token`

重置发布项 Token。只在本次响应返回明文 Token。

### `GET /api/v1/admin/external-publishes/:id/logs`

获取指定发布项日志。日志字段包括：

- `timestamp`
- `publishId`
- `sourceId`
- `layerId`
- `clientIp`
- `userAgent`
- `coordinates`
- `reqUrl`：已脱敏，`token` 和 `access_token` 会写为 `****`
- `statusCode`
- `duration`
- `cacheStatus`
- `proxyPoolId`
- `proxyOutboundId`
- `errorMessage`

### `GET /api/v1/admin/external-publish-logs`

获取全部发布项访问日志，供后台诊断页“全部发布项”筛选使用。返回字段与单发布项日志接口一致。

### `GET /api/v1/external/:publishId/tilejson`

获取发布项 TileJSON 或组合说明。若发布项启用 Token，必须传 `?token=<token>`。

单图源发布返回：

```json
{
  "tilejson": "3.0.0",
  "id": "amap-road-public",
  "name": "高德街道对外服务",
  "minzoom": 3,
  "maxzoom": 18,
  "attribution": "高德地图 AutoNavi.com",
  "tokenRequired": true,
  "auth": { "mode": "token" },
  "tiles": [
    "/api/v1/external/amap-road-public/{z}/{x}/{y}"
  ]
}
```

组合图层发布返回：

```json
{
  "tilejson": "3.0.0",
  "id": "hybrid-public",
  "name": "混合图层对外服务",
  "type": "layer",
  "minzoom": 3,
  "maxzoom": 18,
  "tokenRequired": true,
  "auth": { "mode": "token" },
  "layer": {
    "id": "amap-hybrid",
    "items": [
      {
        "sourceId": "amap-road",
        "opacity": 0.5,
        "zIndex": 1,
        "tileUrl": "/api/v1/external/hybrid-public/sources/amap-road/{z}/{x}/{y}"
      }
    ]
  },
  "sources": [
    {
      "id": "amap-road",
      "tileUrl": "/api/v1/external/hybrid-public/sources/amap-road/{z}/{x}/{y}",
      "opacity": 0.5,
      "zIndex": 1
    }
  ]
}
```

出于安全考虑，TileJSON 中的 `tiles` 和 `tileUrl` 不自动拼接 Token；第三方客户端需要自行追加 `?token=<token>`。

### `GET /api/v1/external/:publishId/:z/:x/:y`

获取单图源或专用图源发布项瓦片。

查询参数：

- `token`：当 `auth.mode=token` 时必填。
- `scale`：可选，透传给图源 URL 模板的 `{scale}`。

组合图层发布项调用该接口会返回 `400`，应使用下面的 source tile 接口。

### `GET /api/v1/external/:publishId/sources/:sourceId/:z/:x/:y`

获取组合图层发布项中某个图源的瓦片。外部客户端应按 TileJSON 中的 `layer.items` 或 `sources` 顺序自行叠加多个图源。

查询参数同上。

### `GET /api/v1/external/:publishId/style.json`

获取对外发布项的矢量 Style JSON。发布项必须引用 `kind=vector-style` 的图源，且图源允许对外发布。若发布项启用 Token，必须传 `?token=<token>`。

服务端会将上游 Style JSON 中的 MVT、TileJSON、glyph 和 sprite 资源改写为发布项路径：

```json
{
  "version": 8,
  "sources": {
    "openmaptiles": {
      "type": "vector",
      "tiles": [
        "/api/v1/external/maptiler-public/tiles/<ref>/{z}/{x}/{y}.pbf"
      ]
    }
  },
  "glyphs": "/api/v1/external/maptiler-public/glyphs/<ref>/{fontstack}/{range}.pbf",
  "sprite": "/api/v1/external/maptiler-public/sprites/<ref>/sprite"
}
```

返回内容不会包含内部 `sourceId`、`keyPoolId` 或上游 Key。出于安全考虑，发布项 Token 不会自动写入 Style JSON；第三方 MapLibre 客户端如使用 `auth.mode=token`，应通过 `transformRequest` 为 `/api/v1/external/:publishId/...` 派生资源追加 `?token=<token>`。

### `GET /api/v1/external/:publishId/tilejson.json`

获取对外发布项的矢量 TileJSON。发布项必须引用 `kind=vector-tilejson`，或引用配置了 TileJSON 入口的矢量图源。

返回中的 `tiles[]` 会被改写为：

```json
{
  "tilejson": "3.0.0",
  "tiles": [
    "/api/v1/external/maptiler-public/tiles/<ref>/{z}/{x}/{y}.pbf"
  ]
}
```

### `GET /api/v1/external/:publishId/sources/:ref/tilejson.json`

获取由对外 Style JSON 派生出来的 TileJSON。该路径由 Style JSON 自动生成。

### `GET /api/v1/external/:publishId/tiles/:z/:x/:y.pbf`

获取对外发布项直接配置的 MVT 瓦片。适用于引用 `kind=mvt` 或配置了 `entry.template` 的矢量图源。

### `GET /api/v1/external/:publishId/tiles/:ref/:z/:x/:y.pbf`

获取对外 Style JSON 或 TileJSON 派生出来的 MVT 瓦片。

### `GET /api/v1/external/:publishId/glyphs/:fontstack/:range.pbf`

获取对外发布项直接配置的 glyph 字体切片。

### `GET /api/v1/external/:publishId/glyphs/:ref/:fontstack/:range.pbf`

获取对外 Style JSON 派生出来的 glyph 字体切片。

### `GET /api/v1/external/:publishId/sprites/sprite.json`

获取对外发布项直接配置的 sprite JSON。

### `GET /api/v1/external/:publishId/sprites/sprite.png`

获取对外发布项直接配置的 sprite 图片。

### `GET /api/v1/external/:publishId/sprites/:ref/sprite.json`

获取对外 Style JSON 派生出来的 sprite JSON。

### `GET /api/v1/external/:publishId/sprites/:ref/sprite.png`

获取对外 Style JSON 派生出来的 sprite 图片。

### `GET /api/v1/external/:publishId/sprites/:ref/sprite@2x.json`

获取对外 Style JSON 派生出来的高清 sprite JSON。

### `GET /api/v1/external/:publishId/sprites/:ref/sprite@2x.png`

获取对外 Style JSON 派生出来的高清 sprite 图片。

### `GET /api/v1/external/:publishId.pmtiles`

获取对外发布项的 PMTiles 文件或 Range 响应。发布项必须引用 `kind=pmtiles-vector` 或 `kind=pmtiles-raster` 的图源。

## 预缓存接口

当前预缓存接口仍保留 `providerId` 任务模型，供现有后台任务使用。它不是新图源目录的事实来源；后续应重构为按 `sourceId` 或 `layerId` 创建任务。

### `GET /api/v1/admin/precache/providers`

返回可预缓存 provider 目录。

### `GET /api/v1/admin/precache/tasks`

返回最近预缓存任务快照。

### `POST /api/v1/admin/precache/estimate`

估算预缓存任务规模。

### `POST /api/v1/admin/precache/tasks`

创建预缓存任务。

```json
{
  "providerId": "amap-road",
  "bounds": {
    "west": 113.24,
    "south": 23.11,
    "east": 113.29,
    "north": 23.15
  },
  "minZoom": 12,
  "maxZoom": 12,
  "concurrency": 4,
  "requestIntervalMs": 0,
  "refresh": false
}
```

### `POST /api/v1/admin/precache/tasks/:id/pause`

暂停预缓存任务。

### `POST /api/v1/admin/precache/tasks/:id/resume`

继续预缓存任务。

### `DELETE /api/v1/admin/precache/tasks/:id`

删除预缓存任务。可选查询参数 `deleteCache=true` 表示同时删除该任务关联缓存。

## KML 接口

### `GET /api/v1/kml/shared`

获取已发布的公共 KML 列表。

### `GET /api/v1/kml/shared/:id`

获取已发布的公共 KML 详情。

### `GET /api/v1/kml/shared/:id/features/:featureId/content`

获取已发布公共 KML 单个点位的富媒体内容视图。接口继承前台访问控制；如果地图访问密码已启用，必须先通过访问验证。

第一阶段只解析点位 `description` 中的 HTTPS URL，不做任意 URL 代理、远程抓取、截图、转码或上传。图片、视频、iframe 和普通链接按规则分组返回。iframe 默认拒绝，只在服务端 `MAP_SERVICE_KML_IFRAME_ALLOWLIST` 配置命中时作为 `iframe` 类型返回，否则作为普通链接处理。

成功响应示例：

```json
{
  "code": 0,
  "result": {
    "sharedKmlId": "shared-kml-1719561600000-a1b2c3",
    "featureId": "feat-1719561600001-d4e5f6",
    "version": "shared-kml-1719561600000-a1b2c3:2026-07-07T08:00:00.000Z",
    "groups": [
      {
        "type": "image",
        "title": "图片",
        "items": [
          {
            "id": "description-link-1",
            "type": "image",
            "title": "cdn.example.com",
            "description": "",
            "url": "https://cdn.example.com/site-a/front.webp",
            "displayUrl": "https://cdn.example.com/site-a/front.webp",
            "thumbnailUrl": "https://cdn.example.com/site-a/front.webp",
            "sourceType": "description-link",
            "embedPolicy": null
          }
        ]
      },
      {
        "type": "video",
        "title": "视频",
        "items": []
      },
      {
        "type": "iframe",
        "title": "页面",
        "items": []
      },
      {
        "type": "link",
        "title": "链接",
        "items": []
      }
    ],
    "contentSummary": {
      "imageCount": 1,
      "videoCount": 0,
      "iframeCount": 0,
      "linkCount": 0,
      "hasRichContent": true
    },
    "sourceSummary": {
      "bindings": 0,
      "libraries": 0,
      "descriptionLinks": 1,
      "rejected": 0,
      "truncated": false
    },
    "rejected": []
  },
  "error": null
}
```

错误响应：

```json
{
  "code": -1,
  "result": null,
  "error": {
    "message": "KML 点位不存在或未发布"
  }
}
```

字段说明：

| 字段 | 说明 |
| --- | --- |
| `groups[].type` | 内容分组类型：`image` / `video` / `iframe` / `link` |
| `groups[].items[].sourceType` | 第一阶段固定为 `description-link` |
| `groups[].items[].url` | 已脱敏后的 HTTPS URL；敏感查询参数会替换为 `****` |
| `groups[].items[].embedPolicy` | iframe 内容的 sandbox 和 referrer policy；非 iframe 为 `null` |
| `contentSummary` | 点位内容数量摘要，用于前端轻量展示 |
| `sourceSummary.truncated` | 描述中 URL 超过解析上限时为 `true` |
| `rejected` | 因协议、主机安全策略等被拒绝的 URL 摘要 |

### `GET /api/v1/admin/kml`

管理员获取所有公共 KML 列表。

### `GET /api/v1/admin/kml/:id`

管理员获取指定公共 KML 详情。

### `POST /api/v1/admin/kml`

管理员创建公共 KML。

### `PUT /api/v1/admin/kml/:id`

管理员更新公共 KML。

### `DELETE /api/v1/admin/kml/:id`

管理员删除公共 KML。

### `POST /api/v1/admin/kml/import`

管理员上传 KML 文件并创建公共 KML。请求类型为 `multipart/form-data`，文件字段名为 `file`。

## 已移除接口

以下接口不再作为后端契约提供：

- `GET /api/v1/external/tile`：旧版单一 upstream 对外瓦片接口，已由发布项接口替代。
- `GET /api/v1/admin/tile-api/logs`
- `DELETE /api/v1/admin/tile-api/logs`
- `GET /api/v1/cache/fetch-relay`
- 随机本地文件选择、Wallhaven 壁纸选择、GitLab webhook、静态资源/包搜索辅助接口和 `/login`

新增接口应放在 `/api/v1` 下，在 `service/bin/simpleApi.js` 注册，并同步更新本文档。
