# KML 点位第三方分享链接识别与嵌入预览需求

状态：第一阶段已实现，已完成需求示例的桌面端和移动端浏览器回归，待用户环境验收。首期接入抖音公开视频分享链接，后续平台必须沿用本文的 provider 适配器、安全白名单和降级规则扩展。

## 1. 背景

当前 KML 点位的 `description` 已支持图片、音视频、iframe 和普通链接解析，但用户从抖音等应用复制出来的通常不是媒体直链，而是一整段分享文案和短链接，例如：

```text
8.74 复制打开抖音，看看【万两的作品】生活不用精彩 只要安逸自在就好 # 惬意时光# 中... https://v.douyin.com/Xi6sjYn-rps/ 06/18 :6pm tEH:/ c@A.tR
```

短链接本身不包含视频 ID，普通抖音详情页又通过 `X-Frame-Options` 或 CSP 限制第三方 iframe。直接把原链接识别为普通链接，用户只能离开地图查看；直接 iframe 普通详情页则会加载失败。

抖音开放平台提供官方播放器地址：

```text
https://open.douyin.com/player/video?vid=<video_id>
```

该播放器当前可作为受控 iframe 使用。因此需要把“分享文本识别、受控短链解析、标准嵌入地址生成、KML 描述持久化和统一媒体预览”串成完整能力，同时为后续新增平台预留稳定适配器边界。

## 2. 目标

1. 用户在 2D 或 3D 地图新增、编辑 KML 点位时，可以直接粘贴包含抖音分享链接的完整文案。
2. 保存点位时自动识别分享链接，并为公开视频生成官方播放器 iframe 媒体。
3. 点位弹窗、详情面板、整个 KML 媒体画廊和公开分享页复用现有富媒体体验，不单独实现一套播放器。
4. 用户再次编辑点位时只看到自己输入的描述，不暴露系统生成的 iframe 标记；保存后幂等重建，不重复添加媒体。
5. 短链解析失败不能导致点位内容丢失，也不能阻断点位保存；应保留原分享文本并给出中文提示。
6. 新增平台时只增加 provider 适配器和对应安全策略，不修改 KML 核心模型或开放任意 URL 代理。

## 3. 范围

### 3.1 第一阶段范围内

- 从整段文本中提取 HTTPS URL。
- 识别以下抖音地址：
  - `https://v.douyin.com/<短码>/`
  - `https://www.douyin.com/video/<video_id>`
  - `https://www.iesdouyin.com/share/video/<video_id>`
  - `https://open.douyin.com/player/video?vid=<video_id>`
- 对已经包含视频 ID 的地址在本地直接生成标准播放器地址。
- 对 `v.douyin.com` 短链调用受控服务端解析接口，最多跟随固定次数的抖音官方域名重定向。
- 把解析结果写成带 `data-kml-share-*` 标记的 `<iframe>`，继续保存到 Feature `description`，兼容现有 KML 导入、同步、导出和公开分享。
- 2D Leaflet、3D Cesium、个人 KML、管理员可编辑公共 KML和只读分享查看共用同一解析结果。
- iframe 使用固定 sandbox、权限、referrer policy、懒加载和“打开原内容”兜底。
- 服务端解析器、共享纯函数、路由鉴权、安全边界和错误分支的 `node:test`。

### 3.2 暂不纳入

- 不下载、转存、转码或破解抖音视频文件。
- 不绕过登录、验证码、风控、版权限制、地区限制、`X-Frame-Options` 或 CSP。
- 不接受客户端提交 Cookie、Authorization、代理地址、自定义请求头或任意目标 URL。
- 不提供通用网页代理、通用短链展开、页面抓取或 iframe 白名单管理后台。
- 不保证私密、已删除、下架、仅好友可见或平台禁止嵌入的视频能够播放。
- 第一阶段不自动读取作者头像、封面、点赞数等额外元数据。

## 4. 用户与权限

- 登录且拥有 `kml.own.write`、`kml.any.manage` 或等价超级管理员权限的用户，可以解析抖音短链接。
- 已经包含合法视频 ID 的抖音地址不需要服务端回源，可以直接在前端生成受控嵌入地址。
- 未登录的本地 KML 编辑模式不得调用短链解析接口；原描述正常保存，并提示“登录后可自动解析抖音短链接”。
- 公开分享页和未登录访客只消费已经持久化的受控 iframe，不提供新增或重新解析入口。
- 路由必须继续校验用户会话与 CSRF；仅凭站点访问 Cookie 或分享访问 Cookie不能调用解析接口。

## 5. 交互需求

### 5.1 新增或编辑点位

描述字段下方显示说明：

```text
支持粘贴抖音等应用分享文案；保存时会自动识别可预览内容。
```

用户点击保存后：

1. 没有受支持链接：按原流程立即保存。
2. 有可直接识别的视频 ID：本地生成媒体标记后保存。
3. 有抖音短链且用户已登录：提交后调用受控解析接口，解析期间保持当前地图视图，成功后完成保存。
4. 短链无法解析、超时或视频不可用：保留原文并完成点位保存，随后使用统一 Dialog 告知未转换原因。
5. 同一视频出现多次，只生成一个媒体项。

### 5.2 再次编辑

- 编辑框只显示用户原始描述，系统生成的 `<iframe data-kml-share-provider="...">` 不显示。
- 如果原分享链接仍存在，优先复用上一次的解析结果，避免每次编辑都访问第三方。
- 用户删除分享链接后，对应的系统生成媒体标记也应删除。
- 用户新增其他分享链接时，只解析新增且无法本地识别的短链。

### 5.3 查看

- 点位存在抖音 iframe 时，媒体点位图标和媒体摘要按 `iframe` 统计。
- 点击媒体卡片进入统一媒体预览器，iframe 在用户操作后才创建。
- 预览器允许全屏、画中画和站内小窗能力所需的浏览器权限，但不得获得顶层页面控制权。
- iframe 使用与预览舞台一致的深色表面和居中壳层；第三方页面未覆盖完整 iframe 视口时不得露出站内白色空白区域，超大 iframe 在可用空间内居中展示。
- provider 可以生成只用于前端加载的自适应预览地址。抖音播放器使用 `width=100vw`、`height=100vh` 适配 iframe 视口，持久化到 KML 的标准播放器 URL 仍只包含稳定视频 ID。
- “原始页面”按钮打开规范化后的抖音视频详情页，不打开带大量追踪参数的重定向地址。
- iframe 加载失败时展示失败状态，并保留打开原页面的兜底入口。

## 6. 数据与标记格式

第一阶段不新增 Feature 数据库字段，继续使用 `description`。系统生成内容格式如下：

```html
<iframe
  src="https://open.douyin.com/player/video?vid=7645601561687440101"
  title="抖音视频"
  data-kml-share-provider="douyin"
  data-kml-share-source="https://v.douyin.com/Xi6sjYn-rps/"
  data-kml-share-canonical="https://www.douyin.com/video/7645601561687440101">
</iframe>
```

约束：

- `src` 必须由 provider 适配器生成，不能直接采用调用方提交值。
- `data-kml-share-source` 只保留规范化后的原始分享 URL，删除 hash、追踪参数和用户信息。
- `data-kml-share-canonical` 必须是 provider 生成的稳定详情地址。
- 服务端仍执行 `sanitizeRichText`；前端不得把 `description` 作为任意 HTML 注入 DOM。
- KML 导出继续按标准 XML 转义保存该描述，重新导入后仍可被富媒体解析器识别。

## 7. 通用 provider 架构

共享适配器至少包含：

```js
{
  id: 'douyin',
  label: '抖音',
  match(url),
  normalizeSourceUrl(url),
  extractResourceId(url),
  requiresServerResolution(url),
  buildCanonicalUrl(resourceId),
  buildEmbedUrl(resourceId),
  buildPreviewUrl(resourceId),
  validateEmbedUrl(url),
  embedPolicy
}
```

新增 provider 必须同时提供：

- 明确的源域名、短链域名、允许重定向域名和路径模式。
- 稳定资源 ID 校验规则。
- 官方或明确允许第三方嵌入的播放器模板。
- 可选的运行时预览地址生成规则；只允许添加 provider 自身支持的显示参数，不得改变已验证的 origin、path 或资源 ID。
- iframe sandbox、`allow`、`referrerPolicy` 和全屏策略。
- 不可嵌入时的普通外链降级规则。
- 服务端解析测试、共享解析测试和前端展示测试。

provider 不得返回任意调用方 URL 作为 iframe 地址。

## 8. 接口契约

### `POST /api/v1/kml/share-links/resolve`

用途：解析文本中必须通过服务端展开的受支持分享短链。

鉴权：用户 Cookie 会话、CSRF，且拥有 KML 写权限。

请求：

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

边界：

- `text` 必填，最大 100000 字符。
- 单次最多处理 10 个受支持分享链接。
- 只对 provider 声明为“需要服务端解析”的短链发起请求。
- 单次请求总超时 10 秒，单个上游请求超时 5 秒，最多 3 次重定向。
- 部分链接失败时接口仍返回成功，失败原因放入 `warnings`，不影响其他链接。
- 返回值不得包含上游 Cookie、响应正文、追踪参数、内部 DNS 地址或请求头。

错误码：

| HTTP | 错误码 | 含义 |
| --- | --- | --- |
| 400 | `VALIDATION_FAILED` | 文本为空、超长或格式不正确 |
| 401 | `AUTH_REQUIRED` | 未登录 |
| 403 | `CSRF_INVALID` / `PERMISSION_DENIED` | CSRF 或 KML 写权限失败 |
| 413 | `SHARE_LINK_LIMIT_EXCEEDED` | 受支持链接数量超过上限 |
| 429 | `SHARE_LINK_RATE_LIMITED` | 当前账号解析过于频繁 |
| 502 | `SHARE_LINK_UPSTREAM_FAILED` | 固定平台上游请求失败；批量中的单项失败优先降级为 warning |
| 504 | `SHARE_LINK_TIMEOUT` | 固定平台上游请求超时；批量中的单项失败优先降级为 warning |

## 9. 安全要求

1. 仅允许 HTTPS，禁止账号密码、非标准端口、localhost、内网、link-local、metadata 和保留地址。
2. 每次 DNS 解析和重定向都必须重新校验域名与公共地址，防止 DNS rebinding 和开放重定向跳出白名单。
3. 抖音首期只允许 `v.douyin.com` 发起短链请求，重定向只允许受控抖音官方域名。
4. 上游请求不转发用户 Cookie、Authorization、Referer、自定义代理或浏览器指纹。
5. 服务端使用 `maxRedirects: 0` 手工处理跳转，不读取大体积页面正文。
6. 日志只记录 provider、稳定资源 ID、结果码和耗时，不记录完整追踪 URL。
7. 受信任 iframe 判断使用精确 origin、path 和资源 ID 规则；环境 iframe allowlist 不能覆盖 provider 的资源 ID 校验。
8. iframe 必须设置 sandbox。允许 `allow-same-origin` 时仅限固定跨域官方播放器，并禁止 `allow-top-navigation`。
9. 页面始终以受控 DOM API 创建 iframe，不把描述 HTML直接写入页面。

## 10. 验收标准

1. 粘贴需求示例并保存后，点位媒体摘要出现 1 个页面，点击可打开抖音官方播放器。
2. 原分享文案完整保留，编辑时不显示机器生成 iframe 标记。
3. 相同链接重复保存不会产生重复媒体；删除链接后媒体同步消失。
4. `www.douyin.com/video/<id>` 和 `iesdouyin.com/share/video/<id>` 无需上游请求即可生成相同播放器地址。
5. 短链重定向到非抖音域名、内网地址、非 HTTPS 或无合法视频 ID 时被拒绝。
6. 未登录调用解析接口返回 `401 AUTH_REQUIRED`，无写权限返回 `403 PERMISSION_DENIED`。
7. 上游超时或失败时点位仍保存原描述，并给出可理解的提示。
8. 个人 KML、公共 KML、分享链接、2D 和 3D 查看结果一致。
9. 现有图片、视频、音频、普通 iframe、两步路媒体和 KML 导入导出测试保持通过。
10. 完成 `npm run check`、`npm test`、`npm run build` 和 `git diff --check`。
11. 桌面与移动端打开抖音 iframe 时，播放器外未覆盖区域使用预览舞台深色背景；移动端不再出现由默认 `324×672px` 播放器尺寸造成的白色空白条带。

## 11. 后续扩展

后续可以按 provider 逐步评估 B 站、腾讯视频、优酷、小红书、微信公众号视频等平台。只有平台提供稳定官方播放器或明确允许第三方嵌入时才转换为 iframe；否则仅识别为带平台标识的普通链接卡片，不以代理、抓取或绕过安全头的方式强行嵌入。
