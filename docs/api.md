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

错误响应使用 `code: -1`，稳定错误码和中文消息分别放在 `error.code`、`error.message`。二进制瓦片接口成功时直接返回图片流，不包 JSON。

## 鉴权

用户和管理后台统一使用服务端可撤销会话。登录成功后服务端写入：

```text
map_user_session=<opaque-token>; HttpOnly
map_csrf_token=<csrf-token>
```

浏览器调用时应启用同源 Cookie。`POST`、`PUT`、`PATCH`、`DELETE` 等写请求除携带会话 Cookie 外，还必须把 `map_csrf_token` Cookie 的值放入请求头：

```text
X-CSRF-Token: <csrf-token>
```

登录、管理后台登录和自助注册没有预登录 CSRF Cookie，因此浏览器请求改为校验同源 `Origin` / `Referer` / `Sec-Fetch-Site`；跨站来源返回 `403 CSRF_INVALID`。

管理接口统一位于 `/api/v1/admin`，服务端按权限码鉴权；角色显示名或角色代码本身不替代权限判定。`system.super_admin` 拥有全部业务权限。旧管理 Bearer Token 已统一失效，管理员必须重新登录并使用 Cookie 会话；前端不得在 `localStorage` 保存管理 Token。

公开 KML 分享文件中的 Feature 可带 `resourceRefs` 交互元数据。该元数据只包含稳定 Feature/Media opaque ID、媒体类型和来源类别，不包含内部 KML ID、联系方式、Token 或原始认证信息；资源引用校验失败时服务端 fail-closed，不会返回不一致的公开快照。

前台地图访问控制由 `/api/v1/access/*` 维护；如果后台启用了访问密码，前台公开 catalog 和图源瓦片接口需要浏览器携带 `map_access_token` HttpOnly Cookie。站点访问 Cookie、用户会话 Cookie和分享授权 Cookie互不替代。

首次初始化用户数据库且尚无有效超级管理员时，可使用以下环境变量引导创建首个超级管理员：

- `MAP_SERVICE_ADMIN_USERNAME`
- `MAP_SERVICE_ADMIN_PASSWORD`
- `MAP_SERVICE_USER_DATABASE`：可选，用户 SQLite 数据库路径。

本地开发默认账号密码为 `admin` / `admin`。弱密码账号会被标记为首次登录必须修改；生产或共享环境必须在首次启动前覆盖默认密码。数据库已有有效超级管理员后，环境变量不会覆盖其密码。若数据库没有有效超级管理员且显式引导用户名命中已有账号，服务会先替换为引导凭据、递增权限版本并撤销该账号全部旧会话，再授予超级管理员，避免旧会话继承提权。

用户、个人 KML、收藏、多 KML 分享和 RBAC 的完整契约见 [用户体系与多 KML 分享 API](./api-user-system.md)，部署、初始化、备份与恢复见 [用户体系部署与运维](./user-system-deployment.md)。

## 交互领域契约（Phase 1B/C/3）

部署、初始化、Cookie/CSRF 接入、AI provider、备份恢复和 agent 执行步骤见[交互功能部署与接入手册](./interaction-deployment-and-integration.md)。本文继续作为字段、路由、错误码和响应脱敏边界的 API 事实源。

Phase 1A 的内部数据契约和独立数据库已经冻结，Phase 1B/C 已接入留言、审核、策略、关键词、举报和来源信息服务与路由，Phase 3 增加 AI provider 管理、异步审核和加密审计。实现位置为 `shared/interaction-contracts.js`、`shared/interaction-ai.js`、`service/bin/interaction/`、`service/bin/service.js` 和 `service/bin/simpleApi.js`；数据库文件默认为 `.db/interaction.sqlite`，版本为 `1`，不复用或升级用户数据库版本。

### 资源与输入边界

- 留言只允许 `scope=feature`；举报允许 `share`、`feature`、`media`。资源引用必须通过已发布快照校验，外部只使用 `sharePublicId/shareItemId/featureId/mediaId`，不接受内部分享 ID。
- 留言正文上限 2000 个 Unicode 字符；举报说明和证据分别受 4000/8000 字符上限约束，侵权下架另需明确的布尔权利声明。服务端执行 NFKC、换行规范化、控制字符、脚本/危险链接协议和 HTML 标签/事件属性检查。
- 客户端只提交明确的 `consent=true`；`consentPolicyVersion` 必须由服务端从当前策略显式传入，并且必须引用 `interaction_policy_versions` 中真实存在的版本，不允许缺省为固定版本或信任客户端自报版本。
- 回复只允许引用同一资源、`active + approved` 的一级父留言。父留言已有回复后不得修改其稳定资源身份或层级；父留言隐藏、拒绝或其他原因失去公开资格时，现有回复同步转为非公开，父留言进入 `orphaned` 时回复同步进入 `orphaned`，恢复父留言不会自动恢复旧回复。
- 联系方式按标准化后的邮箱/手机号保存为密文与 HMAC 哈希；AES-256-GCM v1 密文在数据库层校验 Base64URL 分段、12 字节 IV、16 字节认证标签和非空载荷。公开响应不返回联系方式、原文密文、用户内部 ID、AI 分数、关键词命中或管理备注；管理详情只返回受控 AI 分数、置信度、策略版本、结果哈希和原始结果是否仍在保留期内。
- 解密缺少密钥、密文格式非法和认证失败分别使用内部类型化错误 `INTERACTION_SECRET_REQUIRED`、`INTERACTION_CIPHERTEXT_INVALID`、`INTERACTION_DECRYPT_FAILED`；公开 API 不直接泄露密钥或密文细节。
- `clientRequestId` 是有界幂等键；游标和幂等键只允许不透明 ASCII 标识。重复写入由数据库唯一索引和服务层共同处理。

### 已开放的公开 facade

| 方法 | 路径 | 写入约束 |
| --- | --- | --- |
| `GET` | `/api/v1/public/kml-shares/:publicId/comments` | 只返回同一已授权资源上 `active + approved` 留言；支持 `shareItemId`、`featureId`、`cursor`、`limit` |
| `GET` | `/api/v1/public/kml-shares/:publicId/comments/count` | 返回同一资源的准确公开计数，不计入待审或隐藏留言 |
| `GET` | `/api/v1/public/kml-shares/:publicId/comments/policy` | 只返回 `enabled`、策略版本、匿名开关、联系方式要求、长度和审核摘要 |
| `POST` | `/api/v1/public/kml-shares/:publicId/comments` | 登录会话必须通过 CSRF；匿名提交必须策略允许且通过同源校验；成功返回 `202`，留言默认进入 `pending` |
| `POST` | `/api/v1/public/kml-shares/:publicId/reports` | 登录会话必须通过 CSRF；匿名举报按策略和同源校验；正文不进入留言/审核流，成功返回通用 `202` |
| `GET` | `/api/v1/public/kml-shares/:publicId/info` | 分享访问授权；返回来源说明、协议链接和已脱敏举报能力 descriptor |

所有公开交互请求先复用分享访问、站点访问和已发布快照资源授权；无法区分“不存在”和“无权访问”的资源统一按 `RESOURCE_NOT_FOUND` 处理。公开响应不包含正文密文、联系方式、用户内部 ID、审核内部字段或管理备注。

### 已开放的管理 facade

管理路由使用统一会话、权限码和写操作 CSRF 校验，并设置 `Cache-Control: no-store`：

| 方法 | 路径 | 权限 |
| --- | --- | --- |
| `GET` | `/api/v1/admin/comments` | `admin.comment.read` |
| `GET` | `/api/v1/admin/comments/:id` | `admin.comment.read` |
| `POST` | `/api/v1/admin/comments/:id/review` | `admin.comment.moderate` + CSRF |
| `POST` | `/api/v1/admin/comments/:id/reprocess` | `admin.comment.moderate` + CSRF；使用当前策略和关键词版本重新审核 |
| `DELETE` | `/api/v1/admin/comments/:id` | `admin.comment.moderate` + CSRF，软删除 |
| `GET` | `/api/v1/admin/moderation/settings` | `admin.comment.read` |
| `PUT` | `/api/v1/admin/moderation/settings` | `admin.comment.policy.manage` + CSRF |
| `GET` | `/api/v1/admin/moderation/keywords` | `admin.moderation.keyword.manage` |
| `PUT` | `/api/v1/admin/moderation/keywords` | `admin.moderation.keyword.manage` + CSRF |

重新审核会保留历史决策，并按 `commentId + contentRevision + 当前策略版本 + 当前关键词版本` 幂等；重复请求返回首次决策，不重复改变最终状态。AI 审核在留言创建后异步执行，结果只追加 `stage=ai` 审计决策，不直接改变 `comments.moderation_status`；人工审核始终拥有最终权威。AI provider 故障、超时、预算耗尽、熔断或结构化响应非法时统一记录 `unknown + review` 的 fail-closed 决策，地图/媒体主链路继续可用。

### AI provider 管理与异步审核

管理接口要求登录会话、`admin.moderation.ai.manage` 权限和写操作 CSRF；响应永不返回 `secretRef`、密钥明文、请求头或 provider 原始响应。

| 方法 | 路径 | 权限 | 说明 |
| --- | --- | --- | --- |
| `GET` | `/api/v1/admin/moderation/providers` | `admin.moderation.ai.manage` | 返回 provider 脱敏目录、启用状态、默认项、配置/熔断状态 |
| `POST` | `/api/v1/admin/moderation/providers` | `admin.moderation.ai.manage` + CSRF | 新增或配置 provider；`id`、`endpoint` 必填，`secretRef` 首次配置必填 |
| `PUT` | `/api/v1/admin/moderation/providers` | `admin.moderation.ai.manage` + CSRF | 更新 provider；可省略 `secretRef`，服务端保留已有引用 |
| `POST` | `/api/v1/admin/moderation/providers/:id/verify` | `admin.moderation.ai.manage` + CSRF | 使用服务端 adapter 做无留言健康检查；通过后才可启用或设为默认 |
| `POST` | `/api/v1/admin/moderation/providers/:id/default` | `admin.moderation.ai.manage` + CSRF | 将最近验证且已启用的 provider 设为默认 |

配置只接受服务端注册的 `adapterId`（当前为 `openai-compatible`）；浏览器不能提交函数、请求头或密钥明文。新 provider 默认保持未验证/不可用，必须先调用 `verify`；未通过验证的 provider 不能成为默认项。`endpoint` 只允许 HTTPS，拒绝凭据、localhost、内网/环回、link-local、metadata、文档保留地址和未在 allowlist 中的主机；实际请求会重新解析 DNS、固定公开地址并拒绝重定向。provider 请求有独立并发槽位、每日预算、每次重试独立计费和熔断；引擎强制超时，即使适配器忽略 `AbortSignal` 也会释放槽位。留言正文在外发前脱敏邮箱、手机号、IP、会话令牌和内部 ID。

执行默认值为 `timeoutMs=3000`、`maxAttempts=2`、`maxConcurrency=2`。`dailyBudget` 为正整数时表示每日硬上限；`dailyBudget=0` 表示不设每日上限（不是立即耗尽），仍受并发、超时和熔断约束。最近一次健康验证默认有效 24 小时，可由 `MAP_SERVICE_AI_PROVIDER_VERIFICATION_TTL_MS` 调整，超过 TTL 的 provider 会自动降为 `unknown`、禁用并清除默认指针。

更新 endpoint、`secretRef`、`adapterId`、model、promptVersion、timeout、maxAttempts、dailyBudget、maxConcurrency 或 redaction 后，服务端会清除验证状态、禁用 provider 并要求重新调用 `verify`；只有重新验证成功后才允许启用或设为默认。`verify` 只发送健康探针，不发送真实留言。

AI 响应必须严格匹配 `shared/interaction-ai.js` 的 schema：受控 `level`、六类 0-1 分数（`spam`、`toxicity`、`violence`、`sexual`、`illegalOrIp`、`privacy`）、`confidence`、受控 `reasonCodes`、`suggestedAction` 和 `policyVersion`。`unknown` 与 `illegal_or_ip` 不得自动通过；低置信度的 `approve` 会降级为 `review`。原始 JSON 仅在不超过 64KB 时以交互密文保存，默认保留 30 天，过期后由运维清理 helper 删除；管理投影只返回 `rawResultAvailable` 和 `rawResultExpiresAt`。

举报管理接口为 `GET /api/v1/admin/reports`、`GET /api/v1/admin/reports/:id` 和 `POST /api/v1/admin/reports/:id/actions`，分别要求 `admin.report.read`、`admin.report.read` 和 `admin.report.manage`。列表只返回脱敏投影；详情在授权后台返回举报说明、证据文本和掩码联系方式。`hide_media`/`hide_comment` 在受控治理能力接入前会明确拒绝，不伪造成功；`block_share`/`pause_share` 会调用分享治理并写审计。`info` facade 只返回来源标题/说明、固定协议路径、举报开关和支持类型，不返回 canonical share、所有者、邮箱、内部快照或管理字段。

交互保留与清理使用 `config.staticService.interaction`，默认数据库为 `.db/interaction.sqlite`。可通过以下环境变量调整窗口：`MAP_SERVICE_INTERACTION_PUBLIC_RETENTION_DAYS`、`MAP_SERVICE_INTERACTION_PRIVATE_RETENTION_DAYS`、`MAP_SERVICE_INTERACTION_CONTACT_RETENTION_DAYS`、`MAP_SERVICE_INTERACTION_AI_RETENTION_DAYS`、`MAP_SERVICE_INTERACTION_REPORT_RETENTION_DAYS`、`MAP_SERVICE_INTERACTION_REPORT_EVENTS_RETENTION_DAYS`、`MAP_SERVICE_INTERACTION_OUTBOX_RETENTION_DAYS`。服务启动时注册 `service/bin/cronJob/interactionRetention.js`，按 Asia/Shanghai 每日 03:20 执行事务清理；`legal_hold=1` 的留言和举报不删除。

稳定错误码包括 `CONTENT_TOO_LARGE`、`UNSAFE_TEXT`、`CURSOR_INVALID`、`IDEMPOTENCY_KEY_INVALID`、`RESOURCE_NOT_FOUND`、`DUPLICATE_REQUEST` 和 `INTERACTION_SERVICE_UNAVAILABLE`；错误响应继续使用本文统一 `jsonSuc/jsonErr` 结构。

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
  "username": "map-root",
  "password": "replace-with-a-long-unique-password"
}
```

登录成功后写入统一用户会话 Cookie和 CSRF Cookie，响应只返回用户摘要与过期时间，不返回会话 Token 或 CSRF Token。

### `POST /api/v1/admin/auth/logout`

校验 Cookie 会话和 `X-CSRF-Token`，撤销当前会话并清除 Cookie。

### `POST /api/v1/admin/auth/password`

修改管理员密码。

```json
{
  "currentPassword": "old-password",
  "newPassword": "new-password"
}
```

### `GET /api/v1/admin/session`

校验当前 Cookie 会话。任意拥有 `admin.*` 权限或 `system.super_admin` 的角色均可进入后台；返回用户、角色、权限和会话摘要。`GET /api/v1/admin/auth/session` 提供相同的新用户体系会话视图。

### `GET /api/v1/admin/system`

返回应用版本、Node.js 版本、进程号、运行时间、环境、服务器时间和 API 基础路径，并包含用户系统健康摘要：

- `userSystem.database.status`：数据库可用状态。
- `userSystem.database.schemaVersion`：最近迁移版本。
- `userSystem.database.allocatedBytes`：SQLite 已分配空间。
- `userSystem.counts`：用户、活跃会话、KML、收藏、分享和有效分享数量。
- `userSystem.storage.kmlBytes`：KML 内容逻辑用量。

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

URL 模板只允许不含账号密码的 `http/https`，且不允许指向 localhost、单标签/内部域名、内网、link-local、云 metadata、IPv4-mapped IPv6 或其他保留地址。配置保存时先校验协议、主机名和字面地址；每次实际回源前会解析全部 DNS 地址，任一结果落入禁止网段即拒绝。直连请求只使用本次已验证地址；代理请求也只把已验证 IP 交给代理连接，同时保留原 HTTP `Host` 与 HTTPS SNI/证书主机名，不允许代理重新解析原目标域名。所有回源均不跟随 3xx 重定向，避免 DNS 重绑定或跳转绕过。支持占位符：`{s}`、`{x}`、`{y}`、`{z}`、`{scale}`、`{yTms}`、`{key}`、`{token}`、`{tk}`、`{appid}`、`{quadkey}`、`{fontstack}`、`{range}` 等。

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

代理出口的 `testUrl` 与图源回源共用同一安全边界：只允许不含账号密码的 `http/https` 目标，不允许 URL 直接填写 localhost、内网、link-local、metadata 或保留地址，也不会跟随重定向。直连和远程代理仍由服务端解析全部 DNS 结果、拒绝混合或受限地址并固定已验证 IP，同时保留原 HTTP `Host`、HTTPS SNI 和证书主机名。

当出口明确为 `localhost`、`127.0.0.0/8` 或 `::1` 上的受控 HTTP/HTTPS 代理时，系统把公开域名的解析交给该本机代理，兼容 Clash/Mihomo Fake-IP 和运营商 DNS 污染环境；服务端不会先用受污染的系统 DNS 把域名固定到错误地址。本机代理是管理员明确配置的可信解析与出口边界，仅用于受控图源和代理诊断，公开请求不能选择任意代理或提交任意回源 URL。显式内网 URL、内部域名、远程代理和直连仍保持原有 SSRF 拒绝规则。

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

### `GET /api/v1/kml/media?url=<encoded-url>`

获取固定旧图片下载地址的兼容响应。该接口不是任意 URL 代理，仅接受完整 URL 编码后的
`https://down-files.2bulu.com/f/dn1?downParams=...`；其他协议、主机、端口、路径和查询参数一律拒绝。

鉴权方式：继承前台地图访问控制。未启用访问密码时可直接访问；启用后必须携带有效的
`map_access_token` Cookie。

请求示例：

```http
GET /api/v1/kml/media?url=https%3A%2F%2Fdown-files.2bulu.com%2Ff%2Fdn1%3FdownParams%3Dopaque-value
```

成功响应为图片二进制流，不使用 `jsonSuc` 包装。响应保留受控的 `Content-Type`、
`Content-Length`、`ETag` 等上游缓存字段，并增加 `X-Cache`。服务端只接受不超过 20 MB、
带有效 `Content-Length` 的 `image/*` 响应。

错误状态：

| HTTP 状态 | 场景 |
| --- | --- |
| `400` | 缺少 `url` 参数 |
| `401` | 地图访问控制已启用但 Cookie 无效 |
| `403` | URL 未命中固定主机/路径，或 DNS 解析到不允许的地址 |
| `413` | 图片超过 20 MB |
| `415` | 上游响应不是 `image/*` |
| `502` | DNS 解析失败、上游不可用或未提供有效文件大小 |

错误响应继续使用项目统一结构，示例：

```json
{
  "code": -1,
  "result": null,
  "error": {
    "message": "媒体 URL 不在兼容白名单内"
  }
}
```

### `GET /api/v1/kml/shared`

获取已发布的公共 KML 列表。

### `GET /api/v1/kml/shared/:id`

获取已发布的公共 KML 详情。

### `GET /api/v1/kml/shared/:id/features/:featureId/content`

获取已发布公共 KML 单个点位的富媒体内容视图。接口继承前台访问控制；如果地图访问密码已启用，必须先通过访问验证。

第一阶段解析点位 `description` 中的 HTTPS 文本链接，以及 `img`、`picture/source`、`video/source`、`audio/source`、`iframe`、`embed`、`object` 和 `a` 标签中的 URL，不做任意 URL 代理、截图、转码或上传。图片、视频、音频、iframe 和普通链接按规则分组返回；原始 HTML 不会直接返回给渲染组件。媒体标签中的无扩展名 URL 按标签语义分类；`embed` / `object` 可通过 `type="video/*"`、视频扩展名或点位 `styleUrl` 的 `MarkerStyleVideo` 提示归入视频组。普通 iframe 默认拒绝，只在服务端 `MAP_SERVICE_KML_IFRAME_ALLOWLIST` 配置命中时作为 `iframe` 类型返回；已内置 provider（当前为抖音和 720 云）的官方播放器还必须通过精确 origin、path、资源 ID 和查询参数校验。其他地址均降级为普通链接。固定旧图片地址可能额外返回同源 `renderUrl`，仅用于兼容加载，原始 `url` 保持不变。

前端交互契约：

- 地图点位 popup 首次打开时直接返回并展示当前点位的最多 4 个受控媒体缩略项/类型卡片；超过 4 项时最后一格作为可点击的“其余媒体”入口，popup 不创建原始视频、音频或 iframe 播放器。无真实名称时不显示标题，无文字描述时不输出重复的媒体提示，媒体区只显示数量。
- 点击任意媒体项后，前端以当前 KML 详情中的全部 `image`、`video`、`audio`、`iframe` 项建立临时浏览集合，保留所点击项为起始位置。该集合只使用已返回的展示元数据，媒体轨道缩略图按需加载。
- 预览器支持 `上一项`、`下一项`、方向键、首尾循环、媒体轨道定位、`收缩为小窗` 和 `展开媒体预览`。每次切换都会同步激活所属点位 popup，关闭预览后保留最后一项媒体对应的点位状态；不再提供重复的点位跳转按钮。小窗状态不锁定页面滚动，关闭时释放视频/音频/iframe 和图片手势资源。
- 桌面全屏预览的 header/footer 默认透明度为 0.3，hover 或 focus-within 时恢复为 1；移动端隐藏完整 header/footer，只保留主要媒体交互入口。
- 详情面板仍只负责完整文字、坐标、图层来源和按类型内容清单；它不是进入媒体预览的前置步骤。
- 视频 URL 按浏览器原生能力播放；普通 `<video>` 资源默认不自动播放，`embed` / `object` 识别为视频后进入预览即尝试自动播放；`.m3u8` 在浏览器不支持原生 HLS 时按需加载 `hls.js`，自动播放失败时按浏览器策略静音重试。iframe 继续使用服务端返回的 `embedPolicy`、sandbox 和 `referrerPolicy`，并放入与预览舞台同色的居中壳层。内置 provider 可以为 `renderUrl` 增加受控的视口适配参数，但 `url` 和 KML 持久化地址保持稳定且不增加任意查询参数；720 云使用规范化的官方 `/vr/` 或 `/t/` 地址直接加载，不回源抓取作品数据。
- 个人 KML 的普通 iframe 本地解析使用构建期 `VITE_MAP_SERVICE_KML_IFRAME_ALLOWLIST`；公共 KML 接口使用服务端 `MAP_SERVICE_KML_IFRAME_ALLOWLIST`。生产环境应配置相同规则，任一侧未命中时均不得把普通页面提升为 iframe。内置平台播放器使用前后端共享的精确 provider 规则，不依赖宽泛域名白名单。

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
            "renderUrl": "https://cdn.example.com/site-a/front.webp",
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
        "type": "audio",
        "title": "音频",
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
      "audioCount": 0,
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
| `groups[].type` | 内容分组类型：`image` / `video` / `audio` / `iframe` / `link` |
| `groups[].items[].sourceType` | 普通描述链接为 `description-link`；受控平台播放器为 `description-share-embed` |
| `groups[].items[].url` | 已脱敏后的 HTTPS URL；敏感查询参数会替换为 `****` |
| `groups[].items[].renderUrl` | 前端实际媒体加载地址；通常与 `url` 相同，固定旧图片地址会使用 `/api/v1/kml/media`，受控平台播放器可增加 provider 固定的视口适配参数 |
| `groups[].items[].embedPolicy` | iframe 内容的 sandbox、referrer policy、媒体权限和全屏策略；非 iframe 为 `null` |
| `groups[].items[].provider` / `resourceId` | 受控第三方播放器的 provider 和稳定资源 ID；当前 provider 为 `douyin`、`720yun`，720 云资源 ID 形如 `vr:<ID>` 或 `t:<ID>`；普通内容不返回 |
| `groups[].items[].sourceUrl` / `canonicalUrl` | 受控播放器的规范化来源地址和稳定详情地址；不会返回上游追踪参数 |
| `groups[].items[].autoplay` | 视频类型固定为 `true`，进入统一预览器时优先带声音自动播放，浏览器阻止时静音重试 |
| `contentSummary` | 点位内容数量摘要，包括 `imageCount`、`videoCount`、`audioCount`、`iframeCount`、`linkCount` 和 `hasRichContent` |
| `sourceSummary.truncated` | 描述中 URL 超过解析上限时为 `true` |
| `rejected` | 因协议、主机安全策略等被拒绝的 URL 摘要 |

登录用户在点位录入阶段解析需要服务端展开的分享短链的接口见 [用户体系与多 KML 分享 API：KML 点位第三方分享链接解析](./api-user-system.md#32-kml-点位第三方分享链接解析)；720 云和已含资源 ID 的抖音地址在浏览器本地完成 provider 校验与转换。

KML Point 的 `name` 可为空；空名称不会在地图、详情或媒体预览中生成占位标题。可选 `markerIcon` 只接受项目内置枚举，导出时写入 `ExtendedData/Data name="map-service:marker-icon"`；未填写时按 provider、媒体类型和主题默认样式自动识别。具体枚举、空名称展示和导入导出规则见 [KML 点位 720 云内容与可配置图标](./requirements/kml-720yun-and-marker-icons.md) 与 [KML 导入导出](./requirements/kml-import-export.md)。

Point 还可以携带 `resourceCollection` 资源集合扩展，用于在一个地理点管理最多 300 个图片、视频、音频、页面或自动识别资源。标准 KML 使用 `ExtendedData/Data name="map-service:resource-collection"` 往返保存；集合浏览采用每页 40 项的列表/卡片面板，未打开集合时不会把资源 URL 展开到文件级媒体画廊或地图 DOM。集合 URL 必须为 HTTPS，禁止 URL 凭据及 `token`、`access_token`、`password`、`signature`、`api_key`、`authorization` 等敏感查询参数；普通视图参数（如 720 云 `scene_id`）保留。创建或更新收到非法集合返回 `400 VALIDATION_FAILED`，KML 导入遇到非法或未知版本集合则保留 Point 并在响应 `warnings` 中报告，公开分享读取会再次剔除历史脏数据。

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
