# SidePanel 嵌入式 KML 双屏编辑需求

> 状态：已实现并通过 SidePanel v0.2.3 实际环境验收  
> 适用页面：2D 地图、3D 地图、账号登录页  
> 参考工具：[SidePanel](https://github.com/xxxily/SidePanel)

## 1. 背景

SidePanel 等浏览器侧栏工具会以 `chrome-extension://<扩展 ID>` 页面作为顶层页面，再把 map-service 放入 sandbox iframe。iframe 内站点仍保持自己的来源，但用户 Cookie、IndexedDB 和 localStorage 会进入第三方或分区存储上下文。

原有登录 Cookie 使用 `SameSite=Lax`，无法可靠进入该上下文。会话加载失败后，地图又会回退到访客 KML，造成用户以为正在编辑账号文件，实际修改只存在于临时页面；侧栏快速关闭时，异步 IndexedDB 写入还可能来不及完成，最终表现为保存失败、草稿无法恢复和编辑数据丢失。

## 2. 目标

- 支持在 SidePanel 类 iframe 中登录并持续使用账号 KML。
- 2D、3D 页面都能新增、编辑、删除、排序、移动、复制和同步个人 KML。
- 侧栏关闭、iframe 被销毁、网络中断或会话失效后，未同步修改可恢复。
- iframe 未建立账号会话时不得读取或写入访客 KML，避免数据身份混淆。
- 保持普通标签页现有登录、CSRF、访客 KML 和分享查看行为不变。

## 3. 范围

### 3.1 范围内

- 同源站点被浏览器扩展页面嵌入时的登录与会话保持。
- 嵌入环境的 CSRF Token 选择、请求标识和服务端来源校验。
- 账号 KML 增量同步与恢复草稿可靠性。
- 2D、3D KML 面板的登录门禁、入口显隐和会话失效处理。
- SidePanel 的双屏对比编辑使用说明与兼容性提示。

### 3.2 范围外

- 向任意第三方网站开放跨域 API、CORS 或 Token 登录。
- 修改或维护 SidePanel 扩展本身。
- 在父扩展页面和 iframe 之间传递账号 Token、密码或 KML 明文。
- 绕过浏览器禁用 Cookie、禁用站点存储或企业策略限制。
- 保证所有旧版浏览器、Safari 或不支持分区 Cookie 的 WebView 可用。

## 4. 用户流程

1. 用户在 SidePanel 中打开 map-service。
2. 若当前分区尚无账号会话，KML 面板显示“请先登录”，隐藏导入、新建和编辑入口，不加载访客 KML。
3. 用户点击登录状态，在当前侧栏 iframe 内进入账号登录页。
4. 登录成功后按受控 `returnTo` 返回原地图地址，加载该账号的个人 KML。
5. 编辑操作继续使用现有 `/api/v1/kml/sync` 增量同步；保存状态在 KML 面板显示。
6. 如果侧栏在同步完成前关闭，重新打开并登录同一账号时提示恢复未完成草稿。

普通标签页会话与 SidePanel 分区会话相互隔离。用户首次在某个扩展分区中使用时，可能需要单独登录一次。

## 5. 功能需求

### 5.1 嵌入环境识别

- 前端以 `window.self !== window.top` 判断当前文档是否被嵌入。
- 所有统一认证 API 请求在嵌入环境增加 `X-Map-Embed-Context: iframe`。
- 该请求头仅表示客户端上下文，不能单独授予登录、会话或写权限。

### 5.2 分区会话

- 普通标签页继续使用：
  - `map_user_session`：`HttpOnly; SameSite=Lax`
  - `map_csrf_token`：前端可读，`SameSite=Lax`
- 嵌入登录额外签发：
  - `map_user_session_embed`：`HttpOnly; SameSite=None; Secure; Partitioned; Priority=High`
  - `map_csrf_token_embed`：前端可读，属性同上
- 嵌入请求优先读取分区会话和分区 CSRF Cookie；普通页面优先读取原 Cookie。
- 退出登录必须尝试清理两组 Cookie；浏览器按当前顶层站点分区执行实际清理。
- 如果分区会话已撤销或过期但 Cookie 尚未同步清除，服务端只清理失效的嵌入 Cookie，不影响普通标签页会话；客户端对可重放的 JSON 写请求刷新会话上下文后最多自动重试一次。
- 重试必须重新读取当前上下文的 CSRF Cookie；仍失败时保留原错误，不降低 CSRF、来源或权限校验要求。
- 不在 URL、localStorage、postMessage 或 API 响应中返回会话 Token。

### 5.3 登录来源校验

- 普通登录继续要求同源 Fetch Metadata 或严格匹配的 `Origin` / `Referer`。
- 嵌入登录可接受 `Sec-Fetch-Site: cross-site`，但必须同时满足：
  - 请求携带受控嵌入标记；
  - `Origin` 或 `Referer` 的来源与当前 map-service 请求来源完全一致。
- 攻击者来源即使伪造嵌入标记也必须返回 `403 CSRF_INVALID`。
- 不新增通配 CORS、跨源凭据共享或基于父页面来源的白名单绕过。

### 5.4 KML 身份隔离

- iframe 未登录时进入 `embedded-auth-required` 模式，不得回退访客 localStorage KML。
- 该模式下 2D、3D 均隐藏 KML 导入、新建和编辑入口。
- 会话失效时先保存当前账号恢复草稿，再清空页面中的私有 KML；不得显示访客 KML 冒充当前账号数据。
- 普通顶层页面未登录时仍可沿用既有访客 KML 能力。

### 5.5 草稿可靠性

- IndexedDB 继续保存完整账号恢复草稿，并按用户 ID 隔离。
- 为覆盖 SidePanel 快速销毁 iframe 的情况，较小草稿在每次进入待保存状态时同步写入完整 localStorage 副本，再异步写入 IndexedDB。
- 完整 localStorage 副本默认上限为 750000 个序列化字符；超过上限只保存代次、时间和文件数量元数据，完整内容仍由 IndexedDB 保存。
- IndexedDB 不可用但完整 localStorage 副本写入成功时，本次草稿仍视为可恢复，不得继续报“未持久化”。
- 页面 `visibilitychange=hidden`、`pagehide`、会话失效及同步请求发送前都要保留当前草稿。
- 恢复时选择代次更新且内容完整的记录；删除墓碑继续阻止旧草稿复活。

### 5.6 失败反馈

- 嵌入登录响应成功但后续会话检查仍未认证时，返回前端错误码 `EMBEDDED_SESSION_UNAVAILABLE`，提示浏览器未能建立侧栏会话。
- 草稿存储失败继续显示 `KML_RECOVERY_UNAVAILABLE`，不得在恢复保护失败时静默发送新同步批次。
- 嵌入写请求因旧分区 Cookie 返回一次 `403 CSRF_INVALID` 时，自动清理失效分区状态并重试一次；重试仍失败时显示原始错误并保留恢复草稿。
- 登录失败、权限不足、版本冲突和网络错误继续使用现有统一 Dialog 与同步状态，不使用浏览器原生弹窗。

## 6. API 契约

既有 API 路径和业务请求体保持不变。新增的是浏览器上下文头和 Cookie：

```http
X-Map-Embed-Context: iframe
Cookie: map_user_session_embed=<opaque>
X-CSRF-Token: <map_csrf_token_embed 的值>
```

适用接口包括 `/api/v1/auth/login`、`/api/v1/auth/session`、`/api/v1/kml/files`、`/api/v1/kml/sync` 及其他统一认证客户端调用的接口。

## 7. 非功能需求

- 安全：分区会话与普通会话同样执行服务端会话撤销、权限、CSRF、限流和审计。
- 兼容：目标基线为支持 CHIPS 分区 Cookie 的当前稳定版 Chromium。
- 部署：生产环境应使用 HTTPS。仅允许浏览器明确视为可信回环来源的本地 HTTP 调试；普通非回环 HTTP 无法可靠设置 `Secure; Partitioned` Cookie。
- 性能：同步 localStorage 完整副本设置容量上限，避免大型 KML 长时间阻塞主线程或耗尽配额。
- 可观测：服务端日志不得记录 Cookie、CSRF Token 或 KML 草稿正文。

## 8. 验收标准

- SidePanel iframe 内可登录，登录响应包含分区会话和分区 CSRF Cookie。
- 嵌入会话可读取个人 KML，并成功执行带 CSRF 的新增或同步请求。
- 普通标签页登录仍只依赖原有 Cookie，行为无回归。
- 攻击者 Origin 携带伪造嵌入标记仍被拒绝。
- iframe 未登录时 2D、3D 不显示访客 KML，也不能新增、导入或编辑个人 KML。
- 小型未同步草稿在 IndexedDB 不可用、iframe 快速关闭并重新打开后仍可恢复。
- 大型草稿超过同步副本阈值时不写完整 localStorage，IndexedDB 正常时仍可恢复。
- 会话失效后先保留草稿，再进入嵌入登录门禁，不泄露已加载的私有 KML。
- 模拟旧分区会话与普通会话并存时，第一次写请求返回 `CSRF_INVALID` 会清理分区 Cookie，随后使用普通会话 CSRF 完成一次重试；业务操作只执行一次。
- `npm run check`、`npm test`、`npm run build` 和 `git diff --check` 通过。

## 9. 实际环境验收记录

- 验收环境：Chromium、SidePanel v0.2.3、本地回环地址。
- iframe 登录成功写入以扩展来源分区的会话和 CSRF Cookie。
- 2D、3D 与左右双屏中的独立 iframe 均可读取同一账号 KML。
- 账号 KML 新建、点位新增和服务端同步成功；销毁 iframe 后会话仍可恢复。
- 模拟同步失败后，小型完整草稿可从 localStorage 恢复，并在重新同步成功后才清理。
- 未登录 iframe 不显示私有点位，导入、新建和坐标纠偏入口保持隐藏。
