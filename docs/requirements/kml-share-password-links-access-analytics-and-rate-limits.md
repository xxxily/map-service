# KML 分享密码链接、访问记录、统计脚本与瓦片限流需求

> 状态：已实施，待发布验收
> 版本：1.0
> 日期：2026-08-21
> 适用范围：用户中心 KML 分享、匿名分享页、公开分享地图接口、管理后台和全站运行统计
> 关联文档：[KML 分享空间访问控制与半公开地图](./kml-share-spatial-access-and-semi-public-map.md)、[用户体系 API](../api-user-system.md)

## 1. 背景与目标

当前分享密码只能通过页面表单输入，分享者无法方便地交付给可信访问者；分享页瓦片请求采用硬编码的分享级固定窗口，正常的双图层、预加载和连续缩放会触发 429；分享者只有访问次数和最近访问时间，缺少足以判断分享传播范围的低敏信息；系统也没有统一、可治理的全站和单分享访问统计脚本能力。

本需求在不改变现有分享链接稳定 ID、HttpOnly 授权 Cookie、空间访问控制和发布同步模型的前提下，增加：

1. 可选的带密码分享链接，以及创建/修改密码时的高强度密码生成。
2. 可动态配置、按正常浏览负载设计的分享清单和瓦片限流，并修复空间受限分享的误 429。
3. 以聚合和脱敏为原则的最近访问记录。
4. 管理员可控的全站访问统计脚本，以及受管理员授权、可逐分享禁用的分享统计脚本。

## 2. 设计原则与安全边界

### 2.1 密码链接

- 服务端持久化层只保存分享密码哈希和 `password_version`，不单独返回密码明文；仅当分享所有者主动生成带密码链接时，响应 URL 会按其请求包含刚提交的密码参数，服务端不保存该明文。
- 带密码链接使用 `?password=` 查询参数，仅作为一次性自动验证输入，不作为长期 Token。
- 分享页启动后立即用 `history.replaceState` 移除该参数，并为分享入口设置 `Referrer-Policy: no-referrer`，避免后续资源、统计脚本和站外跳转继续携带密码。查询参数不可避免会出现在首次 HTTP 请求中，生产网关和访问日志必须按运维文档脱敏或关闭分享入口的查询串记录。
- 分享密码修改、分享链接轮换、暂停/撤销/封禁和策略失效都会使旧参数链接失效；验证时必须重新读取当前密码哈希与版本。
- 分享者复制带密码链接前需在本地输入当前密码确认；客户端不得从服务端推导明文。
- 自动生成密码使用浏览器 CSPRNG，长度 20，包含大小写字母、数字和安全符号；密码只显示在当前对话中，不持久化。

### 2.2 瓦片限流

- 限流保留恶意流量防护，不通过删除限流解决 429。
- 限流在图源白名单校验和空间分类之后计数；范围外透明瓦片、无效图源和非法坐标不消耗正常允许额度。
- 默认按分享、匿名访客标识和来源摘要组合计数；优先使用 HttpOnly 访客 Cookie，缺失时回退到服务端 IP/UA 摘要。
- 限流策略存入用户系统设置，管理员可配置启用状态、窗口、清单上限、瓦片上限和内存条目上限；设置有上下界并需重新认证。
- 默认值按两套地图图层、预加载和连续缩放设计，不应让单个正常访客在一分钟内轻易触发 429。

### 2.3 访问记录与隐私

- 不记录每个瓦片请求，避免数据库写放大。
- 分享清单访问按“分享 + 匿名访客 + 时间窗口”去重聚合；保存首次/最近时间、访问次数、访问方式、设备大类、来源 Origin 和不可逆摘要。
- 不保存原始 IP、完整 User-Agent、完整 Referer、密码、Cookie、Token 或查询参数。
- 默认保留 30 天，所有者每次最多查看最近 100 条；管理员可按治理权限查看聚合记录和脚本策略。
- 记录失败密码验证只进入现有安全限流/审计，不进入公开访问记录。

### 2.4 统计脚本

- 全站统计由管理员配置，适用于地图、用户中心和分享页，不加载到管理后台；可填写受控外部 `<script src>` 描述和 `data-*` 属性。
- 分享统计默认使用托管 provider 模式：管理员配置固定 HTTPS `scriptUrl`，分享者只能填写网站 ID 等允许字段。
- 只有超级管理员明确开启后，分享者才可提交自定义外部脚本描述；禁止 inline JavaScript、`javascript:`/`data:`、事件属性、账号密码 URL、非 HTTPS 地址和任意 HTML 注入。
- 分享统计脚本必须在密码查询参数清理后加载，且被管理员逐分享禁用时不得加载。
- 公开 Manifest 只返回已通过服务端策略校验的脱敏统计描述，不返回管理备注、密钥或任意脚本原文。

## 3. 角色与权限

| 角色 | 能力 |
| --- | --- |
| 分享所有者 | 生成普通/带密码链接、生成密码、查看自己的最近访问记录、在授权范围内配置分享统计 |
| 普通访问者 | 访问分享内容；带密码参数时自动完成一次验证 |
| 管理员 | 配置限流和全站统计（按现有安全设置权限）；查看分享治理数据；逐分享禁用统计脚本 |
| 超级管理员 | 开启自定义分享脚本、配置 provider 白名单和全部治理设置 |

## 4. 功能需求

### 4.1 分享链接

- 用户中心“复制链接”提供“普通链接”和“带密码链接”两个选项。
- 无密码分享不显示带密码选项。
- 带密码链接格式：`/share/{publicId}?password={encodeURIComponent(password)}`。
- 分享页首次收到 `SHARE_PASSWORD_REQUIRED` 时读取参数并自动调用现有验证接口；参数清理后再初始化地图、媒体和统计脚本。
- 验证失败时保留密码输入界面，但地址栏不得继续保留密码参数。
- 创建/修改分享密码对话框提供“生成密码”按钮和复制按钮；生成密码不自动提交，用户可修改后保存。

### 4.2 动态限流与瓦片访问

管理员设置新增 `share.rateLimit`：

```json
{
  "enabled": true,
  "windowMs": 60000,
  "tileMaxRequests": 3000,
  "manifestMaxRequests": 300,
  "maxEntries": 10000
}
```

约束：`windowMs` 10 秒～10 分钟，瓦片 100～60000，清单 20～10000，条目 100～100000。空间受限范围外透明瓦片不计入 `tileMaxRequests`。

### 4.3 访问记录

新增 `share_access_events` 聚合表，字段：

- `id`、`share_id`
- `visitor_hash`、`ip_hash`
- `first_accessed_at`、`last_accessed_at`、`access_count`
- `access_method`：`open`、`password_form`、`password_link`、`session`
- `device_type`、`referrer_origin`
- `created_at`

同一分享、访客和访问方式在 15 分钟窗口内更新同一聚合记录。默认清理超过 30 天的数据。

所有者接口：

`GET /api/v1/kml/shares/:id/access-events?page=1&limit=20`

返回分页聚合记录，不返回原始 IP、Token、密码或完整请求头。

### 4.4 全站统计

管理员用户系统设置新增：

```json
{
  "analytics": {
    "global": {
      "enabled": false,
      "script": {
        "src": "https://example.com/script.js",
        "defer": true,
        "async": false,
        "attributes": { "data-website-id": "..." }
      }
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

服务端校验 HTTPS、长度、属性名和值；前端通过 DOM API 创建脚本节点，不使用 `innerHTML` 注入。

### 4.5 分享统计

分享配置新增 `analytics`：

```json
{
  "mode": "provider",
  "websiteId": "..."
}
```

服务端根据管理员 provider 配置生成脱敏 descriptor。管理员可在分享治理中逐分享设置 `analyticsDisabled`。分享页仅在 `enabled && !analyticsDisabled` 时加载。

## 5. API 契约

### 5.1 访问记录

`GET /api/v1/kml/shares/:id/access-events`

- 鉴权：登录用户 + `share.own.manage`，只能访问自己的分享。
- 参数：`page` 1～1000000，`limit` 1～100，默认 20。
- 成功：`{ items, page, limit, total }`。
- 错误：`401 AUTH_REQUIRED`、`403 PERMISSION_DENIED`、`404 RESOURCE_NOT_FOUND`。

### 5.2 管理员统计/限流设置

沿用 `PUT /api/v1/admin/user-system/settings`，新增 `share.rateLimit` 和 `analytics` 字段。更新遵循现有权限、重新认证、影响预览和审计规则。

### 5.3 带密码自动验证

沿用 `POST /api/v1/public/kml-shares/:publicId/access`。新增访问上下文 `accessMethod=password_link` 仅用于聚合统计，不改变响应结构；服务端仍只写 HttpOnly Cookie，不返回访问 Token。

## 6. 数据迁移

用户数据库版本升至 v7：

1. 创建 `share_access_events` 及 `(share_id, visitor_hash, access_method, last_accessed_at)` 索引。
2. 在 `user_system_settings` 中保留 JSON 兼容旧设置；缺省填充限流和统计默认值。
3. 旧分享、旧会话和旧链接无需重建；旧分享默认不启用分享统计。
4. 迁移必须幂等，启动时不得从数据库读取或回显密码明文。

## 7. 验收标准

- 带密码链接首次打开可自动进入分享地图；修改密码后旧链接重新要求输入且不能绕过。
- 页面启动后地址栏、后续浏览历史、Referer 和统计脚本请求中不出现密码；生产网关日志按运维要求隐藏首次请求的查询参数。
- 生成密码满足长度/字符集要求，服务端只存哈希。
- 正常双图层连续缩放不触发 429；超出配置阈值仍得到明确 429；管理员改配置无需重启即可生效。
- 空间范围外透明瓦片不消耗允许配额，范围内瓦片可正常加载。
- 所有者可看到最近访问时间、次数、设备大类、来源 Origin 和访问方式，且看不到原始 IP/完整 UA。
- 全站统计仅在管理员开启且策略校验通过时加载；分享统计默认只能使用托管 provider，逐分享禁用立即生效。
- `npm run check`、相关 `node:test`、`npm test`、`npm run build` 和 `git diff --check` 通过。

## 8. 后续路线

- 管理员可配置访问记录保留天数和聚合窗口。
- 增加按时间段的分享访问趋势图和异常访客告警。
- 在 provider 白名单基础上增加 CSP nonce/Trusted Types 兼容策略。
