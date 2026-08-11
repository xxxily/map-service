# 用户体系与多 KML 分享 API

> 状态：已实现，验收中  
> 基础路径：`/api/v1`  
> 对应需求：[用户体系、角色权限、个人空间与多 KML 分享需求](./requirements/user-system-rbac-and-multi-kml-sharing.md)、[KML 点位第三方分享链接识别与嵌入预览](./requirements/kml-point-share-link-embed.md)、[两步路授权浏览器助手与浏览器内导入](./requirements/2bulu-authorized-browser-helper.md)、[两步路公开分享轨迹导入](./requirements/2bulu-public-track-import.md)；用户操作见 [KML 点位分享链接媒体使用说明](./user-guides/kml-share-link-media.md) 和 [两步路导入助手用户操作手册](./user-guides/two-bulu-import.md)

本文记录统一用户认证、RBAC、个人 KML、位置收藏、多 KML 分享和后台治理接口。通用地图、图源、公共 KML和站点访问接口继续参见 [API 参考](./api.md)。

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

登录成功后写入两个同源 Cookie；注册接口不自动登录：

- `map_user_session`：不透明会话令牌，`HttpOnly`，服务端只保存哈希。
- `map_csrf_token`：前端可读的 CSRF Token。

所有非 `GET`、`HEAD`、`OPTIONS` 的登录态写请求必须同时满足：

1. 携带 `map_user_session` Cookie。
2. 请求头 `X-CSRF-Token` 的值与 `map_csrf_token` Cookie一致。

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

登录、管理后台登录和自助注册在尚无会话 CSRF Token 时执行同源来源校验。浏览器提供 `Sec-Fetch-Site` 时优先使用 Fetch Metadata：`same-origin` 允许，`same-site` 和 `cross-site` 返回 `403 CSRF_INVALID`；旧浏览器或受控客户端未提供该头时，再严格比对 `Origin` 或 `Referer` 与当前站点。该优先级可兼容本机浏览器扩展把回环地址 `Origin` 的非默认端口错误移除的情况，同时不接受浏览器明确标记的跨站或同站跨源请求。不携带浏览器来源头的受控 CLI/服务端客户端保持兼容，但仍受认证限流约束。

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
| `GET` | `/auth/config` | 无 | 获取注册开关和密码规则 |
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
      "coordinates": [116.3974, 39.9093]
    }
  ]
}
```

字段规则：

- `type` 只支持 `Point`、`LineString`、`Polygon`。
- 坐标统一为 WGS84 `[longitude, latitude]`；Polygon 外环会自动闭合。
- `coordCorrection`：`none` 或 `wgs84-to-gcj02`。
- `theme`：`default` 或 `simple`。
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

账号地图端的恢复约定：

- 每次进入待保存状态时，客户端立即按用户 ID 保存恢复草稿；草稿包含工作文件、服务端快照、普通删除意图、尚未确认创建项的 `deletedClientIds` 墓碑、已发出但尚未确认结果的 `pendingOperations` 精确批次和递增代次。
- 新批次调用同步接口前，客户端必须先保存 `pendingOperations` 并等待 IndexedDB 完整草稿写入成功；写入失败时不得发送请求。成功响应先清空在途批次再归并结果；明确收到 HTTP 错误时批次事务未提交，应清空在途批次；网络中断等没有 HTTP 状态的错误保留原批次，后续同步优先原样重放，再计算用户在请求期间产生的后续修改。
- 页面恢复 pending `trash` / `restore` 时，客户端通过草稿 `clientId` 或快照的 `serverId -> localId` 找回目标，以草稿 `files` 判断用户最新的存在性意图，并保留原快照后再重放。服务器 active 清单只提供当前服务端视图，不能把用户在请求期间已经 undo 的文件删掉，也不能把已经 redo 删除的文件重新加入。处理其他 revision 冲突时，已选择加载服务器版本或另存副本的冲突项旧 update 不再重放，其余非冲突在途操作继续保留。
- 浏览器只在 IndexedDB 保存完整草稿；`localStorage` 同步保存轻量代次元数据和删除墓碑，避免大 KML 每次编辑都阻塞主线程。旧版本已写入的完整 `localStorage` 草稿仍可读取并迁移。
- 如果轻量元数据的代次高于 IndexedDB 中的完整草稿，说明最后一次异步写入可能被浏览器终止；客户端回退到最近完整草稿、沿用更高代次继续写入，并在恢复对话框明确提示最后一批修改可能未完整落盘。
- 页面隐藏、`pagehide` 和会话失效时必须先保存当前账号草稿，再清理账号内存状态或切回访客数据。
- 2D/3D 都必须在初始账号加载和恢复对话框之前绑定会话失效监听；恢复请求发生 401 时立即保存草稿、挂起账号同步并切回访客数据，不再继续使用已加载的私有数据。其他恢复异常使用统一 Dialog 提示，保留已加载服务器版本并继续地图初始化。
- `409 KML_REVISION_CONFLICT` 后自动同步暂停，不得自动覆盖或无限重试。用户可加载服务器冲突版本、把本地冲突版本另存为非默认 KML，或保留草稿稍后处理。
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

导入当前支持标准 `.kml` 的 Point、LineString、Polygon，并拒绝 DOCTYPE/ENTITY。暂不支持 KMZ、MultiGeometry 和完整 KML 样式体系。

### 3.2 KML 点位第三方分享链接解析

`POST /api/v1/kml/share-links/resolve` 用于把点位描述中需要服务端展开的受支持短链解析为 provider 元数据。当前首期支持抖音 `v.douyin.com` 短链；已经包含视频 ID 的抖音详情页由前端本地转换，不必调用此接口。接口不会返回视频文件，也不会作为通用 URL 代理。

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
  "helperVersion": "0.3.4",
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

浏览器助手 `0.3.4` 在扩展内部增加 `importSessionId` 和二阶段 `COMPLETE_2BULU_IMPORT` 标签页确认，但这两个字段不属于本 HTTP API，也不得提交给服务端。前端只在本接口明确保存成功后通知扩展：扩展校验原发起标签页后激活 map-service，并安全关闭自己管理的未固定两步路临时页；保存失败或无法自动关闭时由两步路页面结果卡片提供手动返回/关闭操作。
- 相同用户、规范化轨迹和 `requestId` 重放时返回原文档，`importSummary.completeness=existing`，不会再次创建文件或占用配额。

成功响应：

```json
{
  "code": 0,
  "result": {
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
      "idempotent": false,
      "helperVersion": "0.3.4",
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
| `PUT` | `/kml/shares/:id` | `share.own.manage` | 编辑文件、顺序、显隐和视图 |
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
- `password` 省略表示保持现状，空字符串或 `null` 表示移除密码。
- 非空分享密码采用独立访问口令规则，长度为 4～128 位；不沿用账号密码的 12 位和常见密码限制，但仍仅保存安全哈希并受独立尝试限流保护。
- active 分享删除到没有有效文件时会自动暂停。
- `revoked` 不可恢复；`blocked` 只能由管理员解封。

### 5.2 公开访问接口

| 方法 | 路径 | 鉴权 | 说明 |
| --- | --- | --- | --- |
| `GET` | `/public/kml-shares/:publicId` | 分享状态、站点策略、可选分享 Cookie | 获取脱敏清单 |
| `POST` | `/public/kml-shares/:publicId/access` | 可选站点访问 | 验证分享密码并写入 HttpOnly Cookie |
| `GET` | `/public/kml-shares/:publicId/files/:shareItemId` | 同上 | 获取一个只读 KML |
| `GET` | `/public/kml-shares/:publicId/files/:shareItemId/export` | 同上且允许下载 | 下载 KML |
| `GET` | `/public/kml-shares/:publicId/map/catalog` | 同上 | 获取分享页可用的脱敏底图目录 |
| `GET` | `/public/kml-shares/:publicId/tiles/:sourceId/:z/:x/:y` | 同上 | 读取分享目录内受控栅格瓦片 |

密码请求：

```json
{ "password": "optional-share-password" }
```

成功后写入路径受限的 `map_share_access_<publicId>` HttpOnly Cookie，响应不返回授权 Token。

公开清单使用分享项 ID `shareItemId` 引用文件，不返回所有者邮箱、内部用户 ID、内部 KML ID、密码哈希、管理备注或代理凭据。分享 scoped catalog 当前只包含后台已发布、前台可见且受控的栅格图源；任意 URL、未公开图源和矢量图源不会通过分享接口暴露。

公开查看页在取得各分享文件后直接使用响应中的脱敏要素进行只读渲染，不再调用传统公共 KML 的内容接口。2D 和 3D 均展示完整要素列表并复用常规 KML 的定位、信息窗口、详情和媒体预览交互；不提供新增、编辑、拖拽或删除。首屏对 `visibleByDefault=true` 且加载成功的文件计算联合几何范围并自动适配，只有没有有效点、线、面时才使用 `viewConfig.center` / `viewConfig.zoom` 兜底。

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
    "accessTtlMs": 43200000
  }
}
```

`registration.mode` 只支持 `open`、`closed`。注册默认角色必须包含 `user` 且不能包含管理权限。`publicAccessPolicy` 支持：

- `inherit_site_access`：分享页继承全站访问密码。
- `independent`：分享授权独立于全站访问密码。

### 6.5 分享治理与审计

| 方法 | 路径 | 权限 | 说明 |
| --- | --- | --- | --- |
| `GET` | `/admin/kml/shares` | `admin.share.moderate` | 按用户、状态、搜索条件分页查看分享 |
| `POST` | `/admin/kml/shares/:id/block` | `admin.share.moderate` | 封禁并记录原因 |
| `POST` | `/admin/kml/shares/:id/unblock` | `admin.share.moderate` | 解封后进入 paused，由所有者决定恢复 |
| `GET` | `/admin/audit-logs` | `admin.audit.read` | 分页查询脱敏审计日志 |

封禁请求：

```json
{ "reason": "包含不符合公开分享规范的内容" }
```

审计和治理列表不会返回密码、Token、Cookie、CSRF、会话哈希、请求认证头或代理凭据。

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
| `410` | `SHARE_PAUSED` / `SHARE_EXPIRED` | 分享暂停或过期 |
| `413` | `FILE_TOO_LARGE` | KML 文件或请求超过限制 |
| `429` | `RATE_LIMITED` | 登录、注册或分享密码尝试过多 |
| `500` | `INTERNAL_ERROR` | 未预期服务端错误，响应已脱敏 |

## 8. 当前实施边界

- 登录、注册和分享密码限流为单进程内存状态；多实例部署需接入共享限流存储。
- SQLite 适用于当前单机部署；多写实例需要独立评估数据库和会话架构。
- KML 导入不支持 KMZ、MultiGeometry 和完整样式体系。
- 回收站保留天数已进入设置和数据模型，但超期异步清理任务尚未实现。
- 超级管理员跨用户 KML 归属转移尚未提供管理接口。
- 分享页底图 catalog 当前只开放受控公开栅格图源。
- 数据库迁移前的自动备份尚未内置，生产升级必须由运维流程先完成一致性备份。
