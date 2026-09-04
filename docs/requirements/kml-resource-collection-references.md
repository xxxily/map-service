# KML 独立资源集合、引用绑定与按需加载需求

> 状态：v1.5.63 已实现（161 部署记录待发布后补充）
>
> 日期：2026-09-04
>
> 关联基线：[KML 性能优化与资源集合点位](./kml-performance-and-resource-collections.md)
> 关联规划：[KML 点位富媒体第二阶段：外部内容库与资产库集成规划](./kml-rich-content-phase2-content-library.md)

## 1. 文档目的

当前“资源集合”已经支持在 Point 中直接保存图片、视频、音频、页面和普通链接，但集合项与 KML Feature 共用同一份 `features_json`。当一个地点需要维护数百甚至更多资源时，KML 文件、分享快照和每次编辑请求都会随集合内容增长。

本文在不改变现有内嵌集合行为的前提下，增加独立资源集合实体和引用绑定能力，形成以下统一模型：

- 旧数据继续使用“内嵌集合”（inline collection），集合项随 KML 保存和分享。
- 新数据可以在个人空间单独维护“个人资源集合”（managed collection），Point 只保存集合 ID 和少量展示信息。
- 新数据可以预留“外部数据接口集合”（external collection），Point 只保存受控 HTTPS 数据地址，查看时由浏览器按约定读取。
- 地图、分享页和 3D 页面只在用户打开集合时按页加载资源，不因地图首屏或 KML 文件加载而展开全部集合项。

本文是后续实现、接口、数据库迁移、前端交互、测试和验收的共同基线。未在本文明确允许的行为，不得通过前端假设或隐式兼容实现。

## 2. 现状与问题

### 2.1 现有 v1 基线

现有实现以 Point 的 `resourceCollection` 字段识别资源集合，数据示例：

```json
{
  "type": "Point",
  "id": "feat_viewpoint",
  "name": "北坡观景台",
  "coordinates": [121.1, 31.2],
  "markerIcon": "collection",
  "resourceCollection": {
    "version": 1,
    "viewMode": "grid",
    "items": [
      {
        "id": "res_1",
        "title": "2024 秋季全景",
        "url": "https://example.com/pano",
        "type": "iframe"
      }
    ]
  }
}
```

v1 的重要约束如下：

- 集合项直接保存在 KML Feature JSON 中，并通过 `map-service:resource-collection` KML `ExtendedData` 往返。
- 单个集合最多 300 项，序列化大小最多 512 KiB；资源项 ID 在集合内唯一。
- 集合 URL 仅接受 HTTPS，禁止账号、密码和敏感查询参数；iframe 仍受现有 allowlist、sandbox 和 referrer policy 约束。
- 编辑器支持列表/卡片视图、分页、批量粘贴、排序、删除和统一媒体预览器。
- 个人 KML 更新使用 revision；公开分享发布的是 KML 内容快照，源 KML 修改后需显式同步。

本需求不删除、重命名或改变上述字段和限制。新能力必须让只认识 v1 的代码至少继续显示 Point 几何，而不能因为新引用导致整份 KML 解析失败。

### 2.2 需要解决的问题

| 问题 | 影响 | 本需求处理方式 |
| --- | --- | --- |
| 集合项与 KML 强绑定 | KML 文件、同步请求和分享快照体积随资源数增长 | 独立表存储集合和集合项，Feature 仅保存引用 |
| 集合只能在点位编辑器中维护 | 同一组资源难以被多个 KML 点位复用 | 个人空间新增资源集合 Tab；同一集合可被多个 Point 引用 |
| 地图加载时容易触发大量资源解析 | 首屏、缩放和文件切换受集合规模影响 | 只加载引用元数据，查看面板时分页读取 |
| 分享与集合权限脱节 | 分享者无法判断私有集合是否可被访客看到 | 个人集合增加公开开关；分享读取时动态检查公开状态 |
| 外部系统无法维护集合 | 资源维护必须回到 map-service | 预留标准化外部只读接口契约，不新增任意 URL 代理 |
| 直接复制快照会冻结或膨胀数据 | 数据更新不及时或分享包过大 | 引用默认采用 live 语义，集合项不复制进 KML 分享快照 |

## 3. 产品目标与成功标准

### 3.1 产品目标

1. 用户可以在个人空间创建、编辑、排序、分页浏览和删除独立资源集合。
2. 用户在新增或编辑“资源集合”点位时，可以选择内嵌、个人 ID 或外部数据地址三种来源之一。
3. KML 的几何、点位名称和引用描述与集合内容解耦；集合项数量增长不会线性扩大 KML Feature 和分享快照。
4. 既有内嵌集合的创建、编辑、导入、导出、复制、分享和预览行为保持不变。
5. 个人集合默认私有，显式公开后可以被已知 ID 或分享范围读取；取消公开立即生效。
6. KML 分享按原有分享包、密码、站点访问、有效期、撤销和下载规则工作；分享只发布引用，不替集合所有者强行改变权限或内容版本。
7. 第三方系统可以按标准响应维护并提供集合数据；读取失败被识别为无权限或不可用，不影响地图其他要素。

### 3.2 可衡量成功标准

- `GET /kml/files/:id` 和公开分享文件接口返回的 Feature 只含引用元数据，不含个人/外部集合的完整 `items`；集合项数量变化不改变该 Feature 的基本响应结构大小级别。
- 个人集合列表只返回集合摘要；集合详情和项列表均支持分页，前端不会为打开编辑器一次创建全部资源节点。
- 用户点击引用点位后，只有在打开集合面板或预览具体资源时才发起集合数据请求；关闭面板会取消未完成请求并释放媒体资源。
- 私有个人集合在公开分享中不返回资源项、内部所有者信息或可枚举的管理字段，只显示统一的“集合未公开或暂不可用”状态。
- 公开状态、集合项标题/地址/顺序的更新在下一次查看时可见，不需要为了集合内容变化而同步 KML 分享；替换 Point 引用本身仍需按既有 KML revision 和分享同步规则处理。
- 外部接口返回非法 JSON、超限数据、CORS 拒绝、401/403、超时或 5xx 时，地图保留 Point 和其他媒体，集合区域显示可理解的失败状态及原地址入口（若安全策略允许）。
- 所有新增服务方法、路由、权限、迁移和错误分支均有 `node:test` 覆盖；完整验收继续执行 `npm run check`、`npm test`、`npm run build`。

## 4. 范围与非目标

### 4.1 本期范围

- 个人空间“资源集合” Tab、列表、筛选、创建、编辑、回收和公开开关。
- 独立资源集合及集合项的服务端持久化、分页、排序、revision、配额和审计。
- Point 对个人集合 ID 和外部数据 URL 的引用模型、编辑器选择流程和解除绑定。
- 2D、3D、SidePanel 和公开分享页的引用识别、按需加载、分页展示和统一媒体预览器接入。
- 个人集合公开读取接口、分享范围内的集合解析接口和访问状态投影。
- 外部集合的标准 JSON 读取契约、浏览器直读、CORS/超时/格式错误处理。
- KML `ExtendedData` 导入导出、同账号重绑定、跨账号未解析状态和显式内嵌/独立转换。
- 数据库迁移、引用索引、权限码、缓存/限流、日志脱敏和自动化测试。

### 4.2 非目标

- 不删除或自动迁移已有内嵌 `resourceCollection`。
- 不在本期做图片/视频二进制上传、对象存储、转码、缩略图抓取或资产 DAM；集合项仍以受控外部 URL 为主。
- 不提供把任意外部 URL 转发到服务端的通用代理，不接受用户提交的代理账号、Authorization、Cookie 或其他上游请求头。
- 不把外部系统的认证凭证存入 Point、集合或 URL；带签名参数的 URL 是否支持需要单独安全评审。
- 不在一个 Point 上合并多个个人集合或多个外部集合；本期一个 Point 只有一个有效集合来源。未来的多来源组合另立需求。
- 不提供多人实时协同编辑、内容审批流、版本回滚或跨租户资源共享；仅保留 revision 和审计扩展点。
- 不因为集合不可用自动删除 Point、暂停 KML 或撤销分享。

## 5. 用户与典型场景

### 5.1 个人用户

- 在个人空间创建“某景区照片”集合，批量粘贴数千个地址，分批维护标题和顺序。
- 在多个 KML 的不同 Point 绑定同一个集合；集合更新后，所有引用点位都读取到最新内容。
- 将集合保持私有，仅在自己的地图查看；或打开“允许公开读取”后嵌入公开分享。
- 删除一个 Point 时保留独立集合，后续可以重新绑定；删除集合前查看当前引用位置。

### 5.2 KML 编辑者

- 选择点位类型“资源集合”，再选择“内嵌数据”“个人资源集合”或“外部数据接口”。
- 从个人集合列表搜索并绑定 ID；不需要把集合项下载到 KML 编辑器。
- 解除绑定、替换集合或将内嵌集合另存为独立集合；所有转换均明确提示可能的权限和大小影响。

### 5.3 分享访客

- 打开分享链接后看到集合点位摘要；点击查看时，按页读取公开个人集合或外部接口数据。
- 个人集合未公开、已删除或分享授权不足时，看到统一的不可用提示，不看到私有集合的标题、项数、URL 或所有者信息。
- 外部地址能否访问由外部系统和浏览器 CORS 决定；map-service 不代替访客解决外部权限。

### 5.4 第三方系统维护者

- 按标准 JSON 接口维护资源项、排序和版本，地图端只保存接口地址。
- 接口暂时不可用时，地图显示上次引用的名称（如有）和错误状态，不把错误数据写回 KML。

## 6. 核心设计决策

### D1. 新旧模型并存，字段分离

内嵌数据继续使用 `resourceCollection`；独立引用使用新的 `resourceCollectionRef`。二者不能同时存在：

```text
Point
 ├─ resourceCollection      -> v1 内嵌集合，items 在 Feature 内
 └─ resourceCollectionRef   -> 新增引用模式，items 在个人库或外部接口
```

使用独立字段而不是改变 v1 `version`，避免旧客户端把一个引用误当成完整集合。服务端保存时必须校验互斥关系；显式 `null` 才表示解除引用，字段缺省不得被解释为删除未知引用。

### D2. 独立集合使用规范化存储

个人集合和集合项使用现有用户 SQLite 数据库中的独立表，不继续把大数组塞进 `kml_documents.features_json`。集合列表读取摘要，项读取分页；位置、ID、URL、标题和类型使用可索引字段。`features_json` 仍是 KML 几何及引用描述的权威来源。

### D3. 引用默认是 live 语义

`resourceCollectionRef.resolution` 固定为 `live`。Point 保存的是“去哪里读”的稳定关系，不保存集合项快照。集合名称、公开状态、项内容、顺序和外部接口响应均以查看时的当前值为准；未来若要提供冻结版本，必须新增明确的 snapshot 语义，不能悄悄改变本需求。

### D4. 一个 Point 只绑定一个集合来源

一个 Point 在任一时刻只能存在一种集合来源：内嵌、个人或外部。描述中的普通链接仍可与集合来源并存，并继续按既有内容解析顺序展示。需要组合多个集合时，先在个人空间合并，或使用多个 Point；不在本期引入隐含的优先级和去重规则。

### D5. 分享发布引用，不复制集合项

分享创建/同步时，服务端内部快照可以保存用于解析的规范化 `resourceCollectionRef`，但绝不把个人集合项复制到 `published_snapshot_json`。对外的 KML 文件、下载和分享 API 必须经过来源级投影：公开个人引用只输出公开引用标识或安全引用描述，私有/失效个人引用不得输出集合 ID、名称、项数、URL 或所有者信息。分享访问仍先通过原有分享状态、密码、站点访问、空间范围和 Cookie 授权，再解析集合引用。个人集合内容变化不需要 KML 分享同步；Point 的引用 ID 或外部 URL 变化仍属于 KML 内容变化，需要按现有流程发布新快照。

### D6. 个人公开是显式、可撤回的读取授权

个人集合 `visibility` 默认 `private`，用户勾选“允许公开读取”才变为 `public`。公开不是全站目录：只能通过不可枚举的 ID、已授权分享上下文或用户已知链接读取；不提供公开集合搜索和批量目录。改回私有、移入回收站或账号禁用后，公开读取立即失效。

本文中的 `id`/`collectionId` 是服务端生成的高熵、不可枚举的对外引用标识，不得使用数据库自增主键、名称或邮箱。它可以与内部字符串主键相同，但语义上不是管理数据库 ID；如果实现采用独立的公开别名，公开响应统一使用 `publicId`，内部主键只留在服务端。无论采用哪种实现，私有集合的公开分享文件、下载和状态包络都不得输出任何可用于枚举或反查的集合标识。

### D7. 外部集合先走浏览器直读

外部 `dataUrl` 由浏览器在用户打开集合时直接 `fetch`，默认 `credentials: omit`，仅接受 HTTPS、公开可访问或由外部系统自行处理权限的接口。map-service 不代发 Authorization/Cookie，不做 DNS 回源、重定向代理或响应缓存代理。后续若需要服务端适配器，应作为受控 provider 单独设计 SSRF、凭证和审计边界。

### D8. 引用元数据是提示，不是权威数据

Point 可以保存 `displayName` 和 `viewMode` 作为离线/首屏提示，但不得保存或信任 `itemCount`、`updatedAt`、公开状态等易变字段作为授权依据。地图需要准确数量时必须读取集合元数据接口；缓存值过期时显示“正在更新”或“数量未知”，不能静默伪造总数。

### D9. 稳定 ID 和可重建索引

新建集合 ID 和集合项 ID 使用高熵、不可枚举的稳定标识；既有 Feature ID、分享项 ID 继续遵循项目现有 ID 契约，不为本需求强制迁移。引用关系索引是可重建的派生数据，KML Feature 和集合表是业务数据源；迁移、导入或索引损坏时可以通过全量扫描重建，不因索引缺失删除业务数据。

## 7. 数据模型与数据契约

### 7.1 个人资源集合实体

建议接口投影如下，服务器计算的统计字段不可由客户端提交覆盖：

```json
{
  "id": "rc_7f3c...",
  "name": "北坡观景台资料",
  "description": "现场照片、全景和巡检页面",
  "visibility": "private",
  "status": "active",
  "viewMode": "grid",
  "itemCount": 1280,
  "byteSize": 684032,
  "revision": 7,
  "itemsRevision": 19,
  "createdAt": "2026-09-03T02:00:00.000Z",
  "updatedAt": "2026-09-03T04:10:00.000Z",
  "deletedAt": null,
  "referenceCount": 3,
  "publicReferenceCount": 1
}
```

字段规则：

- `id` 由服务端使用密码学安全随机源生成，建议格式为 `rc_<random>` 且有效随机部分不少于 128 bit；不得使用递增数字、时间戳、名称或邮箱作为主键。
- `name` 为 1～200 个 Unicode 字符；`description` 最多 5,000 个字符并按现有富文本清洗规则处理。
- `visibility` 仅为 `private` 或 `public`，默认 `private`；界面文案为“允许公开读取”。
- `status` 至少支持 `active`、`trashed`；回收站生命周期与个人 KML 一致，永久删除需二次验证和引用检查。
- `viewMode` 仅为 `grid` 或 `list`，是集合默认展示偏好，不影响数据读取。
- `itemCount`、`byteSize`、`referenceCount`、`publicReferenceCount`、时间、`revision` 和 `itemsRevision` 均由服务端维护；其中前者用于集合元数据，后者用于集合项内容。
- `referenceCount` 统计活动中的 KML Point 绑定（含已发布分享关联）；`publicReferenceCount` 仅统计当前集合为公开状态且仍有活动绑定的数量，均为摘要指标，不代表实际访客人数。
- 独立集合的项数和总字节数使用管理员可配置配额；不能复用 v1 的 300 项/512 KiB 作为独立集合的隐式硬上限。请求运输层仍受部署级 JSON 上限和安全整数边界约束。

### 7.2 个人集合项

```json
{
  "id": "rci_2a9e...",
  "position": 120,
  "title": "2026 年 8 月全景",
  "url": "https://example.com/pano/2026-08",
  "type": "iframe",
  "coverUrl": "https://example.com/pano/2026-08-cover.jpg",
  "createdAt": "2026-09-03T02:01:00.000Z",
  "updatedAt": "2026-09-03T02:02:00.000Z"
}
```

- `id` 在集合内唯一且创建后稳定，服务端生成时使用密码学安全随机源；更新标题、URL、类型或排序不得重建 ID，也不得在删除后复用。
- `position` 由服务端在事务中维护连续顺序；客户端提交 `beforeId`/`afterId` 或完整顺序时，服务端按当前 revision 校验并重排。
- `title`、`url`、`type`、`coverUrl` 复用 v1 的长度、枚举、HTTPS、凭据和敏感查询参数校验。
- `type` 支持 `auto`、`image`、`video`、`audio`、`iframe`；`auto` 的最终展示分类仍由现有受控识别器决定。
- 集合项接口支持分页和批量写入。批量失败时整批回滚，不能只保存前半部分而不返回逐项结果。
- 外部接口返回的项也必须符合相同的公开投影；不符合时该项被标记为不可用或整页失败，不能把任意字段透传为 HTML。

### 7.3 Point 引用模型

#### 个人集合 ID

```json
{
  "resourceCollectionRef": {
    "version": 1,
    "sourceType": "personal",
    "resolution": "live",
    "collectionId": "rc_7f3c...",
    "displayName": "北坡观景台资料",
    "viewMode": "grid"
  }
}
```

#### 外部数据接口

```json
{
  "resourceCollectionRef": {
    "version": 1,
    "sourceType": "external",
    "resolution": "live",
    "dataUrl": "https://partner.example.com/map/collections/site-001",
    "displayName": "第三方巡检资料",
    "viewMode": "list"
  }
}
```

引用字段规则：

- `version` 当前固定为 `1`；未知版本在导入时保留 Point 几何并产生 warning，在写入时拒绝保存未知结构。
- `sourceType` 只能为 `personal` 或 `external`；个人模式必须有 `collectionId`，外部模式必须有 `dataUrl`，另一字段必须省略。
- `resolution` 当前固定为 `live`，为未来版本化快照保留明确扩展位。
- `displayName` 可选，最多 200 个字符，只是离线展示提示；集合真实名称以读取结果为准。
- `viewMode` 可选，缺省时使用来源集合的默认模式；它只影响当前引用的展示偏好，不修改来源集合。
- `collectionId` 和 `dataUrl` 不得包含认证凭证。`dataUrl` 必须为 HTTPS，禁止 localhost、内网、link-local、metadata 主机和已知敏感查询参数；非默认端口默认拒绝，只有部署级 allowlist 明确允许时才可使用，主机校验与现有 URL 安全规则一致。
- `resourceCollectionRef` 规范化 JSON 不得包含数组或响应快照；本期独立大小上限为 16 KiB，部署可以降低但不得在不变更契约版本的情况下提高。超限按引用非法处理，该上限与 v1 内嵌集合的 512 KiB 上限分开计算。
- 个人集合引用分为可管理绑定和只读公开绑定：Point 编辑器只能选择当前用户拥有或被明确授予管理权限的集合；导入时若目标集合当前为公开，可在用户确认后保留为只读公开绑定，但不得据此编辑、公开状态或集合项。
- 同一 Point 不得同时出现 `resourceCollection` 和 `resourceCollectionRef`。转换过程必须显式确认，失败时保留原值。

### 7.4 外部接口标准响应

外部数据源应返回 `application/json`，推荐媒体类型为 `application/vnd.map-service.resource-collection+json;version=1`。接口至少支持 `GET`，建议支持 `page` 和 `limit` 查询参数：

```json
{
  "version": 1,
  "collection": {
    "name": "第三方巡检资料",
    "description": "由巡检系统维护",
    "viewMode": "list",
    "revision": "2026-09-03T04:10:00Z/7",
    "updatedAt": "2026-09-03T04:10:00.000Z"
  },
  "items": [
    {
      "id": "external-item-001",
      "position": 0,
      "title": "设备正面照片",
      "url": "https://assets.example.com/site-001/front.jpg",
      "type": "image",
      "coverUrl": "https://assets.example.com/site-001/front-thumb.jpg"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 40,
    "total": 1280,
    "hasNext": true
  }
}
```

契约要求：

- `version`、`collection`、`items` 必须是对象/数组的正确类型；项 ID 在同一外部集合内稳定且唯一。
- `pagination.total` 必须是准确的非负安全整数；如果外部系统无法提供准确总数，应返回 `total: null` 和布尔型 `hasNext`，前台不得伪造总数。`page`、`limit`、`total` 均不得超出安全整数范围。
- `page` 默认 1，`limit` 由调用方请求但不得超过 map-service 当前安全上限；无分页的完整数组只适用于小集合，超出客户端上限时作为超限失败处理。客户端必须用 URL 结构化 API 追加或替换 `page`/`limit`，不得字符串拼接或改写保存的 `dataUrl`；来源不支持分页时仍返回完整数组，超过安全上限则归一为 `too_large`。
- 外部响应的 `items.length` 不得超过请求的 `limit` 或部署安全上限；超出时不得静默截断，必须归一为 `too_large`/`invalid_schema` 并放弃该页。
- `revision`（不透明字符串或安全整数）或 `updatedAt` 用于跨页一致性，至少应提供其中一个；如果连续请求返回的视图标识变化，客户端必须丢弃混合页并从第一页重新读取。描述和其他扩展字段可选；map-service 只消费已定义字段，未知字段忽略。
- 外部系统负责资源项内容和权限；map-service 只重新执行协议、主机、敏感字段、媒体类型和 iframe allowlist 校验。
- 接口不得要求 map-service 发送账号密码、Cookie、Authorization 或代理头。浏览器直读默认使用 `credentials: omit`，是否允许跨域由外部系统通过 CORS 决定。
- 后续如需 cursor、ETag、签名 URL、服务端适配器或写入 webhook，必须新增契约版本或独立专题，不得在 v1 响应中临时解释。

### 7.5 KML 交换格式

独立引用使用新的 `ExtendedData` 键，不改变 v1 键：

```xml
<ExtendedData>
  <Data name="map-service:resource-collection-ref">
    <value>{&quot;version&quot;:1,&quot;sourceType&quot;:&quot;personal&quot;,&quot;resolution&quot;:&quot;live&quot;,&quot;collectionId&quot;:&quot;rc_7f3c...&quot;}</value>
  </Data>
</ExtendedData>
```

公开分享导出中不可公开的个人引用使用独立状态扩展，不携带集合标识：

```xml
<Data name="map-service:resource-collection-status">
  <value>{&quot;version&quot;:1,&quot;sourceType&quot;:&quot;personal&quot;,&quot;accessState&quot;:&quot;private&quot;}</value>
</Data>
```

导入导出规则：

- 解析时先判断 `resource-collection` 和 `resource-collection-ref`；同时存在时以错误 warning 处理并保留 Point，不自动猜测优先级。
- `resource-collection-status` 只用于公开导出的不可用状态展示，不代表可绑定的集合来源；导入时不得据此创建或恢复 `resourceCollectionRef`。
- 合法个人引用在同一账号导入时可按 ID 重新绑定；集合不存在时保留引用并标记 `unresolved`，不能自动复制或下载集合内容。
- 跨账号导入不获得原集合的管理权限，也不自动把公开读取权转换为本地绑定。引用指向公开集合时可在用户主动确认后作为只读公开引用保留；若需要在个人空间管理，必须选择本地集合或由原所有者授予明确的协作权限。私有或无法确认的引用显示未解析状态，并提供“选择本地集合”“转为内嵌（需读取全部项）”或“移除引用”操作。
- 外部引用在 URL 安全校验通过时原样保留；导入过程不请求外部地址，不因外部暂时不可用而阻断整个 KML。
- 普通 KML 导出保留引用扩展但不写入集合项、内部所有者信息、权限状态、访问令牌或缓存响应。导出文件的通用 KML 解析器可以忽略该扩展而保留 Point 几何。
- 公开分享导出时，公开个人引用只输出公开引用标识和必要的来源类型；私有、回收或缺失的个人引用一律不输出 `collectionId`，统一写入不含标识的 `map-service:resource-collection-status` 扩展（`sourceType=personal`、`accessState=private|missing`），若目标格式不支持该扩展则直接省略。任何公开导出都不得输出私有集合名称、项数、URL、所有者或内部管理字段；具体 XML 键名和 JSON 形态必须按本规则实现并同步到正式 API 文档。

## 8. 功能需求

### F1. 个人空间资源集合 Tab

1. 个人空间新增“资源集合”一级 Tab，与“我的 KML”“位置收藏”“我的分享”同级；Tab 的显示和读写按钮由独立权限决定。
2. 列表默认只返回摘要，不返回完整项数组。每项至少显示名称、公开/私有状态、活动/回收站状态、资源项数量、更新时间、占用空间和引用数量。
3. 列表支持名称/描述搜索、状态筛选、公开状态筛选、更新时间/名称排序和通用分页；筛选条件切换不会丢失当前页的未提交编辑。
4. 空状态、加载失败、权限不足和回收站状态均有独立 UI；不得通过原生 `alert`、`confirm`、`prompt` 处理表单或确认。
5. 列表项提供“打开管理”“编辑基本信息”“公开设置”“查看引用”“移入回收站”等操作；回收站项提供恢复和需二次验证的永久删除。
6. “查看引用”展示引用该集合的 KML、Feature 和活跃分享摘要；不允许通过该列表越权读取他人 KML 的私有内容。
   对于其他账号创建的 KML 或分享，只返回必要的聚合数量和脱敏状态；除非调用者同时具备对应 KML/分享权限，不返回文件名、Feature 名称、空间坐标或访问链接。
7. 集合公开开关默认关闭。开启前使用统一 Dialog 明确说明：公开后，任何持有 ID 或已授权分享的访问者都可能读取集合名称、描述、项标题、媒体地址和当前内容；关闭后已有分享中的集合会立即显示不可用。
8. 集合删除只影响集合本身，不删除引用 Point。存在引用时必须显示数量和影响范围；软删除后引用进入 `missing`/`trashed` 状态，不能静默指向其他集合。
9. Tab 和集合详情使用稳定集合 ID 支持刷新、浏览器前进/后退和可复制的管理链接；列表筛选、分页和编辑草稿在返回列表时按现有账号空间约定恢复。

### F2. 独立集合编辑器

1. 编辑器支持集合名称、描述、默认列表/卡片模式、批量粘贴 URL、项标题/类型/封面、删除和排序，交互语义复用现有资源集合编辑器。
2. 编辑器按页或虚拟列表加载项；首次打开不得下载全部项。批量导入应使用专用批量接口或分批请求，并显示已成功、重复、超限和失败数量。重复判断沿用 v1 的规范化 HTTPS URL（同一集合内默认跳过重复项并报告数量），不得静默覆盖已有项。
3. 单项 ID 在编辑、排序和跨页加载中保持稳定；保存标题或 URL 不得导致评论/举报等稳定媒体引用漂移。
4. 保存基本信息和项批量变更均携带集合 `revision`/`itemsRevision`。版本不一致返回冲突，前端保留本地未提交修改并提供重新加载、对比和覆盖前的明确操作。
5. 排序操作不得依赖当前页内的固定窗口；跨页移动使用稳定项 ID，服务端在事务内重排全部受影响项并返回规范化顺序摘要。
6. 空白占位项可以在保存时忽略；已填写标题、类型或封面但缺少地址的项必须定位到具体字段。任何超限都不得静默截断。
7. 保存公开开关、删除或批量删除前使用统一确认 Dialog；公开状态变更和删除写入审计日志。
8. 编辑器关闭时保留未提交草稿的现有恢复能力；网络失败不得以空列表覆盖已加载数据。

### F3. Point 类型与来源选择

1. 新增/编辑 Point 时保留“普通点位/资源集合”类型选择。选择“资源集合”后增加来源分段控件：
   - 内嵌数据：继续打开当前 v1 编辑器。
   - 个人资源集合：加载当前用户拥有或被明确授予管理权限的集合摘要列表；“公开可读”本身不等于可编辑或可绑定管理权限。
   - 外部数据接口：填写并校验 `dataUrl`。
2. 个人集合列表只在用户选择该来源时请求；支持搜索、分页、显示公开状态和最近更新时间。列表加载失败不得清空原有引用。
3. 选择个人集合后，Point 只写入 `resourceCollectionRef`；界面提供“打开集合管理”“替换集合”“解除绑定”动作，不在 Point 编辑器中复制完整项数组。
4. 外部地址保存前执行 HTTPS、主机、端口（非默认端口须部署级 allowlist）、敏感参数和长度校验；可提供“测试读取”按钮，但测试请求必须可取消且不得因为一次失败阻止保存合法引用。
5. 保存外部引用前必须明确提示：`dataUrl` 以及外部响应中的资源地址可能随 KML 分享或导出暴露给访问者，map-service 不替用户承担第三方系统的访问控制；禁止把凭证放入 URL。
6. 个人集合和外部接口均可设置引用级显示名称和视图偏好；这些值不能覆盖来源集合的授权或数据。
7. 将内嵌集合转换为独立集合时，服务端先创建并校验完整集合，再原子更新 Point 引用；任一步失败都保留原内嵌数据。
8. 将独立集合转换为内嵌集合时，必须读取完整项并执行 v1 的 300 项/512 KiB 限制；超出时拒绝转换并说明原因，不截断、不丢项。
9. Point 改为普通点位时，继续使用现有“保留链接/移除集合”的确认流程；个人/外部引用不得被偷偷写入描述或自动删除。

### F4. 地图与详情按需加载

1. 2D、3D、SidePanel 和公开分享地图加载 KML 时只读取 Point 几何、名称、图标、引用摘要和描述；不请求个人集合项或外部数据。
2. 有 `resourceCollection` 或 `resourceCollectionRef` 的 Point 均使用资源集合图标和轻量摘要。摘要最多显示来源类型和已知展示名称；准确项数在集合元数据请求完成后显示。
3. 用户打开集合面板时：
   - 个人来源调用受控集合元数据/项列表接口。
   - 外部来源直接请求 `dataUrl`，必要时带 `page`、`limit` 参数。
   - 页面只渲染当前页或可视窗口；图片懒加载，视频、音频和 iframe 只为当前预览项设置真实源。
4. 面板提供列表/卡片切换、准确或明确未知的总数、分页状态、重试、原地址入口和不可用原因。没有资源时显示空状态，不弹错误。
5. 切换 Point、页码或来源时使用 `AbortController` 取消旧请求；旧响应不得覆盖新选中点位或新 revision 的内容。
6. 个人集合读取应遵循当前用户会话、分享 Cookie、站点访问和分享空间授权；直接公开集合读取仍只能返回公开投影。
7. 关闭面板或预览器时释放图片/视频/音频/iframe 的临时源、观察器、播放器和事件监听；不得留下后台请求或播放。
8. 集合资源应继续接入统一媒体预览器和交互资源引用体系。集合项媒体 ID 由稳定 `collectionId + itemId`（或外部稳定项 ID）派生，标题和 URL 更新不改变 ID。
9. 集合加载失败只影响集合内容区域；地图图层、其他 Point、线段和 Polygon 必须继续可用。

### F5. 个人集合公开与权限

1. 新建集合默认 `private`；只有集合所有者或具备明确管理权限的账号可以读取私有集合、修改公开状态或编辑项。
2. `public` 集合可以通过已知的不可枚举 ID 读取规范化元数据和分页项；公开接口不提供搜索、批量枚举、所有者邮箱、管理备注、内部数据库 ID 或审计字段。
3. 私有集合在个人地图中正常可见；在公开分享中不返回项数据。为便于用户理解，分享范围内的解析接口可以返回无敏感细节的 `accessState=private`，但直接公开集合接口对私有/不存在资源统一返回 `404 RESOURCE_NOT_FOUND`，避免 ID 枚举。
4. 集合改为私有、回收、永久删除、所有者账号禁用或权限撤销后，所有公开读取和分享范围解析立即重新判定；不等待 KML 分享同步。
5. 从回收站恢复时默认重置为 `private`，恢复操作不得自动重新公开；用户需要再次显式开启公开并看到风险提示。该状态转换与公开状态变更均写入审计。
6. 公开状态变更必须增加审计事件（集合 ID、前后状态、操作者、结果、时间），日志不写入集合项 URL 查询值或任何凭证。
7. 管理员跨用户查看或处置集合需要独立权限（建议 `resource_collection.any.read`/`resource_collection.any.manage`）；不能仅凭前端 Tab 隐藏实现安全隔离。

### F6. KML 分享与只读访问

1. 分享创建和同步时校验 `resourceCollectionRef` 的结构、来源类型和绑定资格；当前用户拥有/管理的个人集合可正常绑定，跨账号个人集合只有在已确认公开时作为只读公开绑定保留。校验只针对引用，不加载全部集合项。
2. 已发布快照保存引用的规范化副本和必要的分享关联标识，不复制个人集合项，不把外部响应缓存进快照。
3. 公开文件读取在现有分享状态、密码、站点访问、空间范围和 Cookie 检查之后，按以下顺序解析：内嵌集合直接使用快照；个人引用检查集合当前公开状态；外部引用按浏览器直读契约交给客户端。
4. 每次生成公开文件、清单、详情或下载响应时都必须重新执行来源级脱敏，不能信任快照中缓存的 `displayName`、公开状态或项数；集合后来改为私有/回收后，旧快照里的这些字段也不得继续对外返回。
5. KML 分享的 `active/paused/expired/revoked/blocked` 生命周期不因集合私有、删除或外部 401 自动改变。集合不可用只影响对应 Point 的集合内容区域。
6. KML 分享仍使用现有 `allowDownload`。下载文件不包含私有集合项；公开个人引用和外部引用只保留可安全交换的引用描述，不能通过下载绕过集合权限。
7. 分享所有者界面显示集合引用状态（例如“内嵌”“个人公开”“个人未公开”“外部地址”）和最近一次读取/校验结果，但不把集合项读取失败误报为 KML 分享同步失败。
8. 分享撤销、删除或分享项移除后，分享范围专用集合解析地址立即失效；若个人集合本身仍公开，其独立公开 ID 读取不受该分享生命周期影响。
9. 分享中的个人集合内容是 live 数据：集合项增删改、排序、公开切换在访客下次读取时生效；Point 引用替换、删除或 KML 坐标变化仍需按既有分享同步规则发布。

### F7. 外部数据接口读取

1. 外部引用只保存标准化 `dataUrl` 和可选显示提示；map-service 不保存或推测外部系统的登录状态。
2. 浏览器请求使用 `GET`、`mode: cors`、`credentials: omit`、`Accept: application/vnd.map-service.resource-collection+json;version=1, application/json`、`referrerPolicy: no-referrer`、超时和 `redirect: error`；不自动跟随 map-service 无法审查的跨协议或未知主机跳转。CORS 不允许时显示“外部接口未授权跨域读取”。
3. 客户端只接受 `application/json` 或 `application/*+json` 响应，对内容执行 JSON 解析、版本、项数、字段长度、URL 安全、媒体分类和 iframe allowlist 校验；失败返回结构化状态，不将原始响应显示为 HTML。
4. 客户端必须在读取前检查 `Content-Length`（如有），并在流式读取时执行响应字节上限；超过上限立即中止并归一为 `too_large`，不得无界调用 `response.json()`。
5. 外部接口状态至少区分：`loading`、`ready`、`empty`、`unauthorized`、`forbidden`、`not_found`、`timeout`、`rate_limited`、`invalid_schema`、`too_large`、`server_error` 和 `blocked_by_policy`。
   状态映射固定为：HTTP 401 -> `unauthorized`、403 -> `forbidden`、404 -> `not_found`、429 -> `rate_limited`、408/超时 -> `timeout`、5xx -> `server_error`、重定向被拒或 URL/媒体策略拒绝 -> `blocked_by_policy`、JSON/字段校验失败 -> `invalid_schema`；无 CORS 响应的浏览器网络错误显示为 `unauthorized`，并允许用户重试。
6. 外部接口能够返回当前集合名称和分页总数时，面板更新展示；不能返回时使用 Point 的 `displayName` 作为临时标题并明确“数量未知”。
7. 外部请求失败不得自动把 URL 写回描述、改变引用类型或删除 Point。用户可以重试、复制安全地址或解除绑定。
8. 外部数据源的 URL 允许被多个 Point 引用；更新由第三方系统负责，map-service 不提供“同步快照”按钮。未来若需服务器端缓存或鉴权适配，另行定义 provider 配置和安全审计。

### F8. 2D、3D 与嵌入页面一致性

1. 2D Leaflet、3D Cesium 和 SidePanel 使用同一引用模型、分页契约、访问状态和错误码；不因端不同而把完整集合写回 KML。
2. 3D 首期至少支持识别图标、读取元数据/列表、进入统一预览器、编辑引用和导出；若暂时没有完整编辑器，必须提供只读入口并保留字段。
3. 2D 连续缩放、视口虚拟化和 3D 相机移动不能触发集合项预取；只有明确打开集合才建立集合请求。
4. 地图的媒体能力判断只读取“有引用/有内嵌项”摘要，不扫描外部 URL，不在 marker 创建阶段创建 iframe 或播放器。

### F9. 引用生命周期、复制与回收

1. 同一用户在 KML 内移动、复制 Point 或移动 KML 文件时，个人/外部引用按原 ID/URL 保留；复制不会复制个人集合。
2. 删除 Point 只删除绑定关系；集合继续留在个人空间，引用索引同步减少。
3. 软删除集合不会级联删除 KML Feature 或分享快照；引用显示 `trashed`/`missing`，恢复集合后可自动恢复为可读状态。
4. 永久删除集合前必须重新核对所有 KML/已发布分享来源。只要来源数据仍含该引用，即使派生绑定状态为 `trashed`、`stale` 或 `missing`，默认也阻止永久删除并提供“先解除引用/修复索引”路径；只有来源已不存在且索引已处置时才允许删除。
5. 集合所有者不能通过修改集合名称或项 URL 让旧引用静默转向另一个集合；ID 复用永久禁止。

### F10. 审计、统计与可观测性

1. 记录集合创建、基本信息更新、项批量变更、公开状态变更、回收/恢复/永久删除、绑定/解除绑定和管理员处置。
2. 公开读取仅记录聚合计数、状态和耗时；不记录原始 IP、完整 User-Agent、完整外部 URL 查询串或响应正文。
3. 至少监测：集合列表/详情/项页 P50/P95、公开读取成功率、按状态的失败数、平均页大小、缓存命中（如启用）和取消请求数。
4. 任何外部错误或集合权限错误不得写入 KML 描述、分享标题或公开错误响应中的内部堆栈。

## 9. 状态与行为矩阵

### 9.1 来源行为

| 来源 | KML 中保存 | 地图查看 | 公开分享 | 数据更新时机 | 导出 |
| --- | --- | --- | --- | --- | --- |
| 内嵌 | 完整 `resourceCollection` | 使用当前 Feature 数据 | 随 KML 已发布快照 | KML 修改并同步后 | 输出完整内嵌集合 |
| 个人公开 | `resourceCollectionRef.collectionId` | 读取个人集合当前页 | 通过分享授权读取当前公开集合 | 集合修改后立即可见 | 输出安全引用，不输出项 |
| 个人私有 | 同上 | 所有者读取 | 返回 `private/unavailable`，无项数据 | 改为公开后立即可见 | 不暴露私有项和管理信息 |
| 外部 | `resourceCollectionRef.dataUrl` | 浏览器直读外部接口 | 浏览器按同一地址直读，受外部 CORS/权限决定 | 外部系统更新后下一次读取生效 | 输出安全 URL 引用 |
| 缺失/非法 | 引用保留或导入 warning | Point 保留，集合区域显示不可用 | 不返回敏感细节 | 修复引用或来源后重试 | 不自动猜测或补写数据 |

### 9.2 引用读取状态

| 状态 | 适用来源 | 对用户显示 | 是否返回项 |
| --- | --- | --- | --- |
| `ready` | 个人/外部 | 可浏览 | 是，按页 |
| `private` | 个人 | 集合未公开 | 否 |
| `missing` | 个人 | 集合不存在或已删除 | 否 |
| `unauthorized`/`forbidden` | 外部或分享上下文 | 无权限访问 | 否 |
| `invalid_schema` | 外部/历史脏数据 | 数据格式不受支持 | 否 |
| `too_large` | 外部/请求 | 数据超过当前安全限制 | 否 |
| `timeout`/`server_error` | 外部 | 暂时无法读取，可重试 | 否 |
| `blocked_by_policy` | 任意 | 地址或媒体被安全策略拦截 | 否 |

公开接口不得用状态差异泄露私有集合是否存在；只有分享范围内已经确认存在的引用，才可以返回不含敏感信息的 `private` 状态。

## 10. API 契约（v1.5.63 已实现）

本节是 v1.5.63 的正式接口基线；完整路由、鉴权、示例和错误码同步维护在 `docs/api.md` 与 `docs/api-user-system.md`。路由层只做鉴权、参数读取、服务调用和响应封装，业务规则由服务层执行。

### 10.1 通用约定

- 基础路径为 `/api/v1`；成功和失败响应使用现有 `jsonSuc` / `jsonErr` 结构，时间使用 ISO 8601 UTC。
- 本节 map-service 路由示例中的对象默认表示 `result` 内层 payload；实际 HTTP 响应仍包在 `{ "code": 0, "result": <payload>, "error": null }` 中。第 7.4 节的外部第三方接口是独立契约，不使用该包装。
- 登录态写请求使用当前会话 Cookie、CSRF 校验和 `no-store`；公开读取不返回会话、Token、Cookie 或内部用户 ID。
- 私有资源不存在、已删除或不属于当前用户时，所有者 API 统一返回 `404 RESOURCE_NOT_FOUND`，避免横向枚举。
- 分页默认 `page=1`、`limit=20`，最大值由服务端安全配置决定；集合项浏览默认沿用 v1 的 40 项视觉页，但不把 40 写成不可调整的存储限制。
- 客户端提交的 `itemCount`、`byteSize`、`referenceCount`、`updatedAt`、公开状态快照和权限字段均不作为服务端写入依据。

### 10.2 权限码

已启用以下权限码：

| 权限 | 用途 |
| --- | --- |
| `resource_collection.own.read` | 读取自己可见的集合摘要、详情和项 |
| `resource_collection.own.write` | 创建、编辑、排序、回收、恢复和公开设置 |
| `resource_collection.any.read` | 管理员按合规需要读取任意用户集合的脱敏内容 |
| `resource_collection.any.manage` | 管理员处置任意用户集合、引用和回收记录 |
| `resource_collection.public.read` | 文档语义权限，不授予登录用户额外管理能力；公开路由按集合状态判定 |

内置 `user` 角色应获得 `resource_collection.own.read/write`；`admin` 和 `super_admin` 按既有管理边界获得跨用户权限。已有自定义角色在数据库迁移时补齐与其原有 KML 管理能力相称的集合权限，不能依赖前端隐藏 Tab 或运行时按角色名猜测。

### 10.3 所有者接口

| 方法 | 路径 | 权限 | 说明 |
| --- | --- | --- | --- |
| `GET` | `/resource-collections` | `resource_collection.own.read` | 集合摘要分页、搜索和筛选 |
| `POST` | `/resource-collections` | `resource_collection.own.write` | 创建空集合或带首批项的集合 |
| `GET` | `/resource-collections/:id` | `resource_collection.own.read` | 获取集合元数据，不默认返回全部项 |
| `PUT` | `/resource-collections/:id` | `resource_collection.own.write` | 更新名称、描述、公开状态、默认视图，携带 revision |
| `DELETE` | `/resource-collections/:id` | `resource_collection.own.write` | 移入回收站 |
| `POST` | `/resource-collections/:id/restore` | `resource_collection.own.write` | 恢复集合 |
| `DELETE` | `/resource-collections/:id/permanent` | `resource_collection.own.write` + 最近再验证 | 无活跃引用时永久删除 |
| `GET` | `/resource-collections/:id/items` | `resource_collection.own.read` | 项分页、排序和状态读取 |
| `POST` | `/resource-collections/:id/items` | `resource_collection.own.write` | 新增单项 |
| `POST` | `/resource-collections/:id/items/batch` | `resource_collection.own.write` | 批量新增/更新/删除，整批事务 |
| `PUT` | `/resource-collections/:id/items/:itemId` | `resource_collection.own.write` | 更新单项 |
| `DELETE` | `/resource-collections/:id/items/:itemId` | `resource_collection.own.write` | 删除单项 |
| `POST` | `/resource-collections/:id/items/reorder` | `resource_collection.own.write` | 按稳定 ID 重排 |
| `GET` | `/resource-collections/:id/references` | `resource_collection.own.read` | 分页查看引用 KML/Feature/分享摘要，返回准确总数 |
| `GET` | `/resource-collections/:id/export` | `resource_collection.own.read` | 导出独立集合 JSON（不含内部审计字段） |

列表查询支持：`status=active|trashed|all`、`visibility=private|public|all`、`search`、`sort=name|createdAt|updatedAt|itemCount`、`order=asc|desc`、`page`、`limit`。排序字段使用服务端 allowlist，`search` 有长度上限并按参数绑定/转义处理；排序和筛选均由服务端完成，不在前端只取固定窗口后伪造总数。

`/export` 仅在用户显式操作时执行；大集合必须采用流式或分页导出，受独立响应大小上限约束，不能为生成下载在服务端或浏览器一次性无界加载全部项。

创建示例：

```http
POST /api/v1/resource-collections
Content-Type: application/json
X-CSRF-Token: <current-csrf>

{
  "name": "北坡观景台资料",
  "description": "现场照片和全景",
  "visibility": "private",
  "viewMode": "grid"
}
```

成功响应的 `result` 返回集合摘要及 `revision=1`。创建首批项可以使用 `items`，但大批量数据必须使用批量接口，避免单个 JSON 请求超过运输层上限。

集合更新示例：

```json
{
  "revision": 7,
  "name": "北坡观景台资料（更新）",
  "visibility": "public",
  "viewMode": "list"
}
```

项批量请求采用显式操作，服务端返回逐项结果和新的 revision：

```json
{
  "revision": 7,
  "itemsRevision": 19,
  "operations": [
    {
      "action": "create",
      "clientId": "editor-001",
      "item": {
        "title": "正面照片",
        "url": "https://assets.example.com/front.jpg",
        "type": "image"
      }
    },
    {
      "action": "update",
      "itemId": "rci_2a9e...",
      "item": { "title": "新标题" }
    },
    { "action": "delete", "itemId": "rci_old..." }
  ]
}
```

批量接口的幂等键、重试和响应完整性应沿用 `/kml/sync` 的原则：客户端先持久化待提交操作，只有逐项校验响应后才能清除 pending；畸形 2xx 不得清空本地草稿。

#### 10.3.1 管理员引用治理接口

管理员读取权限 `resource_collection.any.read` 可通过 `GET /api/v1/admin/resource-collections/:id/references` 分页查看绑定摘要，支持 `status`（`active`、`stale`、`missing`、`trashed`、`all`）和 `sourceScope`（`owner_kml`、`published_share`、`all`）筛选。结果只返回 KML/分享标识、来源状态、操作者可用的脱敏名称和时间，不返回集合项 URL 或任何凭证。

具备 `resource_collection.any.manage` 时：

- `DELETE /api/v1/admin/resource-collections/:id/references/:bindingId` 会从来源 KML 或已发布分享快照移除仍存在的个人集合引用，并写入管理员审计；来源已不存在时等价于安全索引修复。
- `POST /api/v1/admin/resource-collections/:id/references/:bindingId/repair` 只允许将已不存在来源的派生绑定标记为 `missing`/`stale`；若来源仍含该引用则返回 `409 RESOURCE_COLLECTION_REFERENCE_STILL_ACTIVE`，避免绕过数据源直接制造孤儿引用。
- 集合恢复只恢复本次移入回收站操作标记的绑定；历史已处置的 `trashed` 绑定保持原状态。

### 10.4 KML 接口扩展

现有以下接口保持路径不变，只扩展 `features[].resourceCollectionRef`：

| 方法 | 路径 | 变更 |
| --- | --- | --- |
| `POST` | `/kml/files` | 接受合法个人/外部引用并更新引用索引 |
| `GET` | `/kml/files/:id` | 返回引用元数据，不展开集合项 |
| `PUT` | `/kml/files/:id` | 校验引用互斥、所有权、revision 和显式解除绑定 |
| `POST` | `/kml/sync` | 增量同步支持引用字段；引用删除必须显式提交 `null` |
| `POST` | `/kml/import` | 解析 `resource-collection-ref`，未知版本进入 warnings |
| `GET` | `/kml/files/:id/export` | 输出安全引用扩展，不输出集合项或敏感字段 |

KML 写入请求示例：

```json
{
  "name": "巡检路线",
  "revision": 3,
  "features": [
    {
      "id": "feat_site_001",
      "type": "Point",
      "name": "设备点位",
      "coordinates": [116.3974, 39.9093],
      "markerIcon": "collection",
      "resourceCollectionRef": {
        "version": 1,
        "sourceType": "personal",
        "resolution": "live",
        "collectionId": "rc_7f3c...",
        "displayName": "设备巡检资料"
      }
    }
  ]
}
```

如果服务端发现当前 KML 已有引用，而请求来自不认识该字段的旧客户端，必须拒绝可能造成丢失的覆盖并返回 `409 KML_RESOURCE_COLLECTION_REF_UNSUPPORTED`；新客户端通过明确发送完整引用或 `null` 表示保留/解除。不能把字段缺省静默当作删除。

### 10.5 公开个人集合接口

| 方法 | 路径 | 鉴权 | 说明 |
| --- | --- | --- | --- |
| `GET` | `/public/resource-collections/:id` | 集合 `visibility=public` | 公开元数据；默认不返回项，可用显式 `include=firstPage` 请求首项摘要 |
| `GET` | `/public/resource-collections/:id/items` | 集合 `visibility=public` | 公开分页项 |

公开接口只接受已知的公开引用 ID，不提供列表、搜索和 owner 过滤。私有、回收、禁用、未知 ID 统一返回项目现有的 `404 RESOURCE_NOT_FOUND`，以避免通过状态差异枚举集合。响应中的 `id`（如保留该字段）只能是前文定义的公开引用 ID，不得是内部数据库 ID；同时不返回所有者、引用列表和管理字段。

公开集合响应示例（请求 `include=firstPage`，不代表默认行为）：

```json
{
  "id": "rc_7f3c...",
  "name": "北坡观景台资料",
  "viewMode": "grid",
  "itemCount": 1280,
  "revision": 7,
  "itemsRevision": 19,
  "updatedAt": "2026-09-03T04:10:00.000Z",
  "items": [
    {
      "id": "rci_2a9e...",
      "position": 0,
      "title": "正面照片",
      "url": "https://assets.example.com/front.jpg",
      "type": "image",
      "coverUrl": "https://assets.example.com/front-thumb.jpg"
    }
  ],
  "pagination": { "page": 1, "limit": 40, "total": 1280, "hasNext": true }
}
```

如果公开接口和项接口拆开，二者都必须返回相同的 `updatedAt`、`revision` 和 `itemsRevision` 视图标识，避免翻页过程中把新旧集合内容混合而不提示。响应默认使用 `Cache-Control: no-cache, must-revalidate`（敏感场景可直接 `no-store`），并可使用 ETag/`If-None-Match` 做必须重新校验的条件缓存；不得使用会跳过校验的 stale 策略。公开状态切换或集合项变更必须使视图标识失效，并禁止 CDN 或浏览器缓存绕过新的私有状态；分享作用域响应不得跨分享授权上下文复用，且应正确设置 `Vary`。

### 10.6 分享范围内的解析接口

为避免公开客户端直接拼接内部权限，已提供分享作用域的只读接口：

| 方法 | 路径 | 鉴权 | 说明 |
| --- | --- | --- | --- |
| `GET` | `/public/kml-shares/:publicId/files/:shareItemId/features/:featureId/resource-collection` | 现有分享访问授权 | 返回该 Point 的集合来源状态和元数据 |
| `GET` | `/public/kml-shares/:publicId/files/:shareItemId/features/:featureId/resource-collection/items` | 同上 | 返回个人公开集合的分页项；外部来源返回 `external` 状态，不做代理 |

接口必须先执行现有 `assertPublicShareAccess`、站点访问和空间访问判定，再解析分享快照中的引用。响应包络如下：

```json
{
  "sourceType": "personal",
  "accessState": "ready",
  "collection": {
    "name": "北坡观景台资料",
    "viewMode": "grid",
    "itemCount": 1280,
    "updatedAt": "2026-09-03T04:10:00.000Z"
  },
  "items": [],
  "pagination": { "page": 1, "limit": 40, "total": 1280, "hasNext": true }
}
```

个人集合为私有/回收/不存在时，包络仍可返回 `accessState=private` 或 `missing`，但不得带名称、数量、ID、URL 或所有者信息。这些状态只允许在分享作用域已经通过分享授权、且服务端正在解析该快照引用时返回；不能把该状态语义复用到直接公开集合接口。外部来源返回 `sourceType=external`、安全 `dataUrl` 和 `accessState=external`，由浏览器转为直读；map-service 不替外部请求数据。

### 10.7 API 错误码

除现有通用错误码外，v1.5.63 固定以下错误码，并已同步写入 `docs/api.md`：

下表的 HTTP 状态码只描述 map-service 自身的所有者/公开/分享接口。外部接口的 401/403/404/429/5xx、CORS 拒绝、重定向、超时和非法响应，在本期浏览器直读模式下不由 map-service 代发或透传，而是按 F7 归一为客户端 `accessState`。`RESOURCE_COLLECTION_EXTERNAL_UNAVAILABLE` 和 `RESOURCE_COLLECTION_EXTERNAL_TIMEOUT` 是未来受控服务端 provider/适配层的预留映射，不得据此实现通用 URL 代理。

| HTTP | 错误码 | 触发条件 |
| --- | --- | --- |
| `400` | `RESOURCE_COLLECTION_REF_INVALID` | 引用结构、版本、来源字段或 URL 不合法 |
| `400` | `RESOURCE_COLLECTION_ITEM_INVALID` | 集合项字段、类型或 URL 不合法 |
| `400` | `RESOURCE_COLLECTION_ORDER_INVALID` | 排序项缺失、重复或不属于集合 |
| `403` | `RESOURCE_COLLECTION_PERMISSION_DENIED` | 缺少集合管理权限 |
| `404` | `RESOURCE_NOT_FOUND` | 所有者接口找不到、不属于当前用户、已删除的集合/项；直接公开接口对私有/回收/未知 ID 也统一使用该语义 |
| `409` | `RESOURCE_COLLECTION_REVISION_CONFLICT` | 集合或项 revision 过期 |
| `409` | `RESOURCE_COLLECTION_REF_CONFLICT` | Point 同时存在内嵌和引用，或本次转换/更新提交的引用与当前 revision 不匹配；集合后来变为私有不应被当作写入冲突 |
| `409` | `RESOURCE_COLLECTION_DELETE_REFERENCED` | 来源仍含引用时尝试永久删除（不受派生绑定状态影响） |
| `409` | `RESOURCE_COLLECTION_REFERENCE_STALE` | 解除请求对应的来源已变化，需先刷新并修复派生索引 |
| `409` | `KML_RESOURCE_COLLECTION_REF_UNSUPPORTED` | 旧客户端可能覆盖未知引用 |
| `410` | `RESOURCE_COLLECTION_TRASHED` | 仅限已确认资源存在的管理/分享内部上下文；直接公开接口不得用 410 暴露回收状态 |
| `413` | `RESOURCE_COLLECTION_PAYLOAD_TOO_LARGE` | 集合批量请求超过运输上限，或未来受控 provider 的外部响应超过安全上限；浏览器直读的外部超限统一归一为 `too_large` |
| `429` | `RESOURCE_COLLECTION_RATE_LIMITED` | 公开集合或分享解析请求过频 |
| `502` | `RESOURCE_COLLECTION_EXTERNAL_UNAVAILABLE` | 未来受控外部 provider 的网络/5xx 失败（本期浏览器直读不返回该 map-service 状态） |
| `504` | `RESOURCE_COLLECTION_EXTERNAL_TIMEOUT` | 未来受控外部 provider 超时（本期浏览器直读归一为 `timeout`） |

所有者/公开接口错误响应沿用项目现有 `jsonErr` 结构，例如：

```json
{
  "code": -1,
  "result": null,
  "error": {
    "code": "RESOURCE_NOT_FOUND",
    "message": "资源不存在"
  }
}
```

在分享页面中，集合读取失败优先返回 200 包络加 `accessState`，避免一个坏集合让整个 KML 文件请求失败；只有分享本身未授权、暂停、过期或撤销时才沿用现有分享接口的 401/403/404/410 语义。

## 11. 持久化、索引与事务

### 11.1 数据库表建议

沿用 `UserDatabase`/SQLite，不新增散落的 JSON 文件。当前用户数据库为 schema v13，迁移已包含：

迁移必须幂等、先备份后执行；不提供会删除业务数据的 down migration。迁移失败时恢复备份或执行经审计的补偿迁移，现有 `features_json` 和分享快照原样保留。

```text
resource_collections
  id, owner_id, name, description, visibility, status, view_mode,
  item_count, byte_size, revision, items_revision,
  created_at, updated_at, deleted_at

resource_collection_items
  id, collection_id, position, title, url, type, cover_url,
  created_at, updated_at

resource_collection_bindings   (可重建的派生索引)
  id, collection_id, kml_id, feature_id,
  share_id, share_item_id, source_scope, status,
  created_at, updated_at
```

具体列名可以遵循现有 snake_case 约定，但必须满足：

- `resource_collections.owner_id` 外键关联 `users`；个人集合的所有查询首先限定 owner 或公开状态。
- `resource_collection_items` 以 `(collection_id, id)` 唯一，按 `(collection_id, position, id)` 建索引；不能用全局递增序号作为公开 ID。
- `resource_collection_bindings` 不作为唯一事实来源。KML Feature 和已发布分享快照更新成功后在同一事务内维护索引；启动修复或后台任务可以从它们重建。
- `source_scope` 至少区分 `owner_kml`、`published_share`；`status` 至少区分 `active`、`missing`、`trashed`、`stale`。这些值只用于管理和修复提示，读取时仍必须重新判定集合当前权限。
- 软删除不级联删除 KML Feature 或分享快照；永久删除前按来源内容检查所有绑定状态，并写入审计。
- `item_count`、`byte_size` 和 `items_revision` 的更新与项写入在同一事务内完成；`byte_size` 按服务端规范化后的 UTF-8 JSON 字节数计算，不接受客户端上报；进程崩溃后不能出现统计值小于实际可读项数的状态。
- 集合项变更必须原子更新 `item_count`、`byte_size`、`items_revision` 和 `updated_at`；基本信息/公开状态变更更新 `revision` 和 `updated_at`。公开读取的 ETag/视图标识至少包含两类 revision 与 visibility。
- 外部引用不在集合表中创建虚拟项；其 URL 和展示提示只保存在 KML Feature 引用中。

### 11.2 KML 与分享快照的事务边界

1. KML 创建/更新：规范化 Feature -> 校验个人引用的管理或公开只读资格/外部 URL -> 写 `kml_documents` -> diff 并更新 `resource_collection_bindings` -> 提交 revision。
2. 分享创建/同步：读取 active KML 的引用描述 -> 生成已发布快照 -> 写 `kml_share_items` -> 更新分享绑定索引 -> 提交内容 revision。此流程不得为了生成快照而读取所有集合项。
3. 集合公开切换：更新集合 visibility 和审计；不改写所有 KML 或分享快照，由读取接口实时判定。
4. 集合项变更：更新项、集合统计和 `items_revision`；引用 Point 和分享的 revision 不递增，不触发 KML 分享同步。
5. 任何一个阶段失败都回滚本次业务写入；索引修复失败只能标记待修复，不得删除主数据。

### 11.3 配额与设置

独立集合配额与 KML 文件配额分开统计，建议在用户体系设置中增加可配置项：

| 配额 | 说明 |
| --- | --- |
| `maxCollectionsPerUser` | 活动集合数量 |
| `maxItemsPerCollection` | 单个独立集合项数 |
| `maxCollectionBytesPerUser` | 集合项规范化数据总字节数 |
| `maxBatchItemsPerRequest` | 单次批量写入项数 |
| `publicCollectionReadRateLimit` | 公开集合读取限流 |

默认值由部署能力决定；服务端保留非负安全整数和运输层上限等真实边界，不把旧 v1 的 300/512 KiB 误当作独立集合硬上限。恢复回收站集合、导入和批量新增都必须重新执行配额校验；超限时返回已成功/未写入的明确结果，不能静默跳过。

## 12. 安全与隐私要求

### 12.1 身份、权限与分享授权

- 所有者 API 使用 Cookie 会话、CSRF 和权限码；管理员跨用户 API 采用独立 `resource_collection.any.*` 权限。
- 公开集合接口只按不可枚举 ID 读取，不提供集合列表、搜索、owner 过滤或引用反查。
- 公开集合路由默认仅服务 map-service 自有页面；如需跨域读取，必须配置明确的来源 allowlist、只读方法和 `credentials: omit`，不得使用带凭证的通配符 CORS。
- 分享作用域接口必须先通过现有分享生命周期、密码、站点访问、空间边界和访问 Cookie；不能因为集合 URL 是公开的而绕过分享本身的访问控制。
- 私有集合的直接公开请求统一按 404 处理；分享作用域只返回不含敏感细节的状态包络。
- 公开开关、永久删除、管理员处置和跨用户查看均写审计；审计不得包含密码、Token、Cookie、Authorization、代理凭证、原始 IP 或完整敏感 URL。

### 12.2 URL、SSRF 与浏览器直读

- 个人集合项和 `dataUrl` 继续使用 HTTPS、无用户名/密码、无 localhost/内网/link-local/metadata 主机和敏感查询参数规则；非默认端口必须经过部署级 allowlist，不能由单个用户自行放开。
- 外部接口不由服务端回源，不新增通用代理；浏览器请求必须使用 `credentials: omit`，不从 map-service 会话转发 Cookie 或 Authorization。
- 外部响应中的每一个资源 URL 仍由客户端执行协议、主机、查询参数和媒体类型校验；被拒绝时只展示状态和安全的原地址入口。
- 不允许通过 iframe、图片、视频或外部 JSON 响应注入原始 HTML、脚本、事件属性或自定义 sandbox。iframe 继续遵守全局 allowlist、sandbox 和 referrer policy。
- 集合项媒体和 iframe 预览默认使用 `referrerpolicy="no-referrer"`，并沿用统一预览器的 sandbox、加载取消和资源释放策略。
- 外部 `dataUrl` 的重定向、CORS、Content-Type、响应大小和超时均有明确失败状态；不把重定向后的未知主机自动写回引用。

### 12.3 公开内容裁剪

公开个人集合只投影渲染和交互所需字段：`id`（必要时替换为公开别名）、`position`、`title`、`url`、`type`、`coverUrl`、`itemCount`、`viewMode`、`updatedAt`。禁止返回描述中的管理备注、内部绑定、回收原因、owner 信息、服务端路径和数据库字段。

## 13. 性能与可靠性要求

### 13.1 KML 和网络负载

- Point 引用 Feature 的体积与集合项数解耦；单个引用只允许固定大小的 ID、URL 和展示提示。
- KML 列表、地图首屏、bbox、聚合和分享 manifest 不加载集合项；集合详情 API 不得被隐式串行调用多次。
- 集合项默认按 40 项视觉页读取，服务端允许安全范围内调整；页面或虚拟列表不得一次创建全部媒体节点。
- 个人集合项请求、分享作用域请求和外部请求均支持取消、并发合并和短时缓存；缓存键必须包含来源 ID、页码/筛选、来源 revision/ETag 和授权上下文，不能跨私有用户复用。
- 外部接口不稳定时采用有界重试（默认不自动重试写操作），不阻塞地图主线程或其他 Point。

### 13.2 可观测指标

至少记录以下脱敏指标：

- 集合列表、元数据、项页和分享解析的请求量、P50/P95、错误率和取消率。
- 个人集合公开/私有读取计数，按 `ready/private/missing/unauthorized/invalid_schema/timeout` 聚合。
- 单次批量写入项数、事务耗时、冲突次数、索引修复耗时和配额拒绝数。
- 外部接口响应状态、耗时和响应字节区间；不记录响应正文、完整查询参数或凭证。

### 13.3 可靠性边界

- 网络失败、浏览器刷新或旧响应到达时，不得把空集合写回 KML 或覆盖已有草稿。
- KML/集合 revision 冲突必须保留用户本地修改并返回可重试详情；不能无提示覆盖另一端更新。
- 外部接口内容更新不改变 KML revision；用户显式替换/解除引用才改变 KML revision。
- 低速网络和大集合场景下，地图仍保持 Leaflet 连续缩放、瓦片过渡和点位完整可达，不以隐藏固定数量资源解决性能问题。

## 14. 兼容、迁移与数据转换

### 14.1 既有内嵌集合

- 既有 `resourceCollection` 默认保持内嵌，不做后台自动拆分，避免改变分享快照和 KML 导出语义。
- 用户可在 Point 编辑器选择“另存为个人资源集合”。服务端先完整校验并创建独立集合，成功后再以同一 KML revision 原子替换为 `resourceCollectionRef`；失败时原内嵌集合不变。
- 独立集合转回内嵌时必须读取全部项并满足 v1 的 300 项/512 KiB 限制；超出即拒绝，提供继续使用引用或导出备份路径。
- 复制/移动同一用户的 Point、KML 和目录时保留引用 ID/URL，不复制集合项，也不生成新的集合。

### 14.2 旧客户端和未知字段

- 旧客户端读取含 `resource-collection-ref` 的 KML 时至少保留 Point 几何和名称；无法识别引用时显示只读“需要新版客户端”状态。
- 服务端不能让不认识引用字段的旧客户端静默覆盖它。若请求缺少能力声明且会删除已有引用，返回 `409 KML_RESOURCE_COLLECTION_REF_UNSUPPORTED`；显式 `null` 才允许解除。
- `/auth/config` 或等价能力配置应返回 `resourceCollectionRefVersion=1`，前端据此决定是否显示来源选择器。
- 未知引用版本、同时存在两种集合字段、非法 URL 或损坏 JSON 导入时，保留 Point 几何，加入 `warnings`，不阻断其他 Feature；导出不原样回写不受支持结构。

### 14.3 导入、分享导出和权限边界

- 同账号导入优先按 `collectionId` 重新绑定现有集合，但必须重新确认集合仍属于当前用户且未被删除。
- 跨账号导入不复制私有集合。用户可以主动选择本地集合、转为内嵌或移除引用；任何自动下载/复制都不在本期范围。
- 公开分享的 KML 文件和导出内容只带安全引用。私有个人集合不泄露可枚举 ID、名称、项数或 URL；外部地址仅在通过 URL 安全校验时保留。
- 个人集合公开后，已存在的 KML 分享无需重新同步即可在下一次读取中显示；改回私有同样立即隐藏。分享中的引用本身被替换或移除时，仍沿用既有分享同步和 revision 机制。

## 15. 测试与验收标准

### 15.1 服务端单元与模型测试

- 集合/项/引用 normalize、长度、枚举、URL 协议、敏感参数、主机和版本校验。
- 独立集合项数、字节、批量运输层和用户配额边界；超限不截断、不部分提交。
- 集合项 ID 稳定性、排序、重复 ID、删除后不可复用和 revision 冲突。
- 公开/私有/回收/禁用状态转换、直接公开接口的 404 防枚举、分享作用域状态投影。
- 个人集合创建、编辑、批量操作、引用计数、软删除、恢复、永久删除阻断和索引重建。
- KML Feature 同时出现内嵌与引用、未知版本、旧客户端覆盖保护、导入 warning 和导出脱敏。

### 15.2 API 与权限测试

- 所有者成功路径、未登录、CSRF 失败、缺少权限、跨用户 ID、管理员授权和账号禁用。
- 个人集合公开接口、分享作用域接口、密码分享、站点访问、空间受限分享和撤销/过期状态。
- 公开响应不含 owner、内部绑定、管理备注、Token、Cookie、密码、敏感查询值和完整错误堆栈。
- 分页总数、空页、并发修改、ETag/缓存失效和异常 2xx 响应处理。
- 外部接口 401/403/404/429/5xx、超时、CORS 拒绝、重定向、非法 JSON、未知版本、超大响应和危险资源 URL。

### 15.3 KML 往返和分享测试

- v1 内嵌集合导入 -> 编辑 -> 导出 -> 再导入后字段等价，既有分享快照测试全部通过。
- 个人 ID 引用和外部引用导出/导入后不膨胀为完整项数组；同账号可重绑定，跨账号进入明确未解析状态。
- 创建分享、同步分享、读取公开文件和导出时，引用只保存安全描述；集合项不会写入 `published_snapshot_json`。
- 公开集合项更新、排序、公开切换、回收和恢复在无需分享同步的前提下得到预期结果。
- 私有集合和外部无权限场景不影响同一 KML 中其他 Point、线段、Polygon、媒体和评论资源。

### 15.4 前端和浏览器验收

- 个人空间新增 Tab 在桌面、移动端和只读角色下正确显示；列表筛选、分页、创建、编辑、公开设置、引用查看和回收站流程可用。
- Point 编辑器三种来源切换、搜索选择、替换/解除、内嵌转换和失败回滚可用；不使用原生阻塞弹窗。
- 地图首屏和 KML 详情网络面板证明没有集合项预取；点击查看后才发生单页请求，快速切换不会出现旧数据串入。
- 40 项以上和大于旧 v1 上限的独立集合能够分页、排序、预览和关闭释放资源；没有固定数量静默省略。
- 2D、3D、SidePanel、公开分享、密码分享和外部 CORS 失败的文案、焦点、滚动锁、退出和重试状态一致。
- 通过 Playwright/浏览器探针验证集合面板、媒体预览、分页总数、DOM 数量、请求取消和窄屏无溢出。

### 15.5 性能验收

以现有大型 KML 基准和一个至少达到独立集合配置上限的测试集合验收：

| 场景 | 验收目标 |
| --- | --- |
| KML 首屏/列表 | 引用项不随集合总项数线性膨胀；不发起隐式集合项请求 |
| 集合列表 | 只返回摘要和准确总数；分页请求 P95 达到项目通用 API 目标 |
| 集合面板 | 默认只渲染当前页/窗口，关闭后媒体节点和请求可观测释放 |
| 多点位地图 | 同时存在多个引用时，缩放、平移、定位和普通媒体交互不被集合请求阻塞 |
| 公开分享 | 清单、KML 文件和集合页均不复制全量项；权限失败只影响对应集合 |
| 外部接口 | 超时、重试和大响应受有界策略控制，不阻塞主线程或其他文件 |

### 15.6 验收清单（AC）

- **AC-01**：已有内嵌集合无需迁移即可继续编辑、导入、导出、复制、分享和预览。
- **AC-02**：用户可在个人空间创建完整独立集合，集合项分页编辑且 ID/顺序稳定。
- **AC-03**：Point 可绑定个人集合 ID；保存的 KML Feature 不含完整集合项。
- **AC-04**：Point 可绑定外部数据 URL；保存时不访问外部服务、不保存凭证。
- **AC-05**：打开 Point/集合面板才读取项；错误、取消和关闭不会破坏地图或草稿。
- **AC-06**：个人集合默认私有，公开开关可审计、可撤回，直接公开接口不可枚举。
- **AC-07**：公开分享中的公开个人集合可读取最新数据，私有集合只显示无敏感细节的不可用状态。
- **AC-08**：集合项更新不需要分享同步；替换引用仍遵循 KML/share revision。
- **AC-09**：外部接口按标准 JSON、CORS、超时和安全 URL 规则读取；无权限显示结构化状态。
- **AC-10**：集合删除、回收、恢复、跨账号导入和旧客户端写入均无静默丢数据路径。
- **AC-11**：2D/3D/分享/SidePanel 共享同一数据契约，完整自动化测试和构建检查通过。

## 16. 分阶段交付路线

### Phase 0：契约与迁移准备

- 确认字段、权限码、外部 JSON 版本、公开状态语义和直接 ID/分享作用域读取策略。
- 更新 `docs/api.md`、用户指南、错误码和数据库迁移设计；增加 normalize/validate 纯函数测试。
- 完成 schema 迁移、备份/恢复演练和引用索引重建脚本设计。

### Phase 1：个人集合库

- 实现独立集合/项表、CRUD、分页、排序、revision、配额、回收站和审计。
- 个人空间增加资源集合 Tab 和编辑器；不改变地图 Point 行为。
- 退出条件：集合 API/权限/并发/分页测试通过，列表不返回完整项数组。

### Phase 2：Point 引用与按需查看

- 实现 `resourceCollectionRef` normalize、KML 往返、Point 来源选择、绑定索引和 2D/3D/SidePanel 按需加载。
- 复用现有集合面板/媒体预览器，增加引用状态和请求取消。
- 退出条件：AC-01～AC-05 及浏览器网络/DOM 验收通过。

### Phase 3：分享与公开个人集合

- 增加公开个人集合接口、分享作用域解析、快照引用投影、公开状态实时判定和下载脱敏。
- 覆盖密码、站点访问、空间限制、撤销/过期和集合回收竞态。
- 退出条件：AC-06～AC-08 及公开分享回归测试通过。

### Phase 4：外部数据接口

- 实现外部引用编辑、浏览器直读、标准 JSON 校验、CORS/错误状态、分页和有界缓存。
- 以测试服务模拟 401、超时、非法 JSON、超大数据和动态更新；不接入任意服务器代理。
- 退出条件：AC-09、SSRF/隐私测试和外部契约示例验证通过。

### Phase 5：转换、治理和优化

- 提供内嵌/独立转换、引用查看、索引修复、迁移告警、性能指标和运维文档。
- 根据真实数据规模再决定是否增加 item 级状态、版本快照、provider adapter 或公开别名。
- 退出条件：AC-10～AC-11、完整测试、`npm run check`、`npm test`、`npm run build` 和大型集合浏览器验收通过。

### v1.5.63 实施结果

- Phase 0～Phase 4 已在服务端和前端落地：数据库 schema 升级至 v13，个人集合/项及绑定索引已启用，KML 引用、公开与分享作用域接口已接入。
- 独立集合项上限、单用户容量、批量操作数和公开读取限流采用管理员配置；不再复用内嵌集合的 300 项/512 KiB 限制。内嵌 `resourceCollection` 行为保持不变。
- 公开集合读取拆分为元数据与分页项接口；分享作用域同样拆分，外部 `dataUrl` 只返回安全引用，由浏览器直读并使用 `credentials: omit`，服务端不做代理。
- 旧客户端保护已实现：带既有引用的更新若未声明 `resourceCollectionRefVersion=1` 会返回 `409 KML_RESOURCE_COLLECTION_REF_UNSUPPORTED`；显式提交 `resourceCollectionRef: null` 才能解除绑定；导入的未解析引用可在不改引用时保留。
- 当前实现以页为单位加载集合项，返回 `page`、`limit`、`total/pageCount`（外部来源可为未知）及 `collectionRevision`、`itemsRevision`、`updatedAt`；前端切页会取消旧请求，旧响应不得覆盖新页。
- Phase 5 中的服务端 provider、Webhook、冻结快照、item 级审核和目录能力仍属于后续路线，未在 v1.5.63 中实现。

### 迁移、测试与部署记录

- 迁移：启动时执行用户数据库 v13 幂等迁移，新增三张资源集合表及必要索引；升级前必须备份用户数据库和 `.db/admin/`。
- 测试：实现已补充资源集合、引用保护、公开/分享分页、权限、限流和删除生命周期回归测试；发布前统一执行 `rtk npm run check`、`rtk npm test`、`rtk npm run build` 与 `rtk git diff --check`，结果写入变更日志。
- 部署：目标环境为 161 内网测试服务器；版本 `1.5.63` 的实际部署时间、构建标识、备份位置、健康检查和回滚命令在部署完成后补录至 `docs/changelog.md` 与运维记录。

## 17. 后续事项与风险

以下事项不影响 v1.5.63 已实现能力，作为后续版本的决策与风险跟踪项：

1. 独立集合的默认项数、单用户总字节和单批请求上限；建议由管理员配置，技术运输层保留独立硬边界。
2. 是否需要独立的不可关联 `public alias`。本期默认直接使用服务端生成的高熵 `rc_*` 公开引用 ID（不暴露数据库自增主键）；若后续隐私评估要求 alias，Point 内部 `collectionId` 不变，只在公开投影替换为 alias。
3. 外部接口是否需要支持 CORS 以外的认证方式、签名 URL 或用户自定义 Header；默认答案是不存储、不转发，需单独安全评审后才能放开。
4. 独立集合是否需要文件夹/目录；本期先使用扁平列表，目录能力可复用 KML 目录模型但不得阻塞核心引用。
5. 是否需要公开集合的 item 级禁用、审核、版本快照和回滚；本期只要求集合级公开和 revision。
6. 永久删除存在活跃引用时，是一律阻止，还是允许带孤立引用警告强制删除；默认采用阻止，以降低分享断链风险。
7. 外部数据是否需要服务端 provider adapter、Webhook 或写入 API；这属于更广的内容库集成规划，不应通过本期 `dataUrl` 变相实现。

主要风险及缓解：

| 风险 | 缓解 |
| --- | --- |
| 集合实时更新导致分享内容不可预测 | 在 UI、API 和文档中明确 live 语义；未来冻结版本另立模型 |
| 私有集合被 KML 导出或旧客户端泄露 | 公开投影裁剪、旧客户端写入保护、导出脱敏和高熵 ID |
| 大集合编辑器请求/DOM 膨胀 | 独立项表、分页/虚拟化、批量事务和请求取消 |
| 外部 URL 带来 SSRF/XSS/CORS 风险 | 浏览器直读、无凭证转发、主机/协议校验、严格 JSON/iframe 策略 |
| 删除集合造成大量断链 | 软删除、引用统计、永久删除阻断和可重建索引 |
| 分享快照与动态集合权限不一致 | 分享授权先于集合解析，公开状态每次读取重判，不自动暂停分享 |

## 18. 实施影响面与交付要求

本次 v1.5.63 实现涉及以下边界，具体文件以代码审查和后续维护为准：

- 服务端：`service/bin/user/database.js`、`userContent.js`、`service.js`、`simpleApi.js`、权限/配置/审计模块。
- 共享模型：`shared/kml-resource-collection.js`、KML 内容视图和公开资源引用模块；新增引用 normalize/serialize/sanitize 纯函数。
- 2D/3D/SidePanel：Point 编辑器、资源集合面板、媒体预览器和 KML 导入导出路径。
- 个人空间：`src/account/model.js`、`api.js`、`views.js`、`dialogs.js`、状态与样式；新增 Tab 不应破坏现有 KML/分享分页。
- 测试：模型、数据库、API 鉴权、KML 往返、分享状态、外部接口、并发和 Playwright 浏览器测试。
- 文档：实现接口时同步更新 `docs/api.md`、`docs/api-user-system.md`、`docs/user-guides/kml-resource-collections.md` 和 `docs/changelog.md`。

后端交付必须包含稳定接口、数据契约、迁移/回滚说明、自动化测试和脱敏错误示例；前端只能依赖本文及正式 API 文档中定义的字段，不得把集合完整数据嵌入 KML 作为临时实现。
