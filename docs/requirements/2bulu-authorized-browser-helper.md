# 两步路授权浏览器助手与浏览器内导入需求

> 状态：第四版已实现，0.3.7 图标增强已完成，待用户手工验收  
> 更新时间：2026-08-11  
> 关联文档：[两步路公开分享轨迹导入](./2bulu-public-track-import.md)、[用户体系、角色权限、个人空间与多 KML 分享](./user-system-rbac-and-multi-kml-sharing.md)、[用户体系 API](../api-user-system.md)、[两步路导入助手用户操作手册](../user-guides/two-bulu-import.md)

## 1. 背景与问题

两步路公开分享页及其下载/轨迹接口会根据请求环境触发 WAF、人机验证、登录或动态签名。map-service 服务端没有用户的两步路登录态，直接读取会出现 `468` 或返回不可解析的验证页面。让服务端代持 Cookie、伪造浏览器指纹、自动答题或绕过验证码既不可维护，也会越过第三方服务的安全边界。

本需求把“读取”动作限定在用户自己的 Chrome 浏览器中：用户可在两步路页面正常完成登录、人机校验和授权。两步路分享页通常不提供标准 KML，扩展以页面已经展示的轨迹数组、地图图层和标注元数据为主要来源，在浏览器内还原标准 KML 后交回 map-service；若个别页面存在官方 KML 链接，仅作为兼容来源。map-service 仍负责身份、CSRF、权限、KML 安全解析、配额、幂等和审计。

## 2. 目标与原则

### 2.1 目标

1. 提供可审计、最小权限的 Chrome MV3 “两步路导入助手”。
2. 只有同时满足“已登录 + `kml.own.write` + 助手已安装、已授权并在线”时，账号中心“我的 KML”和 2D 地图 KML 面板才显示导入入口。
3. 用户粘贴受支持的两步路分享 URL 后，助手打开可见的两步路标签页，利用用户正常浏览器会话把页面已展示的轨迹、点位和公开媒体元数据还原为 KML；遇到登录、验证码或 WAF 时让用户自行处理，个别页面若存在官方 KML 可直接兼容。
4. 支持响应丢失后的安全重试，不重复创建 KML 或消耗配额。
5. 不把两步路 Cookie、账号密码、Token、验证码、请求头、代理信息或完整上游响应日志发送到 map-service。
6. 导入成功后自动激活发起导入的 map-service 标签页，并安全关闭扩展创建或登记管理的临时两步路标签页；无法自动处理时在两步路页面明确展示结果和手动操作入口。

### 2.2 不可妥协原则

- 用户授权优先：扩展不隐藏浏览器页面，不自动点击验证码，不模拟登录，不复制 Cookie。
- 服务端不信任客户端：扩展版本、来源和“已授权”声明只用于流程提示；KML 内容、URL、大小、XML 安全和权限在服务端重新校验。
- 来源最小化：扩展仅对用户明确配置的 map-service 来源注入桥接脚本；两步路仅允许官方固定主机，页面数据只允许固定的轨迹坐标和标注点路径。
- 可撤销：用户可在扩展选项页撤销 map-service 来源授权；卸载、禁用或版本不兼容后入口自动隐藏。
- 可恢复：每次导入使用用户范围稳定 `requestId`，成功确认前不清理，网络响应丢失时可以重放。

## 3. 角色、权限与入口显隐

### 3.1 角色条件

| 条件 | 账号中心入口 | 地图页入口 | 服务端行为 |
| --- | --- | --- | --- |
| 未登录 | 隐藏 | 隐藏 | `401 AUTH_REQUIRED` |
| 已登录但无 `kml.own.write` | 隐藏 | 隐藏 | `403 PERMISSION_DENIED` |
| 有写权限但未安装/未授权助手 | 隐藏 | 隐藏 | 新接口不可用但普通文件导入不受影响 |
| 有写权限且助手在线 | 显示 | 显示 | 可发起浏览器助手导入 |
| 超级管理员 | 仍需个人 KML 写权限和助手在线 | 同左 | 导入到自己的个人空间，不自动发布公共 KML |

“入口隐藏”是界面要求，不是安全边界。服务端接口无论是否安装扩展都必须执行会话、CSRF、`kml.own.write`、URL、KML 和配额校验。

### 3.2 助手状态

页面探测结果分为：

- `available`：协议版本兼容、来源已授权、桥接脚本在当前页面响应。
- `not-installed`：超时未收到 `PONG`。
- `not-authorized`：扩展存在但当前 origin 未在选项页授权。
- `incompatible`：版本或协议低于页面要求。
- `temporarily-unavailable`：扩展响应错误或浏览器阻止消息。

非 `available` 状态均不渲染“两步路导入”按钮，也不应渲染隐藏的可点击替代入口。普通 `.kml` 文件导入继续按原权限工作。

## 4. Chrome 扩展规划

### 4.1 形态与安装

- Chrome Manifest V3，无远程代码，无第三方 CDN，无构建依赖；扩展目录为 `extensions/two-bulu-helper/`，可通过“加载已解压的扩展程序”安装。
- 扩展使用独立的“轨迹双节点 + 导入箭头”图标，不复用或仿制两步路官方商标；保留 SVG 源文件并生成 16/32/48/128px PNG，分别供 Chrome 工具栏、扩展列表和选项页使用。
- 扩展版本遵循 `major.minor.patch`，消息协议单独使用整数 `protocolVersion`；页面只接受协议 `1`，扩展返回 `helperVersion` 和能力列表。
- 选项页提供精确的 map-service origin 配置。默认预置 `http://127.0.0.1:3088`、`http://localhost:3088`、`http://127.0.0.1:5174`、`http://localhost:5174`；其他开发端口可由用户显式添加。
- Chrome host permission 的匹配模式可能覆盖同主机其他端口，桥接脚本必须再次比较 `location.origin`，不在已保存的精确 origin 列表中时立即退出。

### 4.2 权限边界

扩展固定需要：

- `storage`：保存版本和用户明确授权的 map-service origin，不保存两步路 Cookie。
- `tabs`：打开/复用用户可见的两步路标签页。
- `scripting`：按选项页授权动态注册 map-service 桥接脚本。
- 两步路主机：`https://2bulu.com/*`、`https://www.2bulu.com/*`、`https://app.2bulu.com/*` 及官方公开下载主机 `https://down-files.2bulu.com/*`。

生产 map-service origin 不使用常驻的任意 `https://*/*` content script。选项页先请求对应 host permission，再注册该 origin 的动态脚本。用户取消授权、删除 origin 或卸载扩展后，动态脚本应注销或不再响应。

### 4.3 安装与授权流程

1. 用户从项目发布包安装扩展。
2. 打开扩展选项页，输入 map-service 的完整 origin；客户端拒绝路径、查询串、用户名、密码、非 HTTP(S) 协议和空主机。
3. 用户点击“授权此站点”，Chrome 显示 host permission；只有授权成功才保存 origin 并注册脚本。
4. 用户回到 map-service 刷新页面。页面发送 `PING`，扩展返回 `PONG` 后才显示入口。
5. 扩展更新时保留已授权 origin；协议不兼容时页面隐藏入口并提示安装兼容版本（不自动降级）。
6. 用户撤销站点授权或卸载扩展后，页面在刷新/下一次探测时隐藏入口；已打开的两步路标签页不被扩展批量关闭。

### 4.4 页面—扩展消息协议

消息通过 DOM `CustomEvent` 传递，`detail` 固定为 JSON 字符串，避免跨隔离世界传递对象。事件名：

- `map-service:two-bulu-helper:request`
- `map-service:two-bulu-helper:response`

公共字段：`protocolVersion`（目前为 `1`）、`type`、`requestId`、`timestamp`。这里的 `requestId` 是页面为单次扩展通信生成的不可预测 operation ID，扩展必须原样回传但不把它当作权限凭据；它与提交站内 API、用于创建幂等的业务 `requestId` 相互独立，避免重试时误接收旧操作的迟到响应。

探测请求/响应：

```json
// PING
{"protocolVersion":1,"type":"PING","requestId":"probe-uuid","timestamp":1720000000000}

// PONG
{"protocolVersion":1,"type":"PONG","requestId":"probe-uuid","helperVersion":"0.3.7","capabilities":["2bulu-kml-import","2bulu-import-tab-lifecycle"]}
```

导入请求只包含用户输入和业务选项：

```json
{
  "protocolVersion": 1,
  "type": "IMPORT_2BULU_KML",
  "requestId": "2bulu-uuid",
  "url": "https://www.2bulu.com/track/t-xxx.htm",
  "partialPolicy": "reject"
}
```

`partialPolicy` 可为 `reject`（默认）或 `allow-track-only`，由用户在导入弹窗中明确选择；协议中的 `timestamp` 由站内页面桥接自动补充，扩展不会把它当作权限凭据。

成功响应：

```json
{
  "protocolVersion": 1,
  "type": "IMPORT_RESULT",
  "requestId": "2bulu-uuid",
  "helperVersion": "0.3.7",
  "status": "success",
  "importSessionId": "import-uuid",
  "tabLifecycle": "created",
  "sourceUrl": "https://www.2bulu.com/track/track_detail.htm?trackId=xxx",
  "name": "公开轨迹",
  "sourceMode": "rendered-data",
  "completeness": "full",
  "warnings": [],
  "kmlText": "<?xml version=..."
}
```

`importSessionId` 仅用于本次浏览器标签页生命周期确认，不发送给站内保存 API，也不作为权限凭据。`tabLifecycle` 为 `created` 或 `managed-reused`，表示扩展新建了临时页，或复用了扩展自己此前登记的受管页；扩展不会搜索、复用或关闭用户自行打开且未登记的两步路标签页。

站内 API 完成保存后，页面发送二阶段确认：

```json
// COMPLETE_2BULU_IMPORT
{
  "protocolVersion": 1,
  "type": "COMPLETE_2BULU_IMPORT",
  "requestId": "completion-uuid",
  "importSessionId": "import-uuid",
  "status": "success",
  "message": "公开轨迹 已导入"
}

// COMPLETE_RESULT
{
  "protocolVersion": 1,
  "type": "COMPLETE_RESULT",
  "requestId": "completion-uuid",
  "ok": true,
  "sourceTabActivated": true,
  "helperTabClosed": true
}
```

只有最初发起导入的 map-service 标签页能结束对应会话。成功时先激活源标签页，再关闭扩展受管且未固定的两步路标签页；源标签页已关闭、临时页被固定、标签页归属不匹配或 Chrome 拒绝操作时不得强关，改为保留页面内结果卡片。保存失败时保持两步路页面打开，展示失败原因以及“返回 map-service”“关闭此页”按钮。

失败响应只允许稳定状态和中文可操作提示，不得携带 Cookie、响应头或验证码内容：

| `status` | `code` | 页面动作 |
| --- | --- | --- |
| `needs-user-action` | `TWO_BULU_LOGIN_REQUIRED` | 保持两步路标签页打开，用户自行登录/完成人机验证后重试 |
| `needs-user-action` | `TWO_BULU_UPSTREAM_BLOCKED` | 保持可见页面打开，用户完成第三方验证并等待轨迹显示后重试 |
| `needs-user-action` | `TWO_BULU_PARTIAL_REJECTED` | 页面只能还原轨迹线，要求用户显式允许仅轨迹导入 |
| `unsupported` | `TWO_BULU_PAGE_DATA_NOT_RECOGNIZED` | 页面已经打开但尚未识别到可转换的运行态轨迹数据，提示等待完整显示后重试 |
| `failed` | `TWO_BULU_TIMEOUT` | 允许按同一 requestId 重试 |
| `cancelled` | `USER_CANCELLED` | 不创建文档 |
| `cancelled` | `SOURCE_TAB_CLOSED` | 原 map-service 标签页已关闭，保留两步路结果卡片并停止保存 |

页面超时建议 120 秒；扩展内部单次网络读取不超过 20 秒，最多有限次重试。用户关闭两步路标签页时返回 `cancelled`。扩展只自动关闭自己创建或登记管理、仍处于两步路官方 HTTPS 页面且未被固定的标签页，不关闭用户自行打开的其他标签页。

### 4.5 浏览器内读取策略

读取按以下优先级执行：

1. `document_start` 在页面主世界安装被动 Resource Timing 观察器，只记录固定轨迹/标注资源 URL，不改写 `fetch`/`XMLHttpRequest`，不读取请求头、Cookie、Token、请求体或响应正文，避免触发 SafeLine 的调试环境检测。
2. 页面完成后注入 `two-bulu-page-export.js`，优先读取实际运行态：两步路当前页面的 `trackLngs`、`trackMarks[].pointMsg`、分离的经纬度数组、Leaflet/高德风格线点图层、页面脚本中的安全数组字面量，以及 Performance Resource 中页面实际访问过的固定数据 URL。所有有效独立线段都会合并，按原始 GPS/WGS84 数据优先、地图图层补充的顺序去重；`trackLngs`/原始轨迹响应必须优先于已经转换为底图坐标的折线图层，防止导入后再次执行 WGS84→GCJ-02 造成整条轨迹位移。
3. 页面脚本在浏览器内直接生成标准 KML，并保留轨迹名称、海拔、可信的用户标注名称和白名单公开媒体；图层标题、序号和系统 UI 文本不得写入点位名称，未命名点位的 `<name>` 为空。页面右侧“总里程”“运动耗时”“原作者”按语义标签和可见文本提取，缺少任一字段时保留其余字段；这些值以安全的 KML `Document.description` 信息介绍写入。仅使用地图线/点图层回退时，使用页面自己的 `changeMapCoordByMapType` 还原为 GPS 坐标。两步路图片标注的 `commnFileUrl` 作为唯一大图/主资源，`centerUrl`/`fileUrl` 作为该媒体项的缩略图；大图不可用时才将缩略图提升为主资源。同一标注不得把大图和缩略图解析成两个媒体项；视频封面仅作为 poster，不计为独立图片附件。导入创建的 KML 默认使用 `theme=simple`，仅显示点位图标，用户可在 KML 管理中切换主题。可单独执行 `MapServiceTwoBuluPageExport.download({ partialPolicy: 'allow-track-only' })` 下载并验证，不依赖 map-service 服务端。
4. 页面运行态暂未就绪时最多有限次等待重试，再从页面脚本或隐藏字段中提取 `trackId`、`trackStr`、`encryptTrackId` 和可选 `operationCode`；不执行页面脚本文本，不使用 `eval`。
5. 兼容回退只访问固定轨迹路径 `/track/get_track_positions_list4.htm`、`/track/get_track_positions_list_new.htm`、`/track/get_track_positions_list.htm`，以及固定标注路径 `/track/get_track_marker_list_new.htm`、`/track/get_track_marker_list_2.htm`。媒体 URL 继续只接受 `down-files.2bulu.com` 的 `/f/d1`、`/f/dn1` 以及唯一非空 `downParams`。
6. 如果标注数据不可用，`completeness=track-only`；只有用户选择 `partialPolicy=allow-track-only` 才生成并保存轨迹线，否则返回 `TWO_BULU_PARTIAL_REJECTED`。
7. 运行态已经包含轨迹和标注时禁止重复读取数据接口，避免触发第三方异常流量判定；只有缺少必要数据时才检查固定资源回退、页面正文、显式 `.kml` 链接和官方下载发现接口。
8. 页面是登录、验证码或 SafeLine/WAF 状态时返回可操作错误；页面已显示轨迹但仍未识别时返回 `TWO_BULU_PAGE_DATA_NOT_RECOGNIZED`，不再错误提示“页面必须提供标准 KML”。

轨迹/标注原始 JSON 只在两步路页面与扩展上下文内短暂处理，不发送给 map-service。浏览器得到或还原的 KML 通过站内 API 上传，服务端再次执行 XML/XXE、XSS、要素、大小和配额校验。扩展限制原始响应和生成 KML 均不超过 10 MiB、轨迹坐标和标注点合计不超过 100000 个。

### 4.6 标签页生命周期与结果反馈

1. 发起导入时记录不可预测的 `importSessionId`、源 map-service 标签页 ID、受管两步路标签页 ID、创建/复用方式和规范化分享 URL；会话只保存在 `chrome.storage.session`，30 分钟后自动失效。
2. 两步路页面在读取中、等待站内保存、需要登录/验证、读取失败和保存失败时显示非阻塞结果卡片，不使用 `alert`、`confirm` 或 `prompt`。
3. 站内保存成功后，网站发送 `COMPLETE_2BULU_IMPORT`。扩展必须校验消息来自原发起标签页，先激活该标签页和所在窗口，再判断临时页是否可自动关闭。
4. 自动关闭仅适用于扩展创建或登记管理、标签页 ID 与会话一致、仍为两步路官方 HTTPS 页面且未固定的标签页。扩展不通过 URL 查询任意现有两步路页面，也不批量关闭页面。
5. 自动关闭失败或源标签页不存在时保留结果卡片。用户可选择“返回 map-service”“关闭此页”或“收起提示”；手动关闭仍需校验当前两步路标签页属于该会话。
6. 保存失败不自动关页，避免丢失用户刚完成登录/验证的上下文；结果卡片和原 map-service 页面同时保留可操作错误。页面刷新、扩展 service worker 重启或响应丢失后，可从会话存储恢复归属校验。

## 5. 网站导入流程

### 5.1 账号中心

- `src/account/views.js` 根据 `state.twoBuluHelper.available`、登录态和 `canWriteKml` 动态生成按钮。
- `src/account/app.js` 先调用助手读取 KML，再调用浏览器助手专用站内 API 保存；站内保存成功后发送标签页完成确认并刷新“我的 KML”。
- 未安装、未授权、超时或不兼容时不显示按钮；普通文件导入、迁移本地数据不受影响。

### 5.2 地图页

- `src/map/kml.js` 初始将按钮设为 hidden，助手探测成功且当前会话具备 `kml.own.write` 后再显示。
- 导入成功后复用 `normalizeKmlFile`、账号同步快照登记和现有渲染/媒体详情逻辑，默认展开新文件并将地图适配到所有导入要素范围；随后通知扩展激活当前地图标签页并关闭安全的受管临时页。
- 导入失败不写 localStorage，不创建空文档；成功保存但前端响应丢失时使用原 `requestId` 重试并接受 `existing` 响应。

## 6. 服务端 API 契约

### 6.1 浏览器助手导入

```http
POST /api/v1/kml/import/2bulu/browser-helper
Content-Type: application/json
```

鉴权：map-service 用户 Cookie 会话、CSRF、`kml.own.write`。请求不会接受两步路 Cookie、Authorization、代理或自定义上游请求头。

请求：

```json
{
  "protocolVersion": 1,
  "helperVersion": "0.3.7",
  "url": "https://www.2bulu.com/track/t-xxx.htm",
  "kmlText": "<?xml version=\"1.0\"?><kml>...</kml>",
  "sourceMode": "rendered-data",
  "completeness": "full",
  "warnings": [],
  "coordCorrection": "wgs84-to-gcj02",
  "partialPolicy": "reject",
  "requestId": "2bulu-uuid"
}
```

字段规则：

- `protocolVersion` 必须为 `1`；`helperVersion` 必须是 1～32 位 ASCII 版本字符串。
- `url` 按旧接口规则重新规范化；服务端不信任助手回传的 `sourceUrl`。
- `kmlText` 必填，UTF-8 字节数不超过 10 MiB；必须是标准 KML，拒绝 DOCTYPE/ENTITY、空要素和非法坐标。
- `sourceMode` 为 `official-kml` 或 `rendered-data`；`completeness` 为 `full` 或 `track-only`。这两个字段只用于完整性策略、审计和用户提示，不替代服务端 KML 校验。
- `warnings` 最多 10 项，每项最多 300 字符；服务端规范化控制字符后再返回，不写入 KML 正文。
- `completeness=track-only` 时，服务端再次要求 `partialPolicy=allow-track-only`，否则返回 `422 TWO_BULU_PARTIAL_REJECTED`。
- `requestId` 复用用户范围幂等账本；同一 URL 与 requestId 重放返回原文档，结果摘要 `completeness=existing`。
- `coordCorrection` 只影响地图显示，数据库坐标仍保存 WGS84。

成功返回沿用 `/kml/import/2bulu` 的个人 KML 文档结构，并在 `importSummary` 中返回 `provider=2bulu`、规范化 `sourceUrl`、`sourceMode`、`completeness=full`、`track-only` 或 `existing`、安全警告和 `helperVersion`。不返回原始请求正文、页面轨迹 JSON、扩展权限清单或任何两步路凭据。

错误码：

| HTTP | code | 说明 |
| --- | --- | --- |
| 400 | `TWO_BULU_URL_INVALID` / `VALIDATION_FAILED` / `KML_PARSE_FAILED` / `KML_UNSAFE_XML` | 协议、版本、URL、请求 ID、选项或 KML 内容不合法 |
| 401 | `AUTH_REQUIRED` | 未登录 |
| 403 | `CSRF_INVALID` / `PERMISSION_DENIED` | CSRF 或个人 KML 写权限失败 |
| 409 | `KML_CREATE_REPLAY_DELETED` | 对应幂等创建已被永久删除 |
| 413 | `FILE_TOO_LARGE` | KML 正文、要素或用户配额大小超限 |
| 422 | `TWO_BULU_TRACK_EMPTY` / `TWO_BULU_PARTIAL_REJECTED` / `QUOTA_EXCEEDED` | 无有效要素、未显式允许仅轨迹导入，或个人配额不足 |

### 6.2 兼容旧接口

`POST /api/v1/kml/import/2bulu` 保留给未来可验证的官方 API provider 或运维兼容调用；当前网站不再直接调用它。其服务端直连行为和 WAF 降级说明继续由 [两步路公开分享轨迹导入](./2bulu-public-track-import.md) 维护。后续若官方提供 OAuth/API，应新增 provider，不把浏览器助手协议伪装成官方授权。

## 7. 安全、隐私与合规边界

威胁与控制：

| 威胁 | 控制 |
| --- | --- |
| 恶意页面伪造 `PONG` | 仅影响入口显示；后端仍重做全部鉴权和 KML 校验 |
| 恶意页面伪造导入响应 | 服务端只接收当前登录用户主动提交的 KML，并执行严格解析/配额；不信任来源字段 |
| 扩展被诱导访问任意 URL | 扩展和服务端双重 URL 白名单、HTTPS、无凭据 URL、固定主机/路径 |
| Cookie/Token 泄露 | 消息 schema 不含凭据；日志只记录状态、耗时和计数；扩展不读取 `document.cookie` |
| XSS/XXE | 复用 `parseKmlText`、normalize/sanitize 流程，拒绝外部实体并限制描述内容 |
| 重放和重复创建 | 用户范围 `requestId + trackId` 幂等键，成功前不清理客户端请求意图 |
| 大正文耗尽内存 | 扩展、Express body、服务端字节和要素上限；超限立即拒绝 |
| 站内跨站请求 | 新接口继续 Cookie + CSRF + Fetch Metadata 同源校验 |

明确禁止：复制/导出两步路 Cookie，向 map-service 发送账号密码、验证码、Authorization、Referer 中的私有签名，自动绕过人机验证，使用任意 URL 代理或访问内网/metadata 地址。

## 8. 第四版范围与非目标

范围内：Chrome MV3、可见两步路标签页、页面 `trackLngs`/`trackMarks` 运行态、Leaflet/高德图层和实际资源回退到标准 KML 的浏览器内还原（含多段轨迹、海拔、公开标注媒体、GPS 坐标恢复、脚本数组和标注接口回退）、个别官方 KML 兼容、用户手工完成验证、账号中心和 2D 地图双入口、站内保存、幂等重试、中文错误提示、未安装隐藏入口、二阶段保存确认、结果卡片、源标签页激活和受管临时页安全关闭。

范围外：Firefox/Safari、移动端扩展、KMZ/GPX、私有轨迹批量同步、后台代登录、验证码自动化、复制 Cookie、绕过 WAF、逆向签名/加密协议、调用页面未使用的私有接口、任意第三方网站导入。

## 9. 可观测性与运维

- 服务端审计记录 `provider`、`helperVersion`、`sourceMode`、`completeness`、协议版本、规范化 host、结果状态、要素数、正文大小、耗时和错误码；不记录 KML 正文、页面轨迹 JSON、Cookie、Token、完整 URL 查询签名或响应头。
- 前端仅向用户显示可操作摘要；浏览器控制台不得打印正文或凭据。
- 扩展 options 页展示当前授权 origin、协议版本和最近一次状态（成功/失败时间与错误码），不展示两步路敏感数据。
- 生产发布前必须提供扩展版本与网站最低兼容协议；协议升级先兼容旧版本一段时间，再提高页面最低版本。

## 10. 验收标准

### 自动化验收

- URL 规范化、消息协议、轨迹/标注 JSON 转换、媒体白名单、仅轨迹策略、坐标/正文上限、超时/取消和版本兼容有 `node:test` 覆盖。
- 账号中心和地图页源码/DOM 契约测试证明：未登录、只读、未安装/未授权时按钮 hidden；助手在线且写权限满足时显示。
- 新 API 覆盖无会话、无 CSRF、无写权限、协议/版本非法、空/超大/XXE/XSS KML、幂等重放和敏感字段不落日志。
- `npm run check`、`npm test`、`npm run build`、`git diff --check` 全部通过。

### 手工验收

1. 运行网站开发服务，按扩展 README 加载 `extensions/two-bulu-helper`。
2. 未授权当前 origin：打开 `/account#kml` 和地图 KML 面板，确认看不到“两步路导入”。
3. 在扩展选项页授权当前 origin，刷新页面；登录并使用具备 `kml.own.write` 的账号，确认两个入口都出现。
4. 粘贴示例分享 URL，确认扩展打开可见两步路标签页；若出现登录/验证码，手工完成后按页面结果卡片返回网站重试。已加载旧版扩展时先在 `chrome://extensions/` 点击“重新加载”，确认版本为 `0.3.7`；也可先执行 `await MapServiceTwoBuluPageExport.download({ partialPolicy: 'allow-track-only' })` 验证页面脚本能单独生成 KML。
5. 页面没有官方下载 KML 但地图已展示轨迹时，确认助手仍能生成 KML；账号中心出现轨迹线和标注点，线与点在底图上重合且不存在约数百米的整体坐标偏移；导入文件介绍中能看到总里程、运动耗时和作者（页面缺少字段时不显示空行）；地图 KML 管理面板展开“KML 详情”后能看到同一介绍、要素总数和类型统计，并可继续定位、查看详情和预览白名单媒体；地图自动适配范围。图片标注只出现一个媒体项：列表/轨道加载缩略图，点击后加载大图；原图不可用时才把缩略图作为主资源。
6. 模拟标注接口不可用：默认策略应拒绝；选择“允许仅导入公开轨迹线”后应成功并返回 `track-only` 警告。
7. 正常导入成功后确认浏览器自动返回原 map-service 标签页，并关闭扩展创建/登记的未固定两步路临时页；将临时页固定、关闭原标签页或模拟保存失败时，确认不强制关页且两步路页面显示结果卡片及“返回 map-service”“关闭此页”操作。
8. 关闭扩展或撤销 origin 授权并刷新，确认入口再次隐藏；普通本地 `.kml` 导入仍可用。
9. 在 Network/控制台中确认站内请求不含两步路 Cookie、Authorization、验证码或原始轨迹 JSON，服务端审计不含 KML 正文。

## 11. 后续路线

若两步路正式提供 OAuth 或公开 API，新增独立 provider 和官方授权流程；保留浏览器助手作为用户主动授权的兼容通道，不让两种凭据模型混用。跨浏览器支持应分别评估扩展权限模型、隔离世界和隐私清单，再扩展协议而不是复制 Chrome 实现。
