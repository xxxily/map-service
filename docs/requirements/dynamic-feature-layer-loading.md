# 动态 Feature Layer 视口加载与服务端聚合需求

状态：需求细化，尚未实现。实现接口时必须同步更新 `docs/api.md` 和相关测试。

## 背景和目标

当前公共 KML 图层在前台启用后通过 `GET /api/v1/kml/shared/:id` 拉取完整
`features` 数组，再由 2D Leaflet 或 3D Cesium 一次性渲染全部要素。这个模式适合小型
KML，但当点位数量进入几千、几万后，会同时放大服务端 JSON 读取、网络传输、浏览器内存、
DOM Marker 和 Cesium Entity 的成本。

本需求基于 2026-07-03 的 KML 动态加载调研报告，优先落实：

- 方案 C：BBOX/视口 Feature API。
- 方案 D：Server-side Cluster API。

核心决策：KML 继续作为导入、导出和轻量交换格式；公共图层进入在线渲染链路后应被规范化为
Feature Layer，由服务端按视口、缩放级别和聚合结果提供数据。

本次目标：

1. 前台启用大型公共 KML 时，不再默认下载完整 `features`。
2. 后端提供稳定的 manifest、bbox features、feature detail 和 clusters 接口。
3. 后端为公共 KML 构建空间索引，能快速查询当前视口内要素。
4. 低缩放级别或点位过密时返回服务端聚合结果，避免浏览器渲染海量点。
5. 2D 和 3D 共用同一套动态要素接口、ID、版本和安全边界。

## 用户和场景

### 普通前台用户

- 在地图上按需启用公共 KML 图层。
- 地图移动或缩放后，只看到当前视口相关点位、线和面。
- 低缩放查看大范围时，看到聚合点和数量；放大后再看到真实点位。
- 点击真实要素后加载详情，不因图层数据量大导致首次打开卡顿。

### 管理员

- 继续通过后台或前台管理公共 KML 的导入、发布、禁用、删除和编辑。
- 导入或更新公共 KML 后，系统自动计算要素 bbox、图层 extent、数据版本和索引元数据。
- 能在后台看到图层是否支持动态加载、聚合能力和要素规模。

## 范围

### 范围内

- 公共 KML 发布图层的动态加载能力。
- Feature Layer 数据模型、normalize/validate/sanitize 规则。
- `manifest`、`features?bbox=...`、`features/:featureId`、`clusters?bbox=...` 公开接口。
- 服务端内存空间索引和点聚合索引。
- 2D Leaflet 前台公共 KML 加载逻辑改造。
- 3D Cesium 公共 KML 加载逻辑复用同一接口。
- 访问控制、输入校验、响应脱敏、缓存版本和错误处理。
- `node:test` 覆盖后端服务、路由、模型校验、安全边界和错误分支。

### 暂不纳入

- MVT、PMTiles、PostGIS、Martin、ST_AsMVT 等中长期瓦片化或空间数据库方案。
- KML Region、Lod、NetworkLink 的 Web 端主链路实现。
- 个人 localStorage KML 的动态加载改造。
- 多管理员协同编辑、版本冲突合并和审计日志。
- 按用户组或角色的细粒度图层权限。
- 任意 URL KML 动态代理或外部 URL 拉取。

## 核心概念

### Feature Layer

由公共 KML 导入后规范化得到的在线渲染图层。Feature Layer 有稳定 `layerId`、元信息、
空间范围、版本号、能力声明和一组规范化 Feature。当前阶段仍可复用
`.db/admin/shared-kml.json` 和 `AdminStore` 持久化，但服务层必须暴露为 Feature Layer
语义，而不是直接把 KML 文件结构透传给前端。

### Feature

单个点、线或面要素。服务端存储和索引统一使用 KML 标准 WGS84 经纬度。前端根据
`coordCorrection` 决定显示时是否做 WGS84 到 GCJ-02 纠偏，不能把纠偏后的坐标写回服务端
或导出的 KML。

### BBOX

视口查询参数，格式固定为：

```text
minLng,minLat,maxLng,maxLat
```

坐标系固定为 WGS84/CRS84，经度在 `[-180, 180]`，纬度在 `[-90, 90]`。正常 bbox 要求
`minLng <= maxLng` 且 `minLat <= maxLat`。如果前端视口跨越反经线，第一阶段由前端拆成
两个标准 bbox 请求，后续可在服务端增加跨反经线自动拆分。

### Version

图层数据版本。每次公共 KML 创建、导入、保存、发布内容变更或删除要素后必须变化。建议格式：

```text
<layerId>:<revision>
```

客户端缓存键必须包含 `layerId`、`version`、`bbox`、`zoom`、过滤条件和访问语义。

## 功能需求

### F1. 动态能力清单

公共 KML 列表仍由 `GET /api/v1/kml/shared` 提供轻量摘要。前台启用某个公共 KML 时，应先
请求 `manifest` 判断图层能力，而不是直接请求完整详情。

`manifest` 必须返回：

- 图层稳定 ID 和名称。
- 状态、更新时间和版本。
- 要素总数、点线面分类数量和空间范围。
- 坐标纠偏模式。
- 动态加载能力：`bbox`、`cluster`、`featureDetail`、`kmlExport`。
- 查询限制：默认 limit、最大 limit、聚合阈值、聚合最大缩放级别。

`manifest` 不得返回 `features` 数组、管理备注、Token、代理认证信息或敏感请求头。

### F2. BBOX 视口要素查询

前台按当前地图视口和缩放级别请求：

```http
GET /api/v1/kml/shared/:id/features?bbox=minLng,minLat,maxLng,maxLat&zoom=12&limit=1000
```

服务端只返回 bbox 相交的轻量 Feature。点要素按点坐标判断是否落入 bbox；线和面按要素
预计算 bbox 与查询 bbox 是否相交。第一阶段不要求对线面做几何裁切，但必须返回完整几何
和要素 bbox，便于前端渲染。

查询规则：

- `bbox` 必填，必须是四个有限数字。
- `zoom` 必填，必须是整数，允许范围为 `0` 到 `24`。
- `limit` 可选，默认 `1000`，最大 `5000`。
- 超过 `limit` 时必须返回 `truncated: true`，不得静默丢弃。
- `cursor` 可选，用于同一 bbox 下翻页；第一阶段可只返回 `nextCursor: null`，但响应结构需保留。
- `geometryTypes` 可选，逗号分隔，允许值为 `Point`、`LineString`、`Polygon`。
- 图层不存在、未发布或禁用时返回 404。
- 访问控制启用时，必须校验前台访问 cookie。

返回的 Feature 摘要应包含渲染所需字段，不默认携带大段完整描述：

- `id`
- `type`
- `name`
- `geometry`
- `bbox`
- `style`
- `propertiesSummary`
- `updatedAt`

详情字段如完整 `description`、大体积扩展属性和编辑字段由 feature detail 接口按需加载。

### F3. 单要素详情查询

前台点击真实要素、打开弹窗或进入详情面板时请求：

```http
GET /api/v1/kml/shared/:id/features/:featureId
```

该接口返回单个要素完整详情：

- 完整 `description`。
- 完整公开 `properties`。
- 完整 `style`。
- 原始几何和 bbox。
- `layerId`、`featureId`、`version`、`updatedAt`。

接口不得返回管理备注、导入临时路径、服务端内部索引结构或敏感字段。

### F4. 服务端点聚合

点位图层在低缩放级别通过服务端聚合接口加载：

```http
GET /api/v1/kml/shared/:id/clusters?bbox=minLng,minLat,maxLng,maxLat&zoom=8
```

聚合接口只处理 `Point` 要素。混合点线面图层中，前端应同时使用 `clusters` 加载点聚合，
并使用 `features` 按需加载线面，或在较高缩放级别统一加载真实要素。

聚合规则：

- `bbox` 和 `zoom` 校验规则与 features 接口一致。
- `zoom <= clusterMaxZoom` 时返回聚合点和少量未聚合真实点。
- `zoom > clusterMaxZoom` 时可返回真实点摘要，`clusters` 为空。
- 每个 cluster 必须包含稳定 `id`、中心坐标、包含点数量和 cluster bbox。
- cluster 点击后，前端根据 cluster bbox 放大或移动到更合适视图。
- 当 bbox 内真实点数超过阈值且请求方仍要求真实点时，服务端应返回 `truncated: true` 或提示使用聚合接口。

聚合汇总属性第一阶段至少包含：

- `pointCount`
- `bbox`

后续可扩展状态计数、最大告警级别等业务汇总，但必须先在需求和 API 文档中补充字段契约。

### F5. 前端动态加载工作流

前台公共 KML 启用流程：

1. 用户在公共 KML 分区打开图层开关。
2. 前端请求 `manifest`。
3. 前端根据 `capabilities`、当前 zoom 和 `featureCount` 选择 `clusters` 或 `features`。
4. 地图移动或缩放后，前端 debounce 150 到 300ms 再发起新请求。
5. 新请求发起时，使用 `AbortController` 取消同一图层旧请求。
6. 响应返回后，只有请求版本仍是当前视图版本时才允许更新地图。
7. 前端用 `layerId + featureId` 和 `layerId + clusterId` 做稳定 key，按 diff 增删图层对象。
8. 图层关闭时，中止请求、清理缓存、移除地图对象和详情面板状态。

视口请求应外扩 20% 到 50% 作为预取 buffer，减少轻微拖动造成的闪烁。外扩后仍必须受经纬度
范围约束。

### F6. 2D Leaflet 渲染要求

- 公共 KML 不再默认渲染完整 `features` 数组。
- 低缩放优先展示 cluster marker。
- 高缩放展示真实点、线、面。
- 点要素数量较少时可继续使用现有 marker 或 circle marker。
- 单次视口真实点数量较多时，应优先使用 Canvas renderer、CircleMarker 或后续 MapLibre 图层，不得无限创建 DOM Marker。
- 面板要素列表只展示当前视口结果、搜索结果或用户选中的结果，不默认列出全量要素。
- `truncated: true` 时使用项目统一提示组件告知用户“当前范围要素过多，请放大地图查看更多”，不得使用原生 `alert`。

### F7. 3D Cesium 渲染要求

- 3D 页面使用同一套 `manifest`、`features`、`clusters` 和 `feature detail` 接口。
- 相机移动后按当前视域 bbox 增量加载。
- 使用稳定 key diff 维护 Cesium entities，不能每次视角变化都全量清空重建。
- 大量点位场景应评估 `PointPrimitiveCollection`，不得无限创建 entity。
- 3D 与 2D 的坐标纠偏规则保持一致。

### F8. 后端索引与存储

后端服务层必须承载以下能力，路由层只做鉴权、参数读取、调用服务和响应封装：

- 公共 KML 导入或更新时 normalize Feature。
- 为每个 Feature 计算 bbox。
- 为每个 Feature 生成稳定 ID；已有 ID 必须尽量保持。
- 为图层计算 extent、featureCount、geometryTypes 和 revision。
- 为每个已发布图层构建 bbox 空间索引。
- 为点要素构建 cluster 索引。
- 图层内容变化后使旧索引失效并重建。

第一阶段可继续使用 `.db/admin/shared-kml.json` 和 `AdminStore`。已有旧结构数据可在读取时兼容：

- 缺少 `bbox` 的 Feature，读取时补算。
- 缺少 `revision` 的图层，按 `updatedAt` 或内容 hash 生成版本。
- 缺少 `geometry` 字段的旧 Feature，按现有 `type` 和 `coordinates` 转为 GeoJSON 风格 geometry。

索引只作为运行态结构，不直接暴露给 API。服务重启后可从持久化数据重建索引。

### F9. 兼容旧完整详情接口

`GET /api/v1/kml/shared/:id` 当前用于返回完整公共 KML。动态加载上线后：

- 前台普通浏览默认不得再用该接口加载已发布公共 KML。
- 该接口可继续用于小数据兼容、导出或管理编辑前的完整载入。
- 对超过阈值的大图层，后续可要求该接口返回明确错误，提示使用动态加载接口；正式改变前必须更新
  `docs/api.md` 并保留迁移说明。

## 数据模型

### Feature Layer

```json
{
  "id": "shared-kml-1719561600000-a1b2c3",
  "name": "设备巡检点位",
  "status": "published",
  "sourceFormat": "kml",
  "coordCorrection": "wgs84-to-gcj02",
  "featureCount": 120000,
  "geometryCounts": {
    "Point": 119200,
    "LineString": 700,
    "Polygon": 100
  },
  "extent": [112.8, 22.6, 114.2, 23.8],
  "revision": 42,
  "version": "shared-kml-1719561600000-a1b2c3:42",
  "capabilities": {
    "bbox": true,
    "cluster": true,
    "featureDetail": true,
    "kmlExport": true,
    "mvt": false,
    "pmtiles": false
  },
  "queryLimits": {
    "defaultLimit": 1000,
    "maxLimit": 5000,
    "clusterMaxZoom": 10,
    "clusterPointThreshold": 500
  },
  "createdAt": "2026-07-03T14:00:00.000Z",
  "updatedAt": "2026-07-03T14:00:00.000Z"
}
```

### Feature

```json
{
  "id": "feat-1719561600001-d4e5f6",
  "layerId": "shared-kml-1719561600000-a1b2c3",
  "type": "Point",
  "geometry": {
    "type": "Point",
    "coordinates": [113.264, 23.129]
  },
  "bbox": [113.264, 23.129, 113.264, 23.129],
  "name": "1 号基站",
  "description": "位于某某路口",
  "properties": {
    "sourceName": "1 号基站"
  },
  "style": {},
  "sourceFormat": "kml",
  "createdAt": "2026-07-03T14:00:00.000Z",
  "updatedAt": "2026-07-03T14:00:00.000Z"
}
```

字段要求：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `id` | string | 是 | 稳定要素 ID，不使用中文名称作为主键 |
| `layerId` | string | 是 | 所属公共图层 ID |
| `type` | string | 是 | `Point`、`LineString`、`Polygon` |
| `geometry` | object | 是 | GeoJSON 风格几何，坐标为 WGS84 |
| `bbox` | array | 是 | `[minLng,minLat,maxLng,maxLat]` |
| `name` | string | 否 | 展示名称，服务端需长度限制 |
| `description` | string | 否 | 完整描述，只在详情接口默认返回 |
| `properties` | object | 否 | 公开属性，必须经过 sanitize |
| `style` | object | 否 | 前端渲染样式，必须经过白名单校验 |
| `sourceFormat` | string | 是 | 当前为 `kml` |
| `createdAt` | string | 是 | ISO 8601 时间 |
| `updatedAt` | string | 是 | ISO 8601 时间 |

## API 契约草案

所有 JSON 响应沿用项目统一结构：

```json
{
  "code": 0,
  "result": {},
  "error": null
}
```

错误响应使用：

```json
{
  "code": -1,
  "result": null,
  "error": {
    "message": "bbox 参数格式无效"
  }
}
```

### 获取动态能力清单

```http
GET /api/v1/kml/shared/:id/manifest
```

鉴权：

- 管理员 Token 不必需。
- 前台访问控制启用时必须携带有效 `map_access_token` Cookie。
- 只允许访问 `status === "published"` 的公共 KML。

成功响应：

```json
{
  "code": 0,
  "result": {
    "id": "shared-kml-1719561600000-a1b2c3",
    "name": "设备巡检点位",
    "status": "published",
    "coordCorrection": "wgs84-to-gcj02",
    "featureCount": 120000,
    "geometryCounts": {
      "Point": 119200,
      "LineString": 700,
      "Polygon": 100
    },
    "extent": [112.8, 22.6, 114.2, 23.8],
    "geometryTypes": ["Point", "LineString", "Polygon"],
    "version": "shared-kml-1719561600000-a1b2c3:42",
    "updatedAt": "2026-07-03T14:00:00.000Z",
    "capabilities": {
      "bbox": true,
      "cluster": true,
      "featureDetail": true,
      "kmlExport": true,
      "mvt": false,
      "pmtiles": false
    },
    "queryLimits": {
      "defaultLimit": 1000,
      "maxLimit": 5000,
      "clusterMaxZoom": 10,
      "clusterPointThreshold": 500
    }
  },
  "error": null
}
```

### 按视口查询要素

```http
GET /api/v1/kml/shared/:id/features?bbox=113,23,114,24&zoom=12&limit=1000
```

查询参数：

| 参数 | 必填 | 说明 |
| --- | --- | --- |
| `bbox` | 是 | `minLng,minLat,maxLng,maxLat` |
| `zoom` | 是 | 整数，`0` 到 `24` |
| `limit` | 否 | 默认 `1000`，最大 `5000` |
| `cursor` | 否 | 翻页游标，第一阶段可为空 |
| `geometryTypes` | 否 | 逗号分隔的几何类型白名单 |

成功响应：

```json
{
  "code": 0,
  "result": {
    "layerId": "shared-kml-1719561600000-a1b2c3",
    "bbox": [113, 23, 114, 24],
    "zoom": 12,
    "version": "shared-kml-1719561600000-a1b2c3:42",
    "features": [
      {
        "id": "feat-1719561600001-d4e5f6",
        "type": "Point",
        "name": "1 号基站",
        "geometry": {
          "type": "Point",
          "coordinates": [113.264, 23.129]
        },
        "bbox": [113.264, 23.129, 113.264, 23.129],
        "style": {},
        "propertiesSummary": {}
      }
    ],
    "nextCursor": null,
    "truncated": false
  },
  "error": null
}
```

错误示例：

| HTTP 状态 | 场景 | `error.message` |
| --- | --- | --- |
| 400 | bbox 缺失或格式错误 | `bbox 参数格式无效` |
| 400 | zoom 非法 | `zoom 参数必须是 0 到 24 的整数` |
| 400 | limit 超过上限 | `limit 参数不能超过 5000` |
| 401 | 未通过前台访问控制 | `拒绝访问：未提供有效的地图访问授权` |
| 404 | 图层不存在、未发布或已禁用 | `公共 KML 不存在或不可访问` |

### 查询聚合点

```http
GET /api/v1/kml/shared/:id/clusters?bbox=113,23,114,24&zoom=8
```

成功响应：

```json
{
  "code": 0,
  "result": {
    "layerId": "shared-kml-1719561600000-a1b2c3",
    "bbox": [113, 23, 114, 24],
    "zoom": 8,
    "version": "shared-kml-1719561600000-a1b2c3:42",
    "mode": "cluster",
    "clusters": [
      {
        "id": "cluster-8-12345",
        "type": "Cluster",
        "coordinates": [113.2, 23.1],
        "pointCount": 418,
        "bbox": [113.0, 23.0, 113.4, 23.3],
        "propertiesSummary": {}
      }
    ],
    "features": [],
    "truncated": false
  },
  "error": null
}
```

当 zoom 已超过聚合最大缩放级别时，可返回：

```json
{
  "code": 0,
  "result": {
    "layerId": "shared-kml-1719561600000-a1b2c3",
    "bbox": [113, 23, 114, 24],
    "zoom": 13,
    "version": "shared-kml-1719561600000-a1b2c3:42",
    "mode": "feature",
    "clusters": [],
    "features": [
      {
        "id": "feat-1719561600001-d4e5f6",
        "type": "Point",
        "name": "1 号基站",
        "geometry": {
          "type": "Point",
          "coordinates": [113.264, 23.129]
        },
        "bbox": [113.264, 23.129, 113.264, 23.129],
        "style": {},
        "propertiesSummary": {}
      }
    ],
    "truncated": false
  },
  "error": null
}
```

### 获取单要素详情

```http
GET /api/v1/kml/shared/:id/features/:featureId
```

成功响应：

```json
{
  "code": 0,
  "result": {
    "layerId": "shared-kml-1719561600000-a1b2c3",
    "version": "shared-kml-1719561600000-a1b2c3:42",
    "feature": {
      "id": "feat-1719561600001-d4e5f6",
      "type": "Point",
      "name": "1 号基站",
      "description": "位于某某路口",
      "geometry": {
        "type": "Point",
        "coordinates": [113.264, 23.129]
      },
      "bbox": [113.264, 23.129, 113.264, 23.129],
      "properties": {
        "sourceName": "1 号基站"
      },
      "style": {},
      "updatedAt": "2026-07-03T14:00:00.000Z"
    }
  },
  "error": null
}
```

## 非功能需求

### 性能

- `manifest` 响应不包含 `features`，大型图层响应体应保持轻量。
- `features` 单次默认最多返回 1000 个要素，绝对上限 5000。
- `clusters` 低缩放返回对象数量应受控，避免单次响应生成几千个 cluster marker。
- 后端 bbox 查询不得每次全量扫描所有 Feature；必须通过空间索引或等价可测试机制完成。
- 公共 KML 禁用或图层关闭时，前端应释放该图层已创建的 Marker、Layer、Entity 和请求缓存。

### 安全

- 不新增任意 URL 代理入口。
- 公开接口只能通过受控公共 KML ID 访问。
- 前台访问控制启用时，动态加载接口和现有公共 KML 接口使用同一访问 cookie 校验。
- 管理接口仍需管理员 Bearer Token，不因新增公开查询而放宽。
- `bbox`、`zoom`、`limit`、`cursor`、`geometryTypes` 和 `featureId` 必须严格校验。
- 错误消息使用中文，不泄露内部路径、堆栈、索引结构、上游 URL、Token 或密钥。
- 返回给前端的 `name`、`description`、`properties` 和 `style` 必须 sanitize，前端渲染时仍需转义 HTML。

### 一致性

- 服务端存储和导出使用 WGS84。
- 2D、3D 和导出使用同一个 `coordCorrection` 字段解释显示纠偏。
- `featureId` 在图层版本内稳定，不能因一次查询或一次索引重建改变。
- 图层更新后 `version` 必须变化，前端收到新 version 后清理旧缓存。

### 可观测性

第一阶段至少在服务层保留可调试信息，便于后续接入日志或后台诊断：

- 图层索引构建耗时。
- bbox 查询耗时和命中数量。
- cluster 查询耗时、cluster 数量和真实点数量。
- limit 截断次数。
- 非法参数和未授权访问次数。

## 测试要求

### 后端 `node:test`

必须覆盖：

- manifest 返回元信息且不包含 `features`。
- bbox 命中点、线、面。
- bbox 未命中时返回空数组。
- bbox 边界相交规则。
- 非法 bbox、zoom、limit、geometryTypes。
- limit 超限和 `truncated: true`。
- 未发布、禁用或不存在的公共 KML 不可访问。
- 前台访问控制失败返回 401。
- 响应不返回管理备注、Token、代理认证信息或敏感请求头。
- feature detail 对存在 ID 返回完整公开详情。
- feature detail 对不存在 ID 返回 404。
- cluster 低 zoom 返回聚合点。
- cluster 高 zoom 返回真实点或空聚合。
- 图层更新后 version 变化，旧索引失效。

### 前端验证

必须覆盖或手工验证：

- 启用公共 KML 后先请求 manifest，不请求完整 `/api/v1/kml/shared/:id`。
- 地图快速拖动时旧请求能被取消。
- 缩放变化后旧响应不会覆盖新视图结果。
- 启用、禁用公共 KML 能正确清理图层对象和缓存。
- `truncated: true` 时使用统一提示组件，不使用 `alert`。
- cluster 点击后地图移动或缩放到 cluster bbox。
- 2D 和 3D 同一公共 KML 坐标显示一致。
- 移动端 KML 面板不渲染全量 Feature 列表。

## 验收标准

### 方案 C 完成标准

- 已发布公共 KML 支持 `manifest` 和 `features?bbox=...`。
- 前台启用支持动态能力的公共 KML 时，不再默认拉取完整 features。
- 地图移动到新区域后，只请求当前视口加 buffer 的 bbox。
- 视口外 Feature 会被移除或缓存为非可见状态，不继续占用地图渲染对象。
- 单要素详情通过 `features/:featureId` 按需加载。
- 后端相关服务和路由具备 `node:test` 覆盖。
- 实现时同步更新 `docs/api.md`。

### 方案 D 完成标准

- 点位公共 KML 支持 `clusters?bbox=...&zoom=...`。
- 低缩放不返回海量真实点，返回 cluster 和点数。
- cluster 点击后能缩放或移动到 cluster 覆盖范围。
- 高缩放返回真实点，弹窗详情按需加载。
- 混合点线面图层的点聚合与线面加载策略明确，不互相阻塞。
- cluster 相关服务、路由和错误分支具备 `node:test` 覆盖。

## 分期建议

### Phase 1：后端方案 C

- 扩展公共 KML 服务层为 Feature Layer 语义。
- 导入、创建和更新公共 KML 时 normalize Feature、计算 bbox 和 revision。
- 构建内存 bbox 空间索引。
- 新增 manifest、bbox features、feature detail 服务方法和路由。
- 补齐后端测试。
- 更新 `docs/api.md`。

### Phase 2：前端方案 C

- 重构前台公共 KML 加载入口。
- 新增动态加载状态、请求取消、视口 buffer、差异渲染和缓存清理。
- 2D 接入动态 features。
- 3D 接入动态 features。
- 完成移动端和大数据量手工验证。

### Phase 3：方案 D 聚合

- 为点要素构建聚合索引。
- 新增 clusters 服务方法和路由。
- 前端低缩放优先加载 clusters。
- cluster 点击缩放到 bbox。
- 补齐聚合测试和验收记录。

### Phase 4：中长期衔接

当单图层超过 5 万到 10 万要素，或公共 KML 主要作为只读大图层展示时，另起需求推进
MVT/PMTiles 或 PostGIS。该阶段不属于本需求交付范围，但当前数据模型和 ID 规则必须为后续
`tiles/{z}/{x}/{y}.mvt`、TileJSON 和 PMTiles 留出扩展空间。

## 与现有文档的关系

- 本需求是 [KML 公共图层共享管理需求](kml-shared-layers.md) 的性能和数据加载增强。
- [KML 导入导出](kml-import-export.md) 中的 WGS84 存储和导出规则继续有效。
- [功能完备地图应用建设需求](full-featured-map-application.md) 中的数据集方向与 Feature Layer
  模型一致。
- [访问控制加固](access-control-hardening.md) 中的前台访问 cookie 和后台管理员 Token 规则继续有效。
