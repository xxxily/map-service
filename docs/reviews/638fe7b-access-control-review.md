# 638fe7b 访问控制提交代码审查

审查日期：2026-06-17

审查范围：`638fe7b59e31ae2036a4e1ee7ab714bfb4d24d03` 相对父提交的改动。

提交主题：支持管理员设置访问控制密码，开启后首页以锁屏阻断并拦截未授权瓦片请求。

## 验证结果

- 在 detached worktree `/tmp/map-service-review-638fe7b` 中验证，避免受当前未提交改动影响。
- `npm run check`：通过。
- `npm test`：通过，19 个测试全部通过。
- `npm run build`：通过。

## 总体结论

实现已经打通了管理后台配置、首页锁屏、瓦片代理拦截和基础单元测试，功能主流程可运行。但当前访问控制更接近“轻量访问门禁”，还不适合作为严肃的安全边界。主要风险集中在访问密码与 token 的设计：服务端明文保存访问密码，客户端拿到的 token 是密码经固定盐 SHA-256 后的长期等价物，并且还支持通过 URL 查询参数传入，泄露面较大。

建议先修复高优先级安全问题，再扩展接口级测试覆盖。

## 高优先级问题

### 1. 访问密码明文持久化，且明文比较

位置：

- `service/bin/admin/settings.js:58`
- `service/bin/admin/settings.js:202`
- `service/bin/admin/store.js:44`

问题：

`normalizeAccess` 将访问密码原样写入 `settings.json`，`checkPassword` 也直接用明文做 `===` 比较。只要 `.db/admin/settings.json`、备份、日志采集或服务器账号发生泄露，访问密码会直接暴露。这个实现也缺少密码哈希常见的随机盐、工作因子和 timing-safe 比较。

建议：

- 保存密码时只保存密码哈希，不保存明文。
- 使用 Node 内置 `crypto.scrypt` / `crypto.pbkdf2`，或项目可接受的成熟密码哈希方案；每个密码生成独立随机 salt。
- 校验时使用 `crypto.timingSafeEqual` 比较派生结果。
- 如需兼容历史明文配置，增加一次性迁移逻辑：首次读取旧格式后重写为新格式。

### 2. `map_access_token` 是长期有效的密码等价物，并通过响应体和 URL 参数暴露

位置：

- `service/bin/admin/settings.js:53`
- `service/bin/simpleApi.js:154`
- `service/bin/simpleApi.js:329`
- `service/bin/simpleApi.js:350`
- `service/bin/simpleApi.js:358`

问题：

`getAccessHash(password)` 使用固定盐生成确定性 SHA-256 值，`/access/verify` 又把该值返回给客户端。这个 token 没有过期时间、签名上下文、设备维度或撤销机制，实际等价于“密码的可复用通行证”。同时接口支持 `access_token` 查询参数，token 容易进入浏览器历史、反向代理日志、访问日志、Referer、截图或分享链接。

建议：

- 不要把密码哈希当访问 token 使用。
- `/access/verify` 成功后只设置 `httpOnly` cookie，响应体不返回 token。
- 移除 `access_token` 查询参数通道，瓦片请求只接受 cookie 或受控的服务端会话。
- 使用带过期时间的服务端会话或 HMAC/JWT 类 token，签名密钥来自配置，不从密码派生。
- 将 cookie 过期时间与服务端 token 过期时间绑定；密码变更后应能失效旧 token。
- HTTPS 部署下设置 `secure: true`，并明确生产环境代理场景下的 `trust proxy`/`X-Forwarded-Proto` 处理。

### 3. 未授权密码验证接口缺少限流，容易被暴力尝试

位置：

- `service/bin/simpleApi.js:335`
- `service/bin/simpleApi.js:345`

问题：

`/access/verify` 是公开接口，错误密码直接返回 403，没有 IP、会话、账号维度的失败次数限制，也没有退避延迟。访问密码通常由管理员手动设置，强度不可控，缺少限流会扩大暴力破解风险。

建议：

- 对 `/access/verify` 增加 IP + User-Agent 或 IP + cookie 维度的失败计数和冷却时间。
- 记录失败次数，但避免记录明文密码。
- 管理后台保存访问密码时增加最小长度与复杂度提示，例如至少 10 或 12 位。

## 中优先级问题

### 4. 首页访问状态检查失败时默认放行，和“锁屏阻断”语义不一致

位置：

- `src/main.js:110`
- `src/main.js:118`
- `src/main.js:120`

问题：

`/access/status` 请求失败时，前端直接调用 `initLeafletMap()`。虽然瓦片代理仍会在服务端拦截未授权请求，但首页交互、地图初始化、高德 JSAPI 加载等流程会被放开，和“开启后首页以锁屏阻断”的行为预期不一致。若状态接口因异常、代理缓存、部署路径错误或临时 500 失败，用户看到的会是未锁定页面或异常地图，而不是明确的锁屏/错误状态。

建议：

- 状态检查失败时 fail closed：显示锁屏或专门的“访问状态检查失败，请重试”界面。
- 提供重试按钮，不自动初始化地图。
- 只在服务端明确返回 `required: false` 或已验证时初始化地图。

### 5. 测试只覆盖设置类，未覆盖公开接口和瓦片拦截边界

位置：

- `tests/admin.test.js:361`

问题：

新增测试覆盖了 `AdminSettings` 的读写、密码校验和 token 校验，但没有覆盖以下关键行为：

- 未授权请求 `/api/v1/tiles/relay` 应返回 401。
- 授权后瓦片代理应放行。
- `/api/v1/access/status` 在有/无 cookie 时返回正确状态。
- `/api/v1/access/verify` 成功时 cookie 属性符合预期，失败时不设置 cookie。
- 密码修改后旧 token/cookie 应失效。

建议：

- 增加 express 路由级集成测试，避免只验证底层类而漏掉路由注册、cookie 解析、响应格式和鉴权边界。
- 对异常 cookie、缺少 body、错误密码等场景补充回归用例。

## 低优先级问题

### 6. 禁用访问控制不会清除旧密码，管理后台也缺少显式清除入口

位置：

- `src/admin/dashboard.js:186`
- `service/bin/admin/settings.js:58`

问题：

管理后台禁用访问控制时只提交 `{ enabled: false }`，服务端会保留原密码。之后重新启用时，即使不输入新密码，也会继续使用旧密码。这可能是有意保留配置，但从安全与可理解性看，管理员缺少“清除访问密码”的明确动作。

建议：

- 在 UI 中增加“清除访问密码”或“禁用时清除密码”的明确选项。
- 若保持当前行为，应在后台文案中说明禁用不会删除已保存密码。

### 7. `getCookie` 对畸形 URL 编码 cookie 不够健壮

位置：

- `service/bin/simpleApi.js:46`
- `service/bin/simpleApi.js:49`

问题：

`decodeURIComponent` 遇到非法编码会抛出异常，导致 `/access/status` 或 `/tiles/relay` 返回 500。虽然这不是授权绕过，但会让恶意或损坏 cookie 造成不必要的服务端错误。

建议：

- 用 try/catch 包裹 cookie 解码，非法值按空 token 处理。
- 或改用成熟 cookie 解析库，避免正则解析边界问题。

## 建议的修复顺序

1. 重做访问密码存储与 token 方案：密码只存哈希，访问 token 改为带过期的签名会话，去掉 URL token。
2. 为 `/access/verify` 增加限流和密码强度校验。
3. 将前端访问状态检查改为失败时阻断，并提供重试。
4. 增加接口级集成测试，覆盖公开访问控制流程和瓦片代理拦截。
5. 补充管理后台“清除密码/禁用保留密码”的交互说明。
