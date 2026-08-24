# 用户体系与多 KML 分享 API

> 状态：已实现，验收中  
> 基础路径：`/api/v1`  
> 对应需求：[用户体系、角色权限、个人空间与多 KML 分享需求](./requirements/user-system-rbac-and-multi-kml-sharing.md)、[KML 分享空间访问控制与半公开地图需求](./requirements/kml-share-spatial-access-and-semi-public-map.md)、[KML 分享发布控制与地图交互性能需求](./requirements/kml-share-publishing-and-map-interaction.md)、[KML 性能优化与资源集合点位](./requirements/kml-performance-and-resource-collections.md)、[SidePanel 嵌入式 KML 双屏编辑需求](./requirements/sidepanel-embedded-kml-editing.md)、[KML 点位第三方分享链接识别与嵌入预览](./requirements/kml-point-share-link-embed.md)、[KML 点位 720 云内容与可配置图标](./requirements/kml-720yun-and-marker-icons.md)、[KML 要素组织与受控 URL 参数保留](./requirements/kml-feature-organization-and-url-preservation.md)、[两步路授权浏览器助手与浏览器内导入](./requirements/2bulu-authorized-browser-helper.md)、[两步路公开分享轨迹导入](./requirements/2bulu-public-track-import.md)；用户操作见 [SidePanel 双屏 KML 编辑使用说明](./user-guides/sidepanel-kml-editing.md)、[KML 点位分享链接媒体使用说明](./user-guides/kml-share-link-media.md)、[KML 要素整理使用说明](./user-guides/kml-feature-organization.md)、[资源集合使用说明](./user-guides/kml-resource-collections.md)、[两步路导入助手用户操作手册](./user-guides/two-bulu-import.md) 和 [KML 空间受限分享使用说明](./user-guides/kml-spatial-sharing.md)

本文记录统一用户认证、RBAC、个人 KML、位置收藏、多 KML 分享和后台治理接口。通用地图、图源、公共 KML和站点访问接口继续参见 [API 参考](./api.md)。交互能力的部署、初始化、接入和恢复步骤见 [交互功能部署与接入手册](./interaction-deployment-and-integration.md)。

留言、审核和举报使用独立 `interaction.sqlite` 与 Interaction Adapter。留言/审核/策略/关键词、举报和来源信息服务及对应公开和管理路由已接入，AI provider 管理与异步审核也已纳入 Phase 3；详见 [API 参考中的交互契约](./api.md#交互领域契约-phase-1bc)。

## 1. 通用约定

### 1.1 响应结构

成功响应：

```json
{
  "code": 0,
  "result": {},
  "error": null
}
```

错误响应：

```json
{
  "code": -1,
  "result": null,
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "请求数据不正确"
  }
}
```

未预期的服务端错误统一返回 `INTERNAL_ERROR` 和“服务器处理请求失败”，不会返回 SQL、文件路径、Token、哈希或调用栈。

### 1.2 Cookie 会话与 CSRF

普通标签页登录成功后写入两个同源 Cookie；注册接口不自动登录：

- `map_user_session`：不透明会话令牌，`HttpOnly`，服务端只保存哈希。
- `map_csrf_token`：前端可读的 CSRF Token。

当 map-service 被 SidePanel 类扩展页面嵌入时，登录请求携带 `X-Map-Embed-Context: iframe`，服务端额外写入 `map_user_session_embed` 和 `map_csrf_token_embed`。两者使用 `SameSite=None; Secure; Partitioned; Priority=High`，其中会话 Cookie 仍为 `HttpOnly`。嵌入请求优先使用分区 Cookie，普通标签页继续优先使用原 Cookie；API 响应不返回任何 Token 明文。

如果嵌入分区会话已经撤销或过期、但浏览器仍发送旧的分区 Cookie，服务端会在响应中仅清理该分区的会话和 CSRF Cookie，不会清理普通标签页会话。前端收到 `403 CSRF_INVALID` 后会刷新认证上下文，并对可重放的 JSON 写请求最多重试一次；重试会重新读取当前 CSRF Cookie，仍失败则保留原错误。该兼容流程不接受任意来源或任意 Token，也不关闭 CSRF 校验。

所有非 `GET`、`HEAD`、`OPTIONS` 的登录态写请求必须同时满足：

1. 携带当前上下文对应的会话 Cookie。
2. 请求头 `X-CSRF-Token` 的值与当前上下文对应的 CSRF Cookie 一致。

浏览器请求示例：

```js
await fetch('/api/v1/kml/files', {
  method: 'POST',
  credentials: 'same-origin',
  headers: {
    'Content-Type': 'application/json',
    'X-CSRF-Token': readCookie('map_csrf_token'),
  },
  body: JSON.stringify({ name: '现场记录' }),
})
```

用户会话、站点访问 Cookie `map_access_token` 和分享密码授权 Cookie `map_share_access_<publicId>` 是三套独立授权，不得互相替代。

登录、管理后台登录和自助注册在尚无会话 CSRF Token 时执行来源校验。普通页面仍优先使用 Fetch Metadata：`same-origin` 允许，`same-site` 和 `cross-site` 返回 `403 CSRF_INVALID`；旧浏览器或受控客户端缺失该头时，再严格比对 `Origin` 或 `Referer`。SidePanel iframe 的请求可能被标记为 `cross-site`，只有携带嵌入上下文头且 `Origin` / `Referer` 仍与当前 map-service 来源完全一致时才允许；攻击者来源即使伪造嵌入头仍被拒绝。不携带浏览器来源头的受控 CLI/服务端客户端保持兼容，但仍受认证限流约束。

### 1.3 权限规则

内置角色：

| 角色 | 说明 |
| --- | --- |
| `user` | 管理自己的账号、会话、KML、收藏和分享 |
| `admin` | 在普通用户能力上增加日常地图运维、公共 KML、缓存、预缓存、分享治理和审计 |
| `super_admin` | 拥有全部业务权限，包括用户、角色、注册和安全策略管理 |

服务端最终按权限码授权，不按角色名硬编码。自定义角色只要拥有相应 `admin.*` 权限即可进入后台；`system.super_admin` 可通过全部业务权限检查。

完整权限码：

```text
account.self.read
account.self.update
session.self.manage
kml.own.read
kml.own.write
share.own.manage
favorite.own.manage
admin.overview.read
admin.cache.manage
admin.precache.manage
admin.layer.manage
admin.public_kml.manage
admin.share.moderate
admin.audit.read
admin.user.read
admin.user.manage
admin.role.manage
admin.registration.manage
admin.security.manage
admin.comment.read
admin.comment.moderate
admin.comment.policy.manage
admin.moderation.ai.manage
admin.moderation.keyword.manage
admin.report.read
admin.report.manage
kml.any.read
kml.any.manage
system.super_admin
```

权限蕴含规则：

- `account.self.update` 同时允许读取自己的资料。
- `kml.own.write` 同时允许读取自己的 KML。
- `kml.any.manage` 同时允许读取任意用户 KML。
- 只具备 `kml.own.read` 的账号在 2D、3D 和用户中心均为只读模式，不显示或执行新建、导入、编辑、拖动、轨迹写入、删除、撤销重做等操作；账号数据不会回退写入访客 `localStorage`。

### 1.4 分页与时间

- 通用分页参数：`page` 默认 `1`，`limit` 默认 `20`、最大 `100`。
- 时间均为 ISO 8601 UTC 字符串。
- URL 中使用稳定 ID，例如 `usr_*`、`ses_*`、`kml_*`、`fav_*`、`shr_*`；显示名不作为主键。
- 私有资源不存在或不属于当前用户时统一按 `404 RESOURCE_NOT_FOUND` 处理，避免枚举其他用户数据。

## 2. 认证、资料与会话

### 2.1 接口目录

| 方法 | 路径 | 鉴权 | 说明 |
| --- | --- | --- | --- |
| `GET` | `/auth/config` | 无 | 获取注册开关、账号密码规则和公开分享能力开关及空间瓦片上限 |
| `POST` | `/auth/register` | 无 | 自助注册；注册关闭时拒绝 |
| `POST` | `/auth/login` | 无 | 用户登录 |
| `POST` | `/auth/logout` | 会话 + CSRF | 注销当前会话 |
| `GET` | `/auth/session` | 可选会话 | 获取当前会话摘要 |
| `POST` | `/auth/reauth` | 会话 + CSRF | 高风险操作前重新验证密码 |
| `POST` | `/auth/password` | 会话 + CSRF | 修改当前账号密码 |
| `GET` | `/auth/sessions` | `session.self.manage` | 列出活跃会话 |
| `DELETE` | `/auth/sessions/:id` | `session.self.manage` + CSRF | 注销指定个人会话 |
| `POST` | `/auth/logout-all` | `session.self.manage` + CSRF | 注销全部或其他会话 |
| `GET` | `/users/me` | `account.self.read` | 获取个人资料 |
| `PUT` | `/users/me` | `account.self.update` + CSRF | 修改显示名和邮箱 |

注册请求：

```json
{
  "username": "map-user",
  "displayName": "地图用户",
  "email": "user@example.com",
  "password": "a-long-unique-passphrase",
  "remember": true
}
```

公开配置响应包含管理员控制的分享能力开关：

```json
{
  "registration": { "enabled": false },
  "passwordPolicy": { "minLength": 12, "maxLength": 128 },
  "share": {
    "passwordlessSharingEnabled": false,
    "spatialUnrestrictedTileMaxZoom": 14
  }
}
```

`share.passwordlessSharingEnabled=false` 时，前端不提供“不设置密码”或“移除密码”，服务端也会独立拒绝无密码分享请求。

字段通过校验且未触发限流时，注册接口统一返回 `202 Accepted`：

```json
{
  "status": "accepted"
}
```

为避免枚举已有用户名，新账号创建成功和用户名已存在使用相同状态码、响应体且都不写入会话 Cookie。调用者随后使用登录接口验证账号；注册尝试按 IP、规范化用户名和组合维度限流，成功请求也计入额度。

登录失败同时计入共享 IP、规范化账号和 IP + 账号组合桶。成功登录只清理该账号桶和对应组合桶，保留共享 IP 桶，避免同一出口下的攻击者使用自己的合法账号反复重置密码喷洒计数。最近再验证和修改密码使用独立的密码验证限流器，并遵循相同的共享 IP 桶保留规则。

登录请求：

```json
{
  "username": "map-user",
  "password": "a-long-unique-passphrase",
  "remember": false
}
```

登录成功结果不会包含 Token：

```json
{
  "user": {
    "id": "usr_xxx",
    "username": "map-user",
    "displayName": "地图用户",
    "roles": ["user"],
    "permissions": ["account.self.read", "kml.own.read"],
    "mustChangePassword": false
  },
  "expiresAt": "2026-08-12T00:00:00.000Z"
}
```

修改密码请求：

```json
{
  "currentPassword": "old-password",
  "newPassword": "new-long-unique-passphrase"
}
```

如果账号由管理员使用临时密码创建或重置，`mustChangePassword=true`；修改密码前只允许读取账号和管理个人会话，其余业务接口返回 `PASSWORD_CHANGE_REQUIRED`。

高风险操作如轮换分享链接、修改安全设置、重置密码和调整角色，可能返回 `REAUTH_REQUIRED`。客户端应调用 `/auth/reauth` 后重试原请求。

## 3. 个人 KML

### 3.1 接口目录

| 方法 | 路径 | 权限 | 说明 |
| --- | --- | --- | --- |
| `GET` | `/kml/files` | `kml.own.read` | 列表和配额用量 |
| `POST` | `/kml/files` | `kml.own.write` | 新建 KML |
| `GET` | `/kml/files/:id` | `kml.own.read` | 获取详情和 features |
| `PUT` | `/kml/files/:id` | `kml.own.write` | 按 revision 更新 |
| `DELETE` | `/kml/files/:id` | `kml.own.write` | 移入回收站 |
| `POST` | `/kml/files/:id/restore` | `kml.own.write` | 从回收站恢复 |
| `DELETE` | `/kml/files/:id/permanent` | `kml.own.write` | 永久删除回收站文件 |
| `POST` | `/kml/import` | `kml.own.write` | `multipart/form-data` 导入 KML |
| `POST` | `/kml/share-links/resolve` | `kml.own.write`、`kml.any.manage` 或 `admin.public_kml.manage` | 解析受支持的第三方分享短链 |
| `POST` | `/kml/import/2bulu/browser-helper` | `kml.own.write` | 保存授权浏览器助手取得的标准 KML；网站使用此接口 |
| `POST` | `/kml/import/2bulu` | `kml.own.write` | 服务端直连兼容接口，保留给未来官方 API provider |
| `GET` | `/kml/files/:id/export` | `kml.own.read` | 下载标准 KML 文本 |
| `POST` | `/kml/sync` | `kml.own.write` | 地图编辑器增量批量同步 |
| `POST` | `/kml/migrations/local` | `kml.own.write` | 幂等迁移浏览器本地 KML |

列表参数：

- `status`：`active`、`trashed`、`all`，默认 `active`。
- `search`：匹配名称和描述。
- `sort`：`name`、`createdAt`、`updatedAt`，默认 `updatedAt`。
- `order`：`asc`、`desc`，默认 `desc`。
- `page`、`limit`：通用分页。

KML 写入模型：

```json
{
  "name": "巡检路线",
  "description": "路线说明",
  "revision": 3,
  "isDefault": false,
  "coordCorrection": "wgs84-to-gcj02",
  "theme": "default",
  "color": "#0f766e",
  "lockDrag": false,
  "enabled": true,
  "isLiveTrack": false,
  "features": [
    {
      "id": "feat_gate",
      "type": "Point",
      "name": "入口",
      "description": "现场入口",
      "markerIcon": "viewpoint",
      "coordinates": [116.3974, 39.9093]
    },
    {
      "id": "feat_scene",
      "type": "Point",
      "name": "观景台",
      "description": "",
      "markerIcon": "collection",
      "coordinates": [116.3980, 39.9098],
      "resourceCollection": {
        "version": 1,
        "viewMode": "grid",
        "items": [
          {
            "id": "res_1",
            "title": "夜景视角",
            "url": "https://www.720yun.com/t/demo?scene_id=4279442",
            "type": "iframe"
          }
        ]
      }
    }
  ]
}
```

字段规则：

- `type` 只支持 `Point`、`LineString`、`Polygon`。
- `features` 数组顺序就是管理面板、导出和分享中的要素顺序；文件内拖拽排序只调整数组位置，不新增排序字段。
- 坐标统一为 WGS84 `[longitude, latitude]`；Polygon 外环会自动闭合。
- `coordCorrection`：`none` 或 `wgs84-to-gcj02`。
- `theme`：`default` 或 `simple`。
- 两步路浏览器助手（`0.3.6`及以上）创建的 KML 默认写入 `theme=simple`，仅显示点位图标；这是导入初始显示策略，用户仍可通过 KML 更新接口切换为 `default`。
- `description` 保存 KML 文档级信息介绍；两步路助手会将分享页可确认的总里程、运动耗时和原作者写入其中，服务端解析后再追加规范化来源链接并执行富文本清洗。
- Point 可选 `markerIcon`，只接受 `pin`、`star`、`flag`、`viewpoint`、`camera`、`campsite`、`food`、`lodging`、`parking`、`warning`、`heart`、`home`、`water`、`restroom`、`hospital`、`shop`、`charging`、`bus`、`train`、`bicycle`、`hiking`、`summit`、`waterfall`；缺省表示自动识别内容。`auto` 仅为前端选择器选项，不写入 JSON/KML；LineString、Polygon 的该字段会被忽略或拒绝。
- 标准 KML 通过 Placemark 下的 `ExtendedData/Data name="map-service:marker-icon"` 往返保存 `markerIcon`。未知枚举不导入，服务端 JSON 写入收到未知值返回 `400 VALIDATION_FAILED`；不会读取远程图标 URL。
- Point 可选 `resourceCollection`，字段为 `version`、`viewMode` 和最多 300 个资源项；资源项 `id`、`title`、`url`、`type` 的长度、类型和总序列化大小由服务端统一校验。标准 KML 使用 `ExtendedData/Data name="map-service:resource-collection"` 保存。
- 集合 URL 仅接受 HTTPS；禁止 URL 用户名/密码以及 `token`、`access_token`、`password`、`signature`、`api_key`、`authorization` 等敏感查询参数，普通视图参数（如 `scene_id`、`view`）完整保留。接口统一返回 `400 VALIDATION_FAILED` 和对应中文字段消息；共享模型内部使用 `RESOURCE_COLLECTION_URL_CREDENTIALS`、`RESOURCE_COLLECTION_URL_SENSITIVE_QUERY` 区分校验分支。
- 未知集合版本或导入时非法集合不会阻断整份 KML：Point 几何保留、集合扩展忽略，并在导入响应的 `warnings` 数组返回中文提示；服务端写入接口不会保存未知结构。公开分享读取还会再次过滤历史脏数据中的非法集合。
- 集合浏览由独立的分页面板承载，默认每页 40 项；地图点位和文件级媒体画廊不会预先展开集合资源，点击资源后才进入统一媒体预览器。
- 更新可携带当前 `revision`；版本不一致返回 `409 KML_REVISION_CONFLICT`，不会静默覆盖。
- 每个用户始终有一个受保护的默认 KML；默认文件不能直接移入回收站或永久删除。

增量同步请求：

```json
{
  "operations": [
    { "action": "create", "clientId": "local-1", "data": { "name": "新文件", "features": [] } },
    { "action": "update", "kmlId": "kml_xxx", "data": { "revision": 2, "name": "新名称" } },
    { "action": "trash", "kmlId": "kml_yyy" },
    { "action": "trash", "clientId": "local-response-lost" },
    { "action": "restore", "kmlId": "kml_zzz" }
  ]
}
```

`create.clientId` 为必填的 1～160 字符稳定标识，只允许 ASCII 字母、数字、点、下划线、冒号和连字符，并在当前用户范围内作为幂等键。客户端必须在网络重试、页面恢复和响应丢失重放时复用原值，不得为同一创建意图重新生成 ID。服务端重复收到相同 `(ownerId, clientId)` 时返回首次创建的 `document`，不会再次校验或占用新增文件配额；如果本地内容在重试前已变化，客户端应先接收原 `document.id/revision`，再发送普通 `update`。

同步创建的私有 `document` 会返回 `syncClientId`，用于页面恢复时把本地 ID 与已提交的服务端文档重新关联。该字段不会出现在匿名分享清单、分享文件或下载内容中。KML 永久删除后，独立幂等账本仍保留原映射；旧 `clientId` 重放返回 `409 KML_CREATE_REPLAY_DELETED`，客户端必须由用户明确操作生成新的 `clientId` 后才能另存副本。

`trash` 正常使用稳定服务端 `kmlId`。若 `create` 已发送但客户端未收到响应，用户随后删除了该本地项，客户端必须发送同一 `clientId` 的 `trash` 操作。服务端按当前用户的持久幂等账本解析并移入回收站；若创建尚未到达，则先持久化用户范围的删除墓碑并返回 `{ "status": "absent" }`，随后乱序到达的同 `clientId` create 返回 `409 KML_CREATE_REPLAY_DELETED`。若对应 KML 已永久删除，同样返回无副作用的 absent，原创建账本继续阻止复活。

已同步文件删除成功后，客户端必须保留状态为 `trashed` 的服务端快照。用户在 2D/3D 中撤销删除时发送带 `kmlId` 的 `restore`，不得复用原 `clientId` 当作新建；恢复响应会返回新的 revision。若删除先于 create 到达并得到 absent，客户端保留无服务端 ID 的 trashed 快照，撤销时先发送带同一 `clientId` 的 `restore` 取消删除墓碑；服务端返回 absent 后客户端再发送原 create。若该 restore 在途时用户又重做删除，客户端收到 absent 后必须重新记录 `clientId` 删除意图并续发 `trash(clientId)`。若撤销后的本地内容与恢复出的服务端内容不同，客户端在下一轮发送带新 revision 的普通 `update`。

同步响应示例：

```json
{
  "results": [
    {
      "action": "create",
      "clientId": "local-1",
      "document": {
        "id": "kml_server_1",
        "syncClientId": "local-1",
        "name": "新文件",
        "revision": 1,
        "features": []
      }
    }
  ],
  "syncedAt": "2026-08-05T10:30:00.000Z"
}
```

整个批次在事务中执行；任一步失败都会回滚。`create` 缺少有效 `clientId` 返回 `400 VALIDATION_FAILED`；更新 revision 过期返回 `409 KML_REVISION_CONFLICT`。客户端应使用响应中的 `document.id` 和 `revision` 更新快照。

地图端移动或复制要素继续复用此同步接口，不新增独立路由：同文件排序产生一个 `update`；跨文件移动产生源文件和目标文件两个 `update`；跨文件复制只更新目标文件。移动保留要素 ID，复制生成新 ID。多文件操作在同一 `operations` 批次提交，因此任一文件 revision 冲突时整个批次回滚并进入既有 KML 草稿恢复流程。

账号地图端的恢复约定：

- 每次进入待保存状态时，客户端立即按用户 ID 保存 v2 恢复草稿；草稿包含工作文件、服务端快照及其完整 `snapshot.base`、普通删除意图、尚未确认创建项的 `deletedClientIds` 墓碑、已发出但尚未确认结果的 `pendingOperations` 精确批次、冲突重试状态和递增代次。旧版 v1 草稿继续可恢复，但缺少完整基线时不进入结构化三方合并。
- 新批次调用同步接口前，客户端必须先保存 `pendingOperations` 并等待 IndexedDB 完整草稿写入成功；写入失败时不得发送请求。成功响应先清空在途批次再归并结果；明确收到 HTTP 错误时批次事务未提交，应清空在途批次；网络中断等没有 HTTP 状态的错误保留原批次，后续同步优先原样重放，再计算用户在请求期间产生的后续修改。
- 页面恢复 pending `trash` / `restore` 时，客户端通过草稿 `clientId` 或快照的 `serverId -> localId` 找回目标，以草稿 `files` 判断用户最新的存在性意图，并保留原快照后再重放。服务器 active 清单只提供当前服务端视图，不能把用户在请求期间已经 undo 的文件删掉，也不能把已经 redo 删除的文件重新加入。处理其他 revision 冲突时，已选择加载服务器版本或另存副本的冲突项旧 update 不再重放，其余非冲突在途操作继续保留。
- 浏览器以 IndexedDB 保存完整草稿；序列化长度不超过 750000 字符的小型草稿会同步保存一份包含完整基线的 localStorage 副本，以覆盖 SidePanel 快速销毁 iframe 时异步写入未完成的情况。更大的草稿只同步保存轻量代次元数据，完整内容仍由 IndexedDB 承担。不得通过裁剪基线、Feature 或资源项压缩草稿；旧版本完整 localStorage 草稿继续兼容。
- 如果轻量元数据的代次高于 IndexedDB 中的完整草稿，说明最后一次异步写入可能被浏览器终止；客户端回退到最近完整草稿、沿用更高代次继续写入，并在恢复对话框明确提示最后一批修改可能未完整落盘。
- 页面隐藏、`pagehide` 和会话失效时必须先保存当前账号草稿，再清理账号内存状态或切回访客数据。
- 2D/3D 都必须在初始账号加载和恢复对话框之前绑定会话失效监听；恢复请求发生 401 时立即保存草稿、挂起账号同步并停止使用已加载的私有数据。普通顶层页面可切回访客数据；嵌入页面必须进入登录门禁且不得加载访客 KML。其他恢复异常使用统一 Dialog 提示，保留已加载服务器版本并继续地图初始化。
- `409 KML_REVISION_CONFLICT` 后，客户端通过现有文件列表和详情接口读取完整服务器版本，以 `snapshot.base / local / server` 执行三方合并。不同字段、不同 Feature、不同资源项以及单边排序变化自动合并；同字段双写、删除与修改、双边不同排序和缺少稳定 ID 才生成逐项冲突。无人工冲突时使用服务器最新 revision 自动重试一次；再次 409 时保存 `retryExhausted` 并等待用户确认，不得无限循环。
- 逐项处理只替换用户选择的冲突项，已经自动合并的内容保持不变。处理期间服务器再次变化时拒绝旧选择并重新计算；用户取消或稍后处理时保留完整草稿。服务器回收站文件选择保留本地时先 restore 再 update；如果该文件还要成为默认 KML，restore 必须单独完成，下一批先提升新默认再取消旧默认。服务器已永久删除时保留本地必须生成新 `clientId` 创建副本，不能更新旧 ID。
- 默认 KML 作为账号级唯一状态合并，任一合并或人工选择结果最终最多保留一个有效默认文件。
- `create` 响应丢失后若用户删除本地项，客户端不得因缺少服务端快照而清空草稿；必须保留 `clientId` 删除墓碑，直至服务端确认已移入回收站或该创建从未提交。
- 已确认的 `trash` 不得删除客户端快照，而应把快照标为 `trashed`；本地文件重新出现时生成按 `kmlId` 或 `clientId` 的 `restore`，本地仍不存在时不重复发送删除。取消墓碑的 `restore(clientId)` 返回 absent 后，应以响应到达时的工作文件为准：文件仍存在则续发 create，文件已被重做删除则续发 `trash(clientId)`。恢复或取消墓碑后若仍有操作，客户端自动继续下一轮同步，无需用户再次编辑触发。
- 重新登录同一用户检测到未完成草稿时，可恢复草稿、全部另存为新 KML 或丢弃；草稿不得跨用户读取。
- 冲突处理期间服务器新增或未被本地修改的文件使用当前服务器快照，只有真实冲突项保留旧 revision 基线，避免把服务器文件误判为本地新建或修改。

本地迁移请求必须带稳定 `batchId`，网络重试相同批次不会重复创建数据：

```json
{
  "batchId": "device-a-20260805-001",
  "files": [
    { "clientId": "default-kml", "name": "浏览器默认标注", "isDefault": true, "features": [] }
  ]
}
```

导入当前支持标准 `.kml` 的 Point、LineString、Polygon，并读取 KML `Document` 级 `name` 与经清洗的 `description`；Point 中合法的 `map-service:marker-icon` 也会保留。请求未显式覆盖介绍时沿用文件介绍，后续服务端或地图端导出会继续写回。接口拒绝 DOCTYPE/ENTITY，暂不支持 KMZ、MultiGeometry 和完整 KML 样式体系。

### 3.2 KML 点位第三方分享链接解析

`POST /api/v1/kml/share-links/resolve` 用于把点位描述中需要服务端展开的受支持短链解析为 provider 元数据。当前服务端解析接口处理抖音 `v.douyin.com` 短链；已经包含视频 ID 的抖音地址和 720 云 `/vr/<ID>`、`/t/<ID>` 地址由共享 provider 在浏览器本地转换，不必调用此接口。接口不会返回视频/全景文件，也不会作为通用 URL 代理。

鉴权：当前用户 Cookie 会话、CSRF，并拥有 `kml.own.write`、`kml.any.manage` 或 `admin.public_kml.manage` 之一。

请求：

```http
POST /api/v1/kml/share-links/resolve
Content-Type: application/json
X-CSRF-Token: <map_csrf_token>
```

```json
{
  "text": "8.74 复制打开抖音…… https://v.douyin.com/Xi6sjYn-rps/"
}
```

成功响应：

```json
{
  "code": 0,
  "result": {
    "items": [
      {
        "provider": "douyin",
        "providerLabel": "抖音",
        "mediaType": "iframe",
        "resourceId": "7645601561687440101",
        "title": "抖音视频",
        "sourceUrl": "https://v.douyin.com/Xi6sjYn-rps/",
        "canonicalUrl": "https://www.douyin.com/video/7645601561687440101",
        "embedUrl": "https://open.douyin.com/player/video?vid=7645601561687440101"
      }
    ],
    "warnings": []
  },
  "error": null
}
```

`text` 最大 100000 字符，单次最多处理 10 个受支持链接。重复视频只返回一个 `items` 项。短链读取最多 3 次重定向、单次请求 5 秒、整批 10 秒；重定向只允许抖音官方域名。部分短链失败时仍返回 `200`，失败原因放入 `warnings`，前端应保存原始描述并提示用户。返回结果不会包含上游 Cookie、响应正文、追踪参数、内部 DNS 地址或请求头。

720 云本地转换示例：`https://www.720yun.com/vr/f4ejtOsf5y0` 生成 `provider=720yun`、`resourceId=vr:f4ejtOsf5y0`、`embedUrl=https://www.720yun.com/vr/f4ejtOsf5y0`；`/t/` 使用 `t:<ID>`，两种命名空间不互相推导。查询参数和片段不会写入持久化地址。

常见错误：

| HTTP | 错误码 | 说明 |
| --- | --- | --- |
| `400` | `VALIDATION_FAILED` | 文本为空或超长 |
| `401` | `AUTH_REQUIRED` | 未登录 |
| `403` | `CSRF_INVALID` / `PERMISSION_DENIED` | 请求来源、CSRF 或 KML 写权限失败 |
| `413` | `SHARE_LINK_LIMIT_EXCEEDED` | 受支持链接超过 10 个 |
| `429` | `SHARE_LINK_RATE_LIMITED` | 当前账号解析过于频繁 |

成功解析结果由前端写入带 `data-kml-share-*` 标记的 iframe。再次编辑时这些机器标记会被隐藏，用户删除源链接后对应 iframe 也会被移除。公开分享查看端只消费已保存的官方播放器地址。

### 3.3 从两步路公开分享链接导入（服务端直连兼容接口）

`POST /api/v1/kml/import/2bulu` 使用当前用户会话、CSRF 和 `kml.own.write` 权限。接口只接受 `www.2bulu.com`、`2bulu.com`、`app.2bulu.com` 的 HTTPS 分享页，并在服务端重新校验 DNS、重定向、响应大小、超时和 KML/JSON 内容；不会接受调用方提供的 Cookie、代理、认证头或任意下载地址。公开标注媒体仅保留 `down-files.2bulu.com` 的固定 HTTPS 端点及唯一非空 `downParams` 定位参数，含额外 Token、签名、验证码参数或非标准端口的 URL 会被丢弃。

该接口因两步路 SafeLine WAF 可能返回 `468`，当前网站不再直接调用；保留它用于兼容和未来可验证的官方 API provider。用户界面使用下一节浏览器助手接口。

请求示例：

```json
{
  "url": "https://www.2bulu.com/track/t-OavTTmw9VMzp%252FR2KBg5Tzw%253D%253D.htm",
  "coordCorrection": "wgs84-to-gcj02",
  "partialPolicy": "reject",
  "requestId": "2bulu-6c2d6a2d-2fc5-4e55-a193-d93c6ef10bf5"
}
```

字段规则：

- `url` 必填，长度 1～2048；支持短链页、`track_detail.htm` 和 `share_track.htm`，分享标识最多执行两次 URL 解码。
- `coordCorrection` 可选：`wgs84-to-gcj02`（默认）或 `none`。坐标仍以 WGS84 保存，纠偏只影响地图显示。
- `partialPolicy` 可选：`reject`（默认）或 `allow-track-only`。后者只在用户明确接受无法确认标注点/媒体完整性时允许创建。
- `requestId` 可选，为当前用户范围内 1～120 位 ASCII 稳定 ID；相同请求重放返回已创建文档，不重复占用配额或读取上游。官方前端会在当前浏览器会话内为相同 URL 与选项保留该 ID，只有确认成功后才释放，以覆盖响应丢失后的人工重试。幂等重放的 `importSummary.completeness` 为 `existing`，表示本次未重新解析上游。

成功响应中的 `result` 是完整个人 KML 文档，并附带：

```json
{
  "id": "kml_xxx",
  "name": "两步路公开轨迹",
  "featureCount": 3,
  "revision": 1,
  "features": [],
  "importSummary": {
    "provider": "2bulu",
    "sourceUrl": "https://www.2bulu.com/track/track_detail.htm?trackId=xxx",
    "completeness": "full",
    "warnings": [],
    "idempotent": false
  }
}
```

`completeness` 为 `full`、`track-only` 或幂等重放时的 `existing`。上游要求登录/验证码、返回 WAF/人机页面、签名或加密响应时，接口返回稳定错误并提示用户先在两步路导出 KML，再使用普通文件导入；系统不会保存两步路账号、Cookie 或验证码，也不会绕过上游保护。

错误码：

| HTTP | 错误码 | 说明 |
| --- | --- | --- |
| `400` | `TWO_BULU_URL_INVALID` | URL、主机、路径或分享标识不合法 |
| `401` | `AUTH_REQUIRED` | 未登录 |
| `403` | `PERMISSION_DENIED` | 没有个人 KML 写权限 |
| `409` | `TWO_BULU_IMPORT_IN_PROGRESS` | 当前用户已有导入任务执行中 |
| `413` | `FILE_TOO_LARGE` | 上游响应、坐标数量或生成内容超过限制 |
| `422` | `TWO_BULU_PARTIAL_REJECTED` | 只能取得轨迹线且未显式允许部分导入 |
| `422` | `TWO_BULU_LOGIN_REQUIRED` | 上游要求登录或验证码 |
| `422` | `TWO_BULU_TRACK_EMPTY` | 未找到有效点、线或面 |
| `429` | `TWO_BULU_RATE_LIMITED` | 用户触发导入频率限制 |
| `502` | `TWO_BULU_UPSTREAM_BLOCKED` / `TWO_BULU_UPSTREAM_INVALID` | WAF、人机校验、加密响应或意外内容 |
| `504` | `TWO_BULU_TIMEOUT` | 上游读取超时 |

前端账号中心和 2D 地图 KML 面板都复用同一字段和 Dialog。未登录或只有 `kml.own.read` 的用户不显示入口；即使手工调用接口也不会触发两步路外部请求。地图端成功后会登记服务端文档同步快照并自动适配导入要素范围，避免增量同步再次创建副本。

### 3.4 保存两步路授权浏览器助手取得的 KML

```http
POST /api/v1/kml/import/2bulu/browser-helper
Content-Type: application/json
```

鉴权：当前用户 Cookie 会话、CSRF、`kml.own.write`。扩展只负责在用户浏览器中取得最终标准 KML；服务端不接收两步路 Cookie、账号密码、验证码、Authorization、代理或上游请求头，并对 URL 与 KML 正文重新校验。

请求示例：

```json
{
  "protocolVersion": 1,
  "helperVersion": "0.3.6",
  "url": "https://www.2bulu.com/track/t-OavTTmw9VMzp%252FR2KBg5Tzw%253D%253D.htm",
  "kmlText": "<?xml version=\"1.0\"?><kml xmlns=\"http://www.opengis.net/kml/2.2\">...</kml>",
  "sourceMode": "rendered-data",
  "completeness": "full",
  "warnings": [],
  "coordCorrection": "wgs84-to-gcj02",
  "partialPolicy": "reject",
  "requestId": "2bulu-helper-6c2d6a2d-2fc5-4e55-a193-d93c6ef10bf5"
}
```

字段规则：

- `protocolVersion` 必填且当前只能为整数 `1`。
- `helperVersion` 必填，为 1～32 位 ASCII 字母、数字、点、下划线或连字符。
- `url` 必填，按 3.3 的两步路官方 HTTPS 分享 URL 规则重新规范化；不信任客户端声称的最终来源 URL。
- `kmlText` 必填，UTF-8 最大 10 MiB；服务端复用标准 KML 解析、DOCTYPE/ENTITY 拒绝、富文本清洗、坐标、要素和用户配额校验。
- `sourceMode` 为 `official-kml` 或 `rendered-data`；`completeness` 为 `full` 或 `track-only`；`warnings` 最多 10 项、每项最多 300 字符。0.3.x 助手会提交这些字段，服务端执行枚举和长度规范化；兼容旧版助手时省略字段分别按 `official-kml`、`full` 和空数组处理。
- `coordCorrection`、`partialPolicy`、`requestId` 与 3.3 相同；当 `completeness=track-only` 时必须同时提交 `partialPolicy=allow-track-only`，否则返回 `422 TWO_BULU_PARTIAL_REJECTED`。浏览器助手在页面已展示轨迹但标注接口不可用时才会产生 `track-only`。

浏览器助手 `0.3.4+` 在扩展内部使用 `importSessionId` 和二阶段 `COMPLETE_2BULU_IMPORT` 标签页确认；`0.3.5` 支持多线段合并、重复图层去重和可信点位名称；`0.3.6` 增加分享页总里程、运动耗时、原作者提取，并将其写入 KML 文档级 `description`。这些字段和显示策略不属于本 HTTP API；`importSessionId` 也不得提交给服务端。前端只在本接口明确保存成功后通知扩展：扩展校验原发起标签页后激活 map-service，并安全关闭自己管理的未固定两步路临时页；保存失败或无法自动关闭时由两步路页面结果卡片提供手动返回/关闭操作。

- 相同用户、规范化轨迹和 `requestId` 重放时返回原文档，`importSummary.completeness=existing`，不会再次创建文件或占用配额。

成功响应：

```json
{
  "code": 0,
  "result": {
    "id": "kml_xxx",
    "name": "两步路公开轨迹",
    "description": "<p><strong>总里程：</strong>12.34 km</p><p><strong>运动耗时：</strong>06:05:04</p><p><strong>作者：</strong>山友阿明</p><p>来源：<a href=\"https://www.2bulu.com/track/track_detail.htm?trackId=xxx\">两步路公开分享轨迹</a></p>",
    "theme": "simple",
    "featureCount": 3,
    "revision": 1,
    "features": [],
    "importSummary": {
      "provider": "2bulu",
      "sourceUrl": "https://www.2bulu.com/track/track_detail.htm?trackId=xxx",
      "completeness": "full",
      "warnings": [],
      "idempotent": false,
      "helperVersion": "0.3.6",
      "sourceMode": "rendered-data"
    }
  }
}
```

错误码：

| HTTP | 错误码 | 说明 |
| --- | --- | --- |
| `400` | `TWO_BULU_URL_INVALID` / `VALIDATION_FAILED` | URL、协议版本、助手版本、请求 ID 或选项非法 |
| `400` | `KML_PARSE_FAILED` / `KML_UNSAFE_XML` | 正文不是标准 KML，或包含外部实体声明 |
| `401` | `AUTH_REQUIRED` | 未登录 |
| `403` | `CSRF_INVALID` / `PERMISSION_DENIED` | CSRF 或个人 KML 写权限失败 |
| `409` | `KML_CREATE_REPLAY_DELETED` | 对应幂等创建已被永久删除 |
| `413` | `FILE_TOO_LARGE` | KML 正文超过 10 MiB 或单文件配额 |
| `422` | `TWO_BULU_TRACK_EMPTY` / `TWO_BULU_PARTIAL_REJECTED` / `QUOTA_EXCEEDED` | 没有有效点、线、面、未显式允许仅轨迹导入，或要素/用户配额不足 |

账号中心和 2D 地图只有在登录写用户收到扩展协议 `PONG` 后才渲染入口。地图保存成功后先登记账号同步快照，再更新本地列表并适配全部导入要素范围。

## 4. 位置收藏

| 方法 | 路径 | 权限 | 说明 |
| --- | --- | --- | --- |
| `GET` | `/favorites` | `favorite.own.manage` | 列表、搜索、过滤和排序 |
| `POST` | `/favorites` | `favorite.own.manage` | 新建收藏 |
| `GET` | `/favorites/:id` | `favorite.own.manage` | 获取详情 |
| `PUT` | `/favorites/:id` | `favorite.own.manage` | 更新收藏 |
| `DELETE` | `/favorites/:id` | `favorite.own.manage` | 删除收藏 |

列表参数：

- `search`：匹配名称、备注、地址、分类和标签。
- `category`、`tag`、`sourceType`：精确过滤。
- `sort`：`name`、`createdAt`、`updatedAt`。
- `order`：`asc`、`desc`。
- `page`、`limit`：通用分页。

写入示例：

```json
{
  "name": "集合点",
  "note": "北门旁",
  "longitude": 116.3974,
  "latitude": 39.9093,
  "sourceType": "map",
  "sourceRef": "map-center",
  "address": "北京市东城区",
  "category": "工作",
  "tags": ["巡检", "集合"],
  "color": "#2563eb"
}
```

`sourceType` 支持 `search`、`map`、`location`、`kml`、`manual`。坐标始终保存为 WGS84；标签最多 20 个，单个标签最长 30 字符。

## 5. 多 KML 分享

### 5.1 所有者接口

| 方法 | 路径 | 权限 | 说明 |
| --- | --- | --- | --- |
| `GET` | `/kml/shares` | `share.own.manage` | 分享包列表 |
| `POST` | `/kml/shares` | `share.own.manage` | 创建分享包 |
| `GET` | `/kml/shares/:id` | `share.own.manage` | 获取完整配置 |
| `GET` | `/kml/shares/:id/access-events` | `share.own.manage` | 获取自己的最近聚合访问记录 |
| `POST` | `/kml/shares/:id/password-url` | `share.own.manage` | 获取当前分享密码并生成带密码参数的链接（仅所有者） |
| `PUT` | `/kml/shares/:id` | `share.own.manage` | 编辑文件、顺序、显隐和视图 |
| `DELETE` | `/kml/shares/:id` | `share.own.manage` | 永久删除自己的分享及其访问数据，不影响原始 KML |
| `POST` | `/kml/shares/:id/sync` | `share.own.manage` | 发布当前 KML 内容快照并重新计算分享范围 |
| `POST` | `/kml/shares/:id/pause` | `share.own.manage` | 暂停分享 |
| `POST` | `/kml/shares/:id/resume` | `share.own.manage` | 恢复分享 |
| `POST` | `/kml/shares/:id/rotate-link` | `share.own.manage` + 最近再验证 | 生成新 publicId，旧链接立即失效 |
| `POST` | `/kml/shares/:id/revoke` | `share.own.manage` | 永久撤销 |

列表参数：`status`、`search`、`page`、`limit`。`status` 支持 `draft`、`active`、`paused`、`revoked`、`blocked`、`expired`。

创建或更新示例：

```json
{
  "title": "周末徒步路线合集",
  "description": "三条路线，可分别显示隐藏",
  "status": "active",
  "password": "optional-share-password",
  "allowDownload": true,
  "expiresAt": "2026-12-31T16:00:00.000Z",
  "spatialAccess": { "mode": "kml_bounds", "unrestrictedTileMaxZoom": 8 },
  "passwordAccess": { "ttlMode": "unlimited" },
  "analytics": { "mode": "provider", "websiteId": "573277f7-4747-4871-abf4-24406a67707e" },
  "viewConfig": {
    "center": [30.2741, 120.1551],
    "zoom": 11,
    "bearing": 0,
    "pitch": 0,
    "layerId": "amap-hybrid",
    "mapMode": "2d",
    "showOwnerDisplayName": false
  },
  "items": [
    { "kmlId": "kml_a", "position": 0, "visibleByDefault": true, "displayName": "主路线" },
    { "kmlId": "kml_b", "position": 1, "visibleByDefault": false, "displayName": "备用路线" }
  ],
  "revision": 2
}
```

约束：

- 每个分享包包含 1～20 个归属当前用户且处于 active 状态的 KML；实际上限可由后台下调。
- `publicId` 是不可枚举的稳定链接标识，内部 `id` 和 KML ID不会暴露给公开清单。
- 更新时可携带 `revision`；冲突返回 `SHARE_REVISION_CONFLICT`。
- 分享公开内容使用已发布快照。个人 KML 修改不会自动改变公开链接；所有者视图返回 `syncStatus`、`pendingSyncItemCount`，分享项返回 `sourceRevision`、`publishedRevision`、`syncStatus` 和 `publishedAt`。
- `password` 省略表示保持现状，空字符串或 `null` 表示移除密码。
- 创建后最终没有密码，或更新后最终移除密码时，后台必须开启 `share.passwordlessSharingEnabled`；否则返回 `422 SHARE_PASSWORDLESS_DISABLED`。管理员关闭后，无密码分享不能继续保存、同步内容或轮换为新链接，测试分享应删除或设置密码后重建，不提供旧行为兼容分支。
- `expiresAt=null` 表示分享链接没有固定到期时间，与是否设置密码独立；管理员允许时，无密码分享同样可使用 `expiresAt=null`。
- `spatialAccess.mode` 支持 `unrestricted` 和 `kml_bounds`；省略时创建默认为 `unrestricted`，更新时保持现状。`kml_bounds` 的范围、面积和对角线只能由服务端根据分享内 active KML 计算。
- `kml_bounds` 的权威范围是全部 KML 有效坐标形成的轴对齐外包矩形，并在四边扩展管理员余量；最外层点位或线段之间的矩形内部全部可查看，不再按点位周边或几何缓冲联合区域授权。
- `spatialAccess.unrestrictedTileMaxZoom` 可选，基础取值为 `0～24` 的整数，且不得高于管理员配置的 `share.spatialUnrestrictedTileMaxZoom`（默认 `14`）；该值可以高于当前分享计算出的 `minZoom`。`z <=` 该值时范围外低缩放瓦片以 `allow_unrestricted` 受控回源，`z >` 该值时继续执行外包矩形限制。省略或为 `null` 表示严格模式。该字段只影响底图瓦片，不扩大 KML 内容、媒体或相机中心的可访问范围。
- `passwordAccess.ttlMode` 支持 `finite` 和 `unlimited`；无密码时公开视图为 `not_applicable`。`unlimited` 仅在空间受限、范围合规且后台允许时可用，服务端保存时会重新计算，不信任前端预检。
- 非空分享密码采用独立访问口令规则，长度为 4～128 位；不沿用账号密码的 12 位和常见密码限制。服务端保存用于访问校验的安全哈希，并另存仅供所有者主动复制的 AES-256-GCM 密文；密文不进入普通接口、日志和审计元数据。
- 浏览器密码生成器默认生成 12 位，可选 8、12、16、20、24、32 位，并可关闭特殊字符。启用特殊字符时只使用 `!$*+@`，排除 `?`、`&`、`#`、`%`、`=` 等查询分隔符；服务端生成带密码链接时仍必须使用 `encodeURIComponent`。
- `analytics.mode` 支持 `none`、`provider` 和经超级管理员授权的 `custom`。默认 provider 模式只提交网站 ID，脚本来源由管理员固定；公开清单只返回服务端校验后的 descriptor。
- `password-url` 不要求所有者再次输入密码。服务端使用稳定密钥加密保存分享密码，普通读取接口不返回该字段；仅所有者主动调用时在 `no-store` 响应中返回 `shareUrl` 和 `password`。当前没有正式用户，不为缺少密码密文的旧测试分享保留兼容流程；直接删除并重新创建分享。
- 源 KML 修改、几何重算失败、公开读取异常或暂时没有可计算几何时，active 分享不会自动暂停，也不会丢失分享设置或已发布快照。只有用户显式暂停、管理员封禁或用户撤销会停止分享；到期单独按 `expired` 处理。
- 更新分享不允许保存空 `items`；没有可用已发布项目时，恢复和同步返回 `409 SHARE_EMPTY`，但不隐式改写分享状态。用户不再需要链接时使用 DELETE。
- DELETE 成功后会删除分享行以及级联的 `kml_share_items`、`share_access_sessions`、`share_access_events`，并清理内存运行指标；不会删除 `kml_documents`。旧 `publicId` 立即返回 `404 RESOURCE_NOT_FOUND`。
- `revoked` 不可恢复；`blocked` 只能由管理员解封。

内容同步请求：

```json
{ "revision": 4 }
```

服务端在同一事务内更新全部分享项快照、内容版本和空间范围。若 revision 冲突或新范围不符合当前空间访问策略，接口失败且旧公开快照保持可用；成功响应返回更新后的分享详情。公开 manifest、分享文件和导出只读取已发布快照，不暴露源 KML revision 或待同步状态。

### 5.2 公开访问接口

| 方法 | 路径 | 鉴权 | 说明 |
| --- | --- | --- | --- |
| `GET` | `/public/kml-shares/:publicId` | 分享状态、站点策略、可选分享 Cookie | 获取脱敏清单 |
| `POST` | `/public/kml-shares/:publicId/access` | 可选站点访问 | 验证分享密码并写入 HttpOnly Cookie |
| `GET` | `/public/kml-shares/:publicId/files/:shareItemId` | 同上 | 获取一个只读 KML |
| `GET` | `/public/kml-shares/:publicId/files/:shareItemId/export` | 同上且允许下载 | 下载 KML |
| `GET` | `/public/kml-shares/:publicId/map/catalog` | 同上 | 获取分享页可用的脱敏底图目录 |
| `GET` | `/public/kml-shares/:publicId/tiles/:sourceId/:z/:x/:y` | 同上 | 读取分享目录内受控栅格瓦片 |

分享页面 `GET /share/:publicId` 会在首个 HTML 响应中按分享设置的 `title`、`description` 生成页面标题和社交元信息。响应包含 `description`、`keywords`、`author`、`application-name`、`robots`、`theme-color`、Canonical、`image_src`、Open Graph、Twitter Card、`itemprop` 和 JSON-LD（`WebPage`、`Map`、`WebSite`）字段；Canonical、`og:url` 和 `twitter:url` 只保留不含密码、坐标、图层等查询参数的稳定分享地址。分享标题和说明会按安全文本规则清洗后写入属性，密码、Token、所有者信息和内部 KML 字段不会进入 HTML。分享暂停、撤销、过期、封禁或没有已发布内容时不注入分享专属元信息，继续返回通用应用壳并保持 `noindex, nofollow`。

密码请求：

```json
{ "password": "optional-share-password" }
```

带密码链接访问时可增加 `accessMethod: "password_link"`，仅用于脱敏访问聚合。客户端应在任何地图、媒体或统计脚本初始化前移除 URL 中的 `password` 参数。

成功后写入路径受限的 `map_share_access_<publicId>` HttpOnly Cookie，响应不返回授权 Token。

响应包含 `ttlMode` 和 `expiresAt`：`finite` 使用管理员配置的有限授权时长，`unlimited` 的 `expiresAt` 为 `null` 但仍受分享生命周期、策略版本、密码版本和服务端撤销控制。

公开清单使用分享项 ID `shareItemId` 引用文件，不返回所有者邮箱、内部用户 ID、内部 KML ID、密码哈希、管理备注或代理凭据。分享 scoped catalog 当前只包含后台已发布、前台可见且受控的栅格图源；任意 URL、未公开图源和矢量图源不会通过分享接口暴露。

公开文件 `GET /public/kml-shares/:publicId/files/:shareItemId` 返回的每个 Feature 可能包含交互资源元数据：

```json
{
  "id": "point-one",
  "resourceRefs": {
    "version": 1,
    "featureId": "point-one",
    "media": [
      { "mediaId": "media_<opaque>", "sourceId": "description-link-1", "sourceType": "description-link", "type": "image" }
    ],
    "complete": true
  }
}
```

`resourceRefs.featureId` 保留现有 Feature ID；`mediaId` 是稳定 opaque 标识，不是数组索引，也不包含原始 URL。服务端在分享创建、内容同步和公开读取前校验资源元数据；校验失败返回 `409 PUBLISHED_RESOURCE_REFERENCE_INVALID`（发布边界）或 `503 PUBLISHED_RESOURCE_REFERENCE_INVALID`（公开读取），不会静默修复已存在但不一致的引用。旧快照缺少元数据时只按当前已发布内容兼容派生，分享别名轮换不改变内部资源身份。

公开查看页在取得各分享文件后直接使用响应中的脱敏要素进行只读渲染，不再调用传统公共 KML 的内容接口。2D 和 3D 均展示完整要素列表并复用常规 KML 的定位、信息窗口、详情和媒体预览交互；不提供新增、编辑、拖拽或删除。视口初始化优先使用合法 URL `coords`（空间受限分享还必须位于允许矩形且不低于有效最低缩放；有效最低缩放为 `minZoom` 与放宽阈值中的较小值，未设置放宽时为 `minZoom`）；没有合法 URL `coords` 时，若存在有效的默认可见 KML，则适配其联合几何范围，否则使用分享 `viewConfig.center` / `viewConfig.zoom` 或系统默认视图兜底。图层初始化独立按 URL `layer` → 分享 `viewConfig.layerId` → 默认图层执行。URL 状态非法或越界时安全回退，刷新、2D/3D 路由切换均保留 `coords` 和 `layer`。

空间受限分享的公开清单和 catalog 返回脱敏 `spatialAccess` 摘要，包括固定的 `version: 2`、`geometryType: "BoundingBox"`，以及外包矩形的 `bbox`、`bboxSegments`、`cameraBounds`、`displayGeometry`、`paddingMeters`、`minZoom`、`unrestrictedTileMaxZoom`、`maxCameraHeight`、范围版本和状态；不返回内部投影、`localBounds`、源 revision hash 或管理员阈值。分享瓦片请求会规范化世界环绕 `x`：设置放宽阈值时，`z <= unrestrictedTileMaxZoom` 的范围外低缩放瓦片以 `allow_unrestricted` 直接回源（包括接口主动请求的更低层级），`z > unrestrictedTileMaxZoom` 继续执行外包矩形限制；未设置阈值时，低于 `minZoom` 的瓦片返回透明占位。边界瓦片执行 Alpha 遮罩，并带 `X-Kml-Share-Spatial-Decision` 响应头。前端相机有效最低缩放为 `minZoom` 与放宽阈值中的较小值，但 `maxBounds` 仍由 KML 外包矩形固定，不能移动到不可视区域；所有瓦片仍需经过分享鉴权、受控图源校验和限流。

公开响应中的 `spatialAccess` 结构示例：

```json
{
  "version": 2,
  "geometryType": "BoundingBox",
  "mode": "kml_bounds",
  "status": "ready",
  "cameraBounds": [113.12, 22.95, 113.48, 23.31],
  "minZoom": 11,
  "unrestrictedTileMaxZoom": 8,
  "revision": 4
}
```

空间受限分享加载时强制使用 2D，避免 3D 全球地形或影像链路形成未校验的资源入口。

空间预检：`POST /api/v1/kml/shares/spatial-preview`，需要 `share.own.manage`，请求体为 `{ "items": [{ "kmlId": "kml_a" }], "spatialAccess": { "mode": "kml_bounds", "unrestrictedTileMaxZoom": 8 } }`。响应返回 `status`、`bbox`、`areaKm2`、`diagonalKm`、`paddingMeters`、`minZoom`、`unrestrictedTileMaxZoom`、`spatialAccessEligible`、`unlimitedAccessEligible` 和 `reasonCode`；预检结果不写入分享，创建和更新时服务端会再次计算。

## 6. 管理后台

### 6.1 后台会话

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `POST` | `/admin/auth/login` | 统一用户登录的后台兼容入口；要求账号拥有 `admin.*` 或 `system.super_admin` |
| `POST` | `/admin/auth/logout` | 撤销当前会话并清 Cookie |
| `POST` | `/admin/auth/password` | 修改当前管理员密码 |
| `GET` | `/admin/auth/session` | 新用户体系后台会话视图 |
| `GET` | `/admin/session` | 现有后台页面兼容入口，返回相同权限语义 |

新登录不签发 Bearer Token。后台导航只能作为体验层隐藏入口，所有接口仍由服务端逐项检查权限。

### 6.2 用户管理

| 方法 | 路径 | 权限 |
| --- | --- | --- |
| `GET` | `/admin/users` | `admin.user.read` |
| `POST` | `/admin/users` | `admin.user.manage` |
| `GET` | `/admin/users/:id` | `admin.user.read` |
| `PUT` | `/admin/users/:id` | `admin.user.manage` |
| `PUT` | `/admin/users/:id/roles` | `admin.role.manage` + 超级管理员 + 最近再验证 |
| `POST` | `/admin/users/:id/reset-password` | `admin.user.manage` + 最近再验证 |
| `POST` | `/admin/users/:id/revoke-sessions` | `admin.user.manage` |

用户列表参数：`status`、`search`、`role`、`page`、`limit`。账号状态为 `active`、`disabled`、`locked`、`deleted`。

创建用户：

```json
{
  "username": "operator-a",
  "displayName": "运维 A",
  "email": "",
  "password": "optional-temporary-password",
  "roles": ["user", "operations_observer"],
  "quota": {}
}
```

若省略密码，服务端生成一次性临时密码并只在本次成功响应中返回；数据库只保存哈希。修改状态会撤销目标用户现有会话。不能停用、删除或移除最后一个有效超级管理员。

### 6.3 角色与权限

| 方法 | 路径 | 权限 |
| --- | --- | --- |
| `GET` | `/admin/roles` | `admin.role.manage` |
| `POST` | `/admin/roles` | `admin.role.manage` |
| `PUT` | `/admin/roles/:id` | `admin.role.manage` |
| `DELETE` | `/admin/roles/:id` | `admin.role.manage` |

自定义角色请求：

```json
{
  "code": "operations_observer",
  "name": "运维观察员",
  "description": "只读查看用户和审计",
  "permissions": ["admin.user.read", "admin.audit.read"]
}
```

角色代码为 3～32 位小写字母、数字、点、下划线或短横线。内置角色不可删除，自定义角色不能授予 `system.super_admin`。角色权限变化会提升相关用户的权限版本并撤销旧会话。

### 6.4 用户体系设置

| 方法 | 路径 | 权限 |
| --- | --- | --- |
| `GET` | `/admin/user-system/settings` | `admin.registration.manage` 或 `admin.security.manage` |
| `POST` | `/admin/user-system/settings/impact-preview` | `admin.security.manage`；空间字段还需超级管理员 |
| `PUT` | `/admin/user-system/settings` | 对修改分区分别校验权限，并要求最近再验证 |

设置模型：

```json
{
  "registration": { "mode": "closed", "defaultRoleCodes": ["user"] },
  "session": { "ttlMs": 604800000, "rememberTtlMs": 2592000000, "reauthWindowMs": 600000 },
  "quota": {
    "maxKmlFiles": 100,
    "maxKmlFileBytes": 10485760,
    "maxFeaturesPerKml": 50000,
    "maxFeaturesPerUser": 200000,
    "trashRetentionDays": 30
  },
  "share": {
    "publicAccessPolicy": "inherit_site_access",
    "maxFilesPerShare": 20,
    "accessTtlMs": 43200000,
    "passwordlessSharingEnabled": false,
    "spatialAccessEnabled": true,
    "spatialPaddingMeters": 1000,
    "spatialMaxAreaKm2": 10000,
    "spatialMaxDiagonalKm": 300,
    "spatialUnrestrictedTileMaxZoom": 14,
    "unlimitedAccessEnabled": false,
    "unlimitedAccessMaxAreaKm2": 2000,
    "unlimitedAccessMaxDiagonalKm": 100,
    "spatialPolicyRevision": 1,
    "rateLimit": {
      "enabled": true,
      "windowMs": 60000,
      "tileMaxRequests": 3000,
      "manifestMaxRequests": 300,
      "maxEntries": 10000
    }
  },
  "analytics": {
    "global": {
      "enabled": false,
      "script": null
    },
    "share": {
      "enabled": false,
      "providerScriptUrl": "https://msc.anzz.site/script.js",
      "providerWebsiteIdAttribute": "data-website-id",
      "customScriptEnabled": false
    }
  }
}
```

`registration.mode` 只支持 `open`、`closed`。注册默认角色必须包含 `user` 且不能包含管理权限。`publicAccessPolicy` 支持：

- `inherit_site_access`：分享页继承全站访问密码。
- `independent`：分享授权独立于全站访问密码。

`passwordlessSharingEnabled` 默认为 `false`。关闭时，创建无密码分享、移除密码、继续保存、同步内容或轮换无密码分享链接均返回 `SHARE_PASSWORDLESS_DISABLED`；开启时，无密码分享可设置固定期限或 `expiresAt=null`，但其 `passwordAccess.ttlMode` 始终为 `not_applicable`。

分享限流按“分享 + HttpOnly 匿名访客标识”计数，Cookie 不可用时回退到服务端 IP/UA 摘要。瓦片仅在图源和空间范围校验通过后计数，范围外透明瓦片不消耗正常配额；设置更新后无需重启。

全站统计允许管理员配置受控的 HTTPS 外部脚本；禁止内联脚本、事件属性、非 HTTPS 和带账号密码的 URL。分享统计默认只允许固定 provider + 网站 ID；`customScriptEnabled` 只有超级管理员可以修改。

空间策略影响预览响应包含：

```json
{
  "preview": true,
  "sharePolicyImpact": {
    "affectedShares": 3,
    "downgradedShares": 1,
    "revokedUnlimitedSessions": 2,
    "recalculatedShares": 8
  }
}
```

预览不写入设置。超级管理员在收紧范围阈值、下调 `spatialUnrestrictedTileMaxZoom`、关闭空间受限能力或关闭不限授权前，后台使用统一确认 Dialog 展示这些数量；保存下调上限后，存量分享会自动将已保存的放宽值收敛到新上限。

### 6.5 分享治理与审计

| 方法 | 路径 | 权限 | 说明 |
| --- | --- | --- | --- |
| `GET` | `/admin/kml/shares` | `admin.share.moderate` | 按用户、状态、搜索条件分页查看分享 |
| `GET` | `/admin/kml/shares/runtime-metrics` | `admin.share.moderate` | 查看内存有界的分享瓦片判定、范围拒绝和限流聚合指标 |
| `DELETE` | `/admin/kml/shares/:id` | `admin.share.moderate` | 删除任意分享及其访问数据，不影响原始 KML |
| `POST` | `/admin/kml/shares/:id/block` | `admin.share.moderate` | 封禁并记录原因 |
| `POST` | `/admin/kml/shares/:id/unblock` | `admin.share.moderate` | 解封后进入 paused，由所有者决定恢复 |
| `PUT` | `/admin/kml/shares/:id/analytics` | `admin.share.moderate` | 逐分享禁用或恢复统计脚本 |
| `GET` | `/admin/audit-logs` | `admin.audit.read` | 分页查询脱敏审计日志 |

封禁请求：

```json
{ "reason": "包含不符合公开分享规范的内容" }
```

审计和治理列表不会返回密码、Token、Cookie、CSRF、会话哈希、请求认证头或代理凭据。

所有者访问记录仅保存 15 分钟窗口内的聚合结果，默认保留 30 天。响应包括首次/最近访问时间、聚合次数、`open` / `password_form` / `password_link` / `session` 访问方式、设备大类和来源 Origin；不返回原始 IP、完整 User-Agent、完整 Referer 或查询参数。

运行指标按内部分享 ID、受控图源 ID、事件和空间判定结果聚合，返回计数、首次/最近发生时间，以及空间重算累计/最大耗时。响应同时给出当前空间分享、半公开分享、范围状态和有限/不限授权会话数量快照；不记录来源 IP、`publicId`、Cookie、Token、完整 URL 或瓦片坐标。指标为单进程内存状态，服务重启后清空，多实例部署需接入统一监控系统。

## 7. 常见错误码

| HTTP | 错误码 | 说明 |
| --- | --- | --- |
| `400` | `VALIDATION_FAILED` | 字段、枚举、坐标或请求结构不合法 |
| `400` | `KML_PARSE_FAILED` / `KML_UNSAFE_XML` | KML 格式错误或包含危险实体声明 |
| `401` | `AUTH_REQUIRED` | 未登录或会话失效 |
| `401` | `INVALID_CREDENTIALS` | 用户名或密码错误 |
| `403` | `CSRF_INVALID` | 写请求 CSRF 校验失败 |
| `403` | `PERMISSION_DENIED` | 权限不足 |
| `403` | `PASSWORD_CHANGE_REQUIRED` | 临时密码必须先修改 |
| `403` | `SITE_ACCESS_REQUIRED` | 分享继承站点访问控制且尚未授权 |
| `404` | `RESOURCE_NOT_FOUND` | 资源不存在或不归当前用户 |
| `409` | `KML_REVISION_CONFLICT` | KML 并发版本冲突 |
| `409` | `SHARE_REVISION_CONFLICT` | 分享配置并发版本冲突 |
| `409` | `LAST_SUPER_ADMIN` | 操作会移除最后一个有效超级管理员 |
| `409` | `SHARE_SPATIAL_RECALCULATING` | 空间范围正在重算，暂不能安全访问 |
| `410` | `SHARE_PAUSED` / `SHARE_EXPIRED` | 分享暂停或过期 |
| `409` | `SHARE_EMPTY` | 分享没有可恢复或可发布的有效项目 |
| `410` | `SHARE_SPATIAL_UNAVAILABLE` | 分享地图范围不可安全使用 |
| `400` | `SHARE_SPATIAL_MODE_INVALID` | 空间访问模式不受支持 |
| `400` | `SHARE_PASSWORD_ACCESS_MODE_INVALID` | 密码授权模式不受支持 |
| `400` | `INVALID_TILE_COORDINATES` | 分享瓦片坐标无效 |
| `422` | `SHARE_SPATIAL_DISABLED` / `SHARE_SPATIAL_BOUNDS_EMPTY` | 空间受限分享未开放或没有有效几何 |
| `422` | `SHARE_SPATIAL_RANGE_TOO_LARGE` | 超过空间限制总体阈值 |
| `422` | `SHARE_PASSWORDLESS_DISABLED` | 后台未开放无密码分享，必须设置分享密码 |
| `422` | `SHARE_UNLIMITED_ACCESS_DISABLED` / `SHARE_UNLIMITED_ACCESS_RANGE_TOO_LARGE` | 不限授权未开放或范围超过更严格阈值 |
| `413` | `FILE_TOO_LARGE` | KML 文件或请求超过限制 |
| `429` | `RATE_LIMITED` | 登录、注册或分享密码尝试过多 |
| `429` | `SHARE_MANIFEST_RATE_LIMITED` | 单个分享和匿名访客的公开清单请求过于频繁 |
| `429` | `SHARE_TILE_RATE_LIMITED` | 单个分享和匿名访客的瓦片请求过于频繁 |
| `500` | `INTERNAL_ERROR` | 未预期服务端错误，响应已脱敏 |

## 8. 当前实施边界

### 8.1 交互 API 实施状态（Phase 1B/C）

已实现的留言公开接口为 `GET/POST /api/v1/public/kml-shares/:publicId/comments`、`GET /comments/count` 和 `GET /comments/policy`；公开写入遵循登录 CSRF 或匿名同源校验，提交成功返回 `202`，未审核留言不会出现在列表或计数中。已实现的管理接口为留言列表/详情/审核/按当前策略重新审核/软删除，以及留言策略和关键词规则的读取与发布，分别要求 `admin.comment.read`、`admin.comment.moderate`、`admin.comment.policy.manage` 和 `admin.moderation.keyword.manage`。重新审核保留历史决策，并按留言内容修订和当前策略/关键词版本幂等。

这些接口复用分享访问、站点访问和已发布快照资源授权，统一使用 `jsonSuc/jsonErr` 与 `no-store`，响应脱敏不返回联系方式、密文、内部用户 ID、Token、IP/UA 或审核原始细节。举报公开提交与管理工单已实现：公开接口使用登录 CSRF 或匿名同源校验，管理列表/详情/动作分别要求 `admin.report.read`、`admin.report.read`、`admin.report.manage`；举报正文不进入留言、关键词或 AI 流程。分享 `info` facade 只返回渲染所需来源、协议、管理员统一维护的 `generalDescription` 和举报能力描述；该说明位于交互策略的 `mediaDetails.generalDescription`，必须是字符串，去除首尾空白后最多 1000 个字符。

- 登录、注册和分享密码限流为单进程内存状态；多实例部署需接入共享限流存储。
- SQLite 适用于当前单机部署；多写实例需要独立评估数据库和会话架构。
- KML 导入不支持 KMZ、MultiGeometry 和完整样式体系。
- 回收站保留天数已进入设置和数据模型，但超期异步清理任务尚未实现。
- 超级管理员跨用户 KML 归属转移尚未提供管理接口。
- 分享页底图 catalog 当前只开放受控公开栅格图源。
- 空间受限分享首期仅允许完全包含瓦片回源，边界和范围外瓦片返回透明占位；3D 分享强制回退 2D。
- 管理员空间策略保存前影响预览为同步计算，重算失败时以保守拒绝资源访问处理。
- 数据库迁移前的自动备份尚未内置，生产升级必须由运维流程先完成一致性备份。
