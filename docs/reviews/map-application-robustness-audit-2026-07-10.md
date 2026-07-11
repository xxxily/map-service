# 地图应用健壮性与持续可用性审查报告

## 文档状态

| 项目 | 内容 |
| --- | --- |
| 审查日期 | 2026-07-10 |
| 审查基线 | Git 提交 1e63167，package 版本 1.4.32；代码证据以 2026-07-10 22:35 前后的审查快照为准 |
| 审查范围 | 2D/3D 地图、定位、路线、KML、PWA、管理后台、后端 API、鉴权、图源、瓦片转发与缓存、预缓存、持久化、部署、恢复、监控、测试和文档契约 |
| 总体结论 | **REQUEST CHANGES：当前不能认定为已达到地图应用长期持续可运行、故障可恢复和核心功能始终可信的要求** |
| 风险数量 | P0 2 项、P1 25 项、P2 23 项 |
| 文档用途 | 作为后续整改 Agent 的任务来源、依赖说明和验收基线 |

相关专项需求：

- [持续定位长期运行可靠性需求](../requirements/continuous-location-reliability.md)
- [完整地图应用需求](../requirements/full-featured-map-application.md)
- [API 契约](../api.md)

### 审查快照和并发改动边界

- 报告的已证实代码发现以提交 1e63167 及各专项审查读取时的文件内容为准。审查期间另有 Agent 持续修改工作区，文件行号后续可能移动；风险关闭必须依据整改后的独立复核，不以当前 dirty 状态推断。
- 初始已存在且本报告未修改的并发文档为 docs/requirements/README.md、docs/requirements/full-featured-map-application.md 和新增的 docs/requirements/continuous-location-reliability.md。
- 审查进行中又出现 src/map/geolocation.js、src/map/location.js、src/map/kml.js、src/map3d/location.js、src/map3d/kml.js、tests/geolocation.test.js 的修改，以及 src/map/continuous-location.js、src/map/location-keepalive.js、src/map/location-lifecycle.js、tests/continuous-location.test.js、tests/location-keepalive.test.js 等新增文件。这些不是本报告交付内容，本报告未回退、覆盖或完整验证它们。
- 本报告自身只新增 docs/reviews/map-application-robustness-audit-2026-07-10.md，并更新 docs/changelog.md。

## 一、执行摘要

项目已有可工作的主要功能、78 项自动化测试、生产依赖零已知漏洞、受控图源 ID、公开 catalog 字段裁剪、瓦片坐标校验和基础 stale cache 回退，因此本次结论不是“应用完全不可用”。问题在于：现有成功路径覆盖无法证明它在长时间运行、弱网、上游异常、磁盘压力、进程重启、数据损坏、并发请求或恶意输入下仍然正确。

本次审查确认了五条会直接影响地图核心价值的风险链：

1. **控制面失守链**：生产漏配时使用 admin/admin 和公开固定签名密钥；管理密码又以明文保存，登录无限流、注销不撤销 Token。控制面一旦失守，可进一步修改图源、代理、Key、发布项和缓存策略。
2. **运行态数据丢失链**：关键配置集中在被 Git 忽略的 .db/admin；JSON 损坏会静默回退并可能覆写默认值；部署备份明确排除 .db，缺少格式版本、迁移、异机备份和恢复演练。
3. **地图持续运行失效链**：固定 200 米漂移阈值会锁死正常驾车/高铁定位；定时器允许定位请求重叠，停止后的旧回调仍可写入；高德 Promise 和前端关键 fetch 没有应用层 deadline，界面可能永久白屏或“显示运行、实际停止”。
4. **磁盘与主进程耗尽链**：瓦片缓存无容量上限、磁盘水位或自动淘汰；Key 计数和公开访问日志在请求主链路整文件重写；预缓存、在线瓦片、缓存扫描和管理请求共享单进程，异常上游可持续写盘或占用堆。
5. **发布与恢复失控链**：PM2 配置在 ESM 项目中不能冷启动；应用每小时自行 git pull -f，并与 PM2 watch、部署 reload 叠加；单实例每日强制重启却没有优雅停机；健康检查固定返回 ok，无法证明新版本、catalog、状态目录和磁盘真实可用。

其中 P0-01 的实际外部暴露程度、共享缓存是否存在、线上文件权限和生产反向代理配置仍需现场核验；但这些不确定性不影响代码层风险成立。未发现已被利用的证据。

## 二、优先级定义

| 等级 | 定义 | 处置要求 |
| --- | --- | --- |
| P0 | 可直接导致管理权限失守、安全控制失效或关键数据被静默覆盖，且默认/损坏路径可触发 | 立即核验线上状态并止血；未完成前不得扩大暴露面 |
| P1 | 可导致核心地图不可用、错误导航、数据丢失、严重资源耗尽、部署失败或高影响安全边界绕过 | 作为下一整改周期阻断项，必须有自动化故障验收 |
| P2 | 中等影响的健壮性、兼容性、可维护性、观测性和工程门禁缺口 | P0/P1 稳定后按工作包收敛，不应长期遗留 |

## 三、P0：立即处置

### P0-01 生产漏配会启用公开默认管理员凭据和固定 Token Secret

证据：

- service/config.js:8-9 默认监听所有 IPv6/IPv4 接口。
- service/config.js:46-49 默认管理员账号密码为 admin/admin，Token Secret 为代码内固定字符串。
- service/bin/admin/auth.js:37-41 再次提供相同回退值。
- service/bin/simpleApi.js:339-343 暴露管理员登录入口，未增加部署级保护。

触发与影响：

- 生产环境遗漏 ADMIN_USERNAME、ADMIN_PASSWORD 或 ADMIN_TOKEN_SECRET 任一配置。
- 攻击者可直接登录；即使管理员密码曾被修改，只要签名密钥仍为默认值，也可能离线伪造管理员 Bearer Token。
- 管理权限可进一步修改图源、代理出口、密钥池、公开发布、缓存和 KML，风险会扩散到 SSRF、数据泄漏和服务中断。

整改要求：

- 非本地环境缺少强随机凭据时必须在监听端口前拒绝启动。
- 默认仅绑定 loopback；生产监听地址必须显式配置。
- Token Secret 至少使用 32 字节随机值，支持版本和轮换；部署系统不得把默认值写入模板。
- 立即核验线上环境变量、历史访问日志和现有 Token，轮换默认或未知来源凭据。

自动化验收：

- NODE_ENV=production 且分别缺少三个变量时，进程均以非零状态退出且端口未监听。
- 使用仓库默认 Secret 签发的 Token 在生产配置下必须被拒绝。
- 启动日志只说明缺少哪个配置，不输出密码或 Secret。

### P0-02 JSON 损坏时静默回退，可能关闭访问控制并覆写关键运行态

证据：

- service/bin/admin/store.js:31-35 把文件不存在、权限失败和 JSON 解析失败统一处理为 fallback。
- service/bin/admin/auth.js:43-57 的 auth.json 失败后会回退到配置凭据。
- service/bin/admin/settings.js:146-163 的 settings.json 在冷启动或首次读取失败后会回退为默认关闭地图访问控制；进程已缓存有效配置时不一定立即降级。
- service/bin/admin/tileCatalog.js:1305-1311 读取 catalog 失败后可能写回默认数据。

触发与影响：

- 进程崩溃、磁盘写满、并发写冲突、手工误编辑或介质故障造成 JSON 截断/损坏。
- 冷启动或首次加载时，管理认证可能回退为 admin/admin，地图访问控制可能被关闭，图源、代理、Key、图层、发布项和任务可能被默认数据覆盖。
- 当前健康检查仍会返回 ok，使安全降级和数据丢失长期不被发现。

整改要求：

- 只有 ENOENT 可视为“尚未初始化”；解析、权限、I/O 错误必须 fail closed。
- 损坏文件只读隔离，保留原件与最近有效快照，禁止自动覆盖。
- 为每类 store 增加 schemaVersion、校验和、迁移和回滚；readiness 在关键 store 不可用时返回 503。
- 在实施任何迁移前先完成 .db 的加密异机备份和一次真实恢复演练。

自动化验收：

- 分别破坏 auth.json、settings.json、tile-sources.json、key-pools.json 后从冷启动执行，断言原文件哈希不变、默认凭据/默认 catalog 不会生效、readiness 返回 503。
- 在写临时文件、fsync、rename 各阶段注入故障，重启后至少能读到最后一个完整版本。
- 从空主机恢复全部图源、图层、代理、Key、发布项、KML、设置和任务。

## 四、P1：高优先级整改

### P1-LOC-01 固定 200 米漂移阈值会永久冻结正常移动轨迹

- **证据**：src/map/location.js:250-275、src/map3d/location.js:320-348；默认间隔分别见 src/map/location.js:105、src/map3d/location.js:114。
- **触发/影响**：15 秒移动超过 200 米约等于 48 km/h，正常驾车就可能被判断为脏点；拒绝后旧锚点不更新，后续真实位置距离更大而被永久拒绝，界面仍可能显示 active。
- **整改**：按采样时间差、accuracy 和最大合理速度动态判断；异常点进入候选态，连续一致的新位置允许重锚；隧道、长时间无信号和生命周期恢复后允许重新定基准。
- **验收**：15 秒间隔下 100 km/h 连续 8 小时、500 km/h 以内移动均持续接受；单个瞬移被拒绝，两个相互接近的新点可恢复。

### P1-LOC-02 定位请求可重叠，乱序和停止后的旧回调仍能写状态

- **证据**：src/map/location.js:281-409,465-498、src/map3d/location.js:354-479,537-569；热编辑又在 src/main.js:434-439、src/3d.js:1615-1621 自行重建 timer。
- **触发/影响**：单次定位可能先等高德约 12 秒再等浏览器约 12 秒，但配置允许 1 秒轮询；没有 single-flight、generation 或取消，旧响应会让位置倒退，stop 后还可能重新创建轨迹并落盘。
- **整改**：统一 2D/3D 定位控制器；watchPosition 优先，轮询降级使用递归 setTimeout 单飞；每次启动、停止和恢复更新 generation，所有异步提交前校验代次和 provider timestamp。
- **验收**：两个 deferred 逆序完成时只提交最新结果；stop 后推进时钟并触发旧回调、权限和生命周期事件，均不得复活会话或创建 KML。

### P1-BOOT-01 前端启动、管理请求和高德定位缺少统一 deadline

- **证据**：src/admin/api.js:16-51、src/map/access-control.js:13-25、src/main.js:202-229、src/3d.js:1032-1065,1153-1163、src/map/geolocation.js:94-113。
- **触发/影响**：半开连接或第三方 SDK 永不回调时，访问检查、catalog、管理页或定位 Promise 永久等待；2D 还在创建 Leaflet 前等待可选高德能力，可能无限白屏且 fallback 永远不执行。
- **整改**：建立带总预算、AbortSignal 和错误分类的统一请求层；访问检查/catalog 明确失败状态和重试；高德搜索异步后挂载，不阻塞核心地图；定位 SDK 再加应用层硬超时和 cooldown。
- **验收**：fetch 和 AMapLoader/定位回调永不 resolve 时，2D/3D 核心仍在约定 SLA 内进入可交互降级页；管理页分区显示错误并可重试。

### P1-TRACK-01 长途轨迹无界增长并反复全量序列化、持久化和重绘

- **证据**：src/map/location.js:102-114、src/map3d/location.js:110-124 默认 0 表示保留全部；src/map/kml.js:1679-1808、src/map3d/kml.js:1595-1734 每轮重建 features、全量 localStorage 写入和全量渲染。
- **触发/影响**：长时间记录会逐渐形成接近 O(n²) 的累计工作量，主线程卡顿并触发 QuotaExceeded；异常只写 console，用户可能误以为轨迹仍安全保存。
- **整改**：设置安全的默认上限，完整轨迹与屏幕实体分离；迁移到 IndexedDB/分段追加，批量节流持久化和增量绘制；配额失败进入可见降级状态并提供导出。
- **验收**：1 万点长跑下内存、实体数、单轮耗时和存储写入量有明确上界；模拟 QuotaExceeded 时用户收到非阻塞错误，内存态和落盘态不被半更新。
- **并发改动说明**：审查快照中已有未提交修改为轨迹 feature 使用稳定 ID 并在覆盖前清理旧索引，这是有效的局部修复，但不解决历史无界、全量序列化和同步 localStorage 问题。

> 并发整改状态（2026-07-10）：工作区已出现持续定位控制器、应用层定位 deadline、动态漂移判断、generation/单飞消费及轨迹渲染/落盘节流的未提交候选实现。本审查未运行其新增测试，且实现仍在并发变动；P1-LOC-01、P1-LOC-02、P1-BOOT-01 的定位部分和 P1-TRACK-01 在独立复核、全量门禁与真实移动端长跑验收前均保持未关闭。

### P1-DIALOG-01 统一弹窗不支持并发，可能把提示点击误当成危险确认

- **证据**：src/ui/dialog.js:27-87 复用同一 root 并覆盖 innerHTML，旧 click/keydown listener 在旧 Promise 关闭前仍存在。
- **触发/影响**：删除确认等待期间，后台 showAlert 覆盖内容；用户点击新提示的“确认”时，旧 confirm listener 也可能 resolve(true)，造成误删任务、KML 或辅助线。
- **整改**：实现全局 FIFO dialog manager，或新对话框打开时明确以 false 结束旧 owner；事件监听和关闭动作绑定实例 token。
- **验收**：showConfirm 后立即 showAlert，点击 alert 后旧 confirm 绝不能得到 true；覆盖键盘 Escape、重复点击、焦点恢复和销毁。

### P1-PWA-01 Service Worker 会串页、长期陈旧并无界缓存

- **证据**：public/sw.js:1 的 CACHE_VERSION 仍为 v1.2.3；public/sw.js:45-67 把所有导航响应写到同一键 /，并缓存全部同源非 API GET。
- **触发/影响**：访问 /、/3d、/admin 后离线可能返回错误入口；非 2xx 也可污染缓存；旧 hash 资源和无限运行时缓存不会淘汰，弱网时有缓存仍可能长期等待网络。
- **整改**：构建时注入版本和 precache manifest；按 pathname 缓存正确 HTML，只缓存成功且白名单资源；增加超时、容量和过期策略，所有 cache.put 纳入 event.waitUntil。
- **验收**：自动化覆盖三个入口、404、首次离线、弱网超时、版本升级和旧缓存清理；任一路由不得返回另一入口 HTML。

### P1-XSS-01 多处可达 innerHTML 边界允许第三方或持久化数据注入

- **证据**：src/map/search.js:66-75,337-343；src/map/kml.js:435-455,630-693；src/map3d/kml.js:465-500,1002-1016；service/bin/admin/sharedKml.js:153-187；src/admin/pages/precache.js:161-193。
- **触发/影响**：搜索/路线 POI 名、sourceName 或未校验的 feature.id 包含引号、标签和事件属性时，可能形成 DOM XSS；恶意管理员可把 payload 持久化并影响公共地图用户。
- **整改**：使用 textContent/createElement 或上下文正确的统一转义；服务端重建允许字段并严格 normalize feature ID；增加 CSP 作为纵深防御。
- **验收**：POI、sourceName、feature.id 使用引号和 img onerror 等 payload，只能显示为文本且事件不执行。

### P1-ROUTE-01 路线响应可错配，浏览器定位坐标系也会造成导航偏移

- **证据**：src/map/search.js:256-357 从全局起终点发起请求且回调再次读取全局；src/map/geolocation.js:123-132 返回 WGS84，src/map/search.js:660-678 未转换便交给高德 Driving。
- **触发/影响**：用户快速把 A→B 改成 A→C，旧响应最后返回时可能出现“线条 A-B、摘要/导航 A-C”；高德定位失败而浏览器定位成功时，中国境内起点可能偏移数百米。
- **整改**：请求时捕获不可变起终点快照和 requestId，只允许最新响应提交；浏览器位置在进入高德标记和路线前统一转换为 GCJ-02。
- **验收**：Driving 回调逆序时只显示最新路线；browser-only 广州坐标断言传入 Driving 的是转换后坐标。

### P1-SSRF-01 图源、矢量派生资源和重定向可绕过现有 SSRF 检查

- **证据**：service/bin/admin/tileCatalog.js:142-224,1917-1928；service/bin/middleware/fetchRelay/index.js:220-252,345-353。
- **触发/影响**：现有逻辑只检查少量字符串网段和首个 subdomain，未锁定 DNS 解析、IPv6/映射地址、全部 subdomain、hostname 占位符和每次重定向；可访问 metadata、本机或内网管理面。
- **整改**：建立唯一 safe-fetch；仅 http/https、禁止 userinfo，解析全部 A/AAAA 并拒绝非公网 IP，固定安全 lookup；每次重定向重新验证；所有 origin 必须由服务端配置决定，scale 等用户变量只允许安全枚举。
- **验收**：覆盖 IPv4/IPv6、IPv4-mapped IPv6、DNS rebinding、302 跳转、第二 subdomain、hostname 占位符和代理场景。

### P1-AUTH-01 管理密码明文、会话不可撤销、弱口令和登录爆破缺少防护

- **证据**：service/bin/admin/auth.js:45-50,89-99,136-150；service/bin/simpleApi.js:339-352；service/bin/admin/settings.js:7。
- **触发/影响**：.db、备份或同机低权限账号泄漏可直接获得管理密码；注销和改密不使旧 Token 失效；最短 4 位且登录无限流。
- **整改**：使用 scrypt/Argon2 哈希管理员密码；引入 authVersion/jti 和撤销机制；限制 TTL，改密和注销撤销旧会话；密码至少 10–12 位并增加多维限流和审计。
- **验收**：落盘无明文；改密、注销后旧 Token 立即失效；持续错误登录被限流；超长 TTL 和弱密码被拒绝。

### P1-STORE-01 AdminStore 并发写会碰撞且敏感文件权限不受控

- **证据**：service/bin/admin/store.js:39-45 的临时名只有 pid 和 Date.now；写文件未显式设置 0600，目录未显式设置 0700；service/bin/admin/auth.js:148-149、service/bin/admin/tileCatalog.js:783,916 会落盘管理密码、代理密码和图源 Key；service/bin/admin/sharedKml.js:153-201 存在独立 read-modify-write。
- **触发/影响**：同一毫秒对同 store 并发写可共用临时路径，造成 ENOENT、更新丢失或损坏；默认 umask 0022 下敏感 JSON 通常为 0644，本地现场也观察到 .db/admin 文件为 0644，同机其他用户可能读取秘密。
- **整改**：随机临时名；按 store-name 串行事务，写临时文件后 fsync、rename、fsync 目录；使用 revision/乐观锁或迁移 SQLite；目录强制 0700、敏感文件 0600，并迁移已有权限。
- **验收**：100 个并发写无丢失或异常；每个写入阶段故障后旧版本仍可读；在 umask 0022 下创建/迁移后最终权限仍为 0600，普通同机用户不可读。

### P1-CACHE-01 Cookie 保护的瓦片仍声明可被共享缓存公开复用

- **证据**：service/bin/simpleApi.js:58-69,239-255,695-714 固定返回 Cache-Control: public，且没有按认证状态区分。
- **触发/影响**：存在 CDN、反向代理或企业共享缓存时，先由授权用户请求的瓦片可能被同 URL 的未授权请求命中。
- **整改**：Cookie/Token 保护资源使用 private, no-store，或在可信边缘先鉴权并使用隔离缓存键；不能依赖高基数 Vary: Cookie 作为唯一方案。
- **验收**：模拟共享缓存，先授权后无 Cookie 请求，后者不得获得前者响应。

### P1-CACHE-02 缓存键未隔离认证上下文，同键 miss 无 single-flight 且提交非原子可见

- **证据**：service/bin/middleware/fetchRelay/index.js:92-96,125-132,179-183,238-243,291-319,380-387。
- **触发/影响**：同 URL 不同 Authorization/header Key 可能串缓存；热点首次访问会并发回源；body 已可见而 meta 未完成时，另一请求可能删除 body，留下 orphan 或间歇 5xx。
- **整改**：缓存 scope 纳入 source/resource ID 和内容相关认证头的不可逆身份摘要；每 key single-flight/互斥；随机临时名、异常清理和完成标记/目录版本实现原子提交。
- **验收**：不同 Authorization 不共享；100 并发同 key 只回源一次；在每个 pipeline 阶段注入故障后无残留、旧缓存仍可读。

### P1-CAP-01 上游响应、缓存总量和磁盘水位均无硬边界

- **证据**：service/config.js:18-34；service/bin/middleware/fetchRelay/index.js:272-320,514-653；service/bin/service.js:121-126,227-231；service/bin/admin/tileCatalog.js:2671-2691。
- **现场信号**：本地 .cache 约 5.7 GB、446,590 个文件，并有 25 个临时文件残留；该容量不是生产数据，但证明实现不会因 TTL 自动回收。
- **触发/影响**：异常上游返回巨大/无尽响应、大量唯一瓦片或超大预缓存任务，可耗尽磁盘或堆；随后日志、缓存和 .db 写入会一起失败。
- **整改**：按资源类型限制 Content-Length 和流式实际字节；设置总字节/文件数、磁盘高低水位、LRU/过期 janitor、临时文件启动清理和客户端断开取消上游。
- **验收**：超限响应被中止且无临时文件；小配额测试能稳定淘汰；ENOSPC 进入只读/降级而不是损坏 store；百万级统计有 p95 和内存预算。

### P1-RATE-01 公开限流信任可伪造字段且 Map 无界增长

- **证据**：service/bin/simpleApi.js:17,101-145,550-570,1715,1778；service/bin/admin/tileCatalog.js:1274,2289-2311。
- **触发/影响**：变化 User-Agent 或伪造 X-Forwarded-For 可绕过限制；高基数头导致 Map 常驻增长；scrypt 验证可耗尽 libuv 线程池。
- **整改**：明确可信代理并使用规范化客户端 IP；在昂贵哈希前设置全局、IP、账号/发布项多维限流；使用 TTL/LRU 清理，多实例时迁移共享限流存储。
- **验收**：变化 UA/XFF 不绕过全局限制；代理场景识别真实 IP；推进虚拟时钟后 Map 自动回收。

### P1-LOG-01 日志和错误响应会泄漏 query Token、Key 和内部路径

- **证据**：service/bin/visitRecorder.js:29-40；service/bin/simpleApi.js:22-35,323-325,1425-1429,1864-1871；service/bin/middleware/fetchRelay/index.js:390。
- **触发/影响**：外部发布 token 位于 query，Morgan 记录原始 URL；错误和 stale 日志输出完整上游 URL，内部 error.message 又可能直接返回客户端。
- **整改**：结构化日志只记录 pathname、受控 ID 和脱敏 query；统一覆盖 token/key/tk/appid/password/signature、userinfo 和路径型密钥；对外使用稳定中文错误码，详情仅以 requestId 写内部日志。
- **验收**：捕获访问日志、console 和 API 错误响应，各种大小写、编码和 userinfo 形式均不出现明文秘密或绝对路径。

### P1-IO-01 Key 选择和公开访问日志在每个瓦片请求中整文件重写

- **证据**：service/bin/admin/tileCatalog.js:1979-2000,2532-2566；service/bin/simpleApi.js:1759-1767,1820-1828。
- **触发/影响**：带 Key 图源每个请求都会等待 key-pools.json 写入；不存在发布项或错误 Token 也会触发访问日志整数组写盘，攻击流量可放大 I/O、并发写冲突和瓦片延迟。
- **整改**：配置与运行计数分离；使用内存/SQLite 原子计数并批量刷盘；日志改追加式或队列批处理，失败采样且不可阻塞瓦片主链路。
- **验收**：高并发缓存 HIT 不产生逐请求 JSON 写；错误 Token 洪泛下写速率和文件大小有界，正常瓦片 p95 不明显退化。

### P1-PRECACHE-01 预缓存执行和清理没有真正复用图源目录契约

- **证据**：service/bin/admin/precache.js:340-383,388-504,625-651,829-884；service/bin/service.js:41-50。
- **触发/影响**：新进程 catalog 尚未加载，自定义/动态图源、代理、Header Key 和模板覆盖可能创建任务但执行时退回硬编码 provider；清理也可能找不到实际 URL。
- **整改**：PrecacheManager 初始化时 await catalog；任务保存 sourceId 和配置版本；执行、重试和清理统一调用 createSourceTileRequest/fetchTileSource 并传递 tile 上下文。
- **验收**：覆盖冷启动首次 catalog、自定义图源、Header/Bearer Key、代理池、模板更新、动态/组合图层和删除缓存的端到端测试。

### P1-UPSTREAM-01 代理池/Key 池宣称的 failover 和重试未进入实时请求路径

- **证据**：service/bin/admin/tileCatalog.js:817-820,961-962,2052-2055；service/bin/service.js:167-181。
- **触发/影响**：首个代理或 Key 临时失败时，即使池内仍有健康成员也直接失败；后台配置给出错误的可靠性预期。
- **整改**：服务层实现带总 deadline 的幂等重试、错误分类、成员 cooldown、指数退避和熔断；确定性 4xx 不重试，严格限制总尝试数。
- **验收**：首代理/Key 失败后切换成功；全部失败有界返回；cooldown 可恢复；fallbackToDirect=false 时绝不直连。

### P1-PM2-01 PM2 冷启动配置与 ESM 不兼容

- **证据**：package.json:7 声明 type=module，pm2.config.js:55 使用 module.exports；package.json:17-21 和 docs/development.md:42 又依赖该配置。
- **复现**：node pm2.config.js 报 ReferenceError: module is not defined in ES module scope。
- **影响**：新机部署、PM2 列表丢失或灾备恢复时，项目文档规定的启动入口不可执行；现有 reload 只能依赖已经存在的应用。
- **整改/验收**：改为 pm2.config.cjs 或等价有效配置并同步脚本、文档；在无现存 PM2 应用的干净环境完成启动、重启、reload、save/resurrect 和健康检查。

### P1-DEPLOY-01 应用自行拉代码并与 PM2 watch、部署 reload 形成版本漂移

- **证据**：service/bin/cronJob/autoPullProjectCode.js:21-30、service/bin/cronJob/index.js:30-44、pm2.config.js:1-22、deploy-66.sh:141-155。
- **触发/影响**：每小时 git pull -f 没有同步依赖安装和构建；代码、文档或 lockfile 变化可由 watch 提前触发重启，正式部署又显式 reload，形成混合版本和多次切换。
- **整改**：生产移除应用内拉代码并关闭 watch；唯一发布流水线部署不可变 artifact，通过原子软链、蓝绿或等价方式切换。
- **验收**：普通 push 不改变线上版本；部署持续压测无静态资源 404/5xx；依赖源中断时旧 release 继续运行且能离线回滚。

### P1-LIFE-01 单实例每日强制重启但没有优雅停机和长任务恢复

- **证据**：pm2.config.js:14-15,48-49；service/index.js:126-134；service/bin/admin/precache.js:304-321。
- **触发/影响**：03:05 重启或部署 reload 会截断活动瓦片流和管理请求；queued/running 等预缓存任务只被标记 interrupted，不自动恢复；单进程、单主机、本地磁盘仍是单点。
- **整改**：保存 server handle，处理 SIGTERM/SIGINT；停止接收新请求、等待在途流、持久化/暂停任务并超时强退；取消“用每日重启治理资源”的做法。
- **验收**：长瓦片流和预缓存运行时 reload，无非预期请求失败，任务自动安全恢复；信号级自动化测试覆盖连接 drain 和 deadline。

### P1-HEALTH-01 健康检查固定 ok，部署可能由旧进程或坏实例误报成功

- **证据**：service/bin/simpleApi.js:264-270,526-531；service/index.js:29-61；deploy-66.sh:96-102,154-161；service/bin/admin/tileCatalog.js:1277-1303。
- **触发/影响**：构建缺失、状态目录不可写、catalog 损坏、磁盘将满或新实例未启动时仍可返回 ok；200ms 自探测还可能把旧进程当成“当前实例已存在”。
- **整改**：分离 liveness、readiness 和外部 synthetic probe；readiness 等待核心 manager 初始化并检查构建清单、store、cache 和磁盘；返回 build commit/version，部署退避重试并核对版本。
- **验收**：删除入口文件、破坏 store、只读 dataDir、低磁盘水位和旧版本占端口时 readiness/部署结果必须正确失败，liveness 仍能区分进程状态。

### P1-BACKUP-01 .db 无版本化备份、迁移或可验证恢复

- **证据**：service/config.js:43-55、docs/architecture.md:75-84、deploy-66.sh:105-134 明确显示关键状态位于 .db/admin 且代码备份/回滚排除 .db。
- **触发/影响**：主机、磁盘或单文件故障会丢失图源、图层、代理、Key、发布项、KML 和任务；新版本改写数据后，旧代码回滚也没有兼容保障。
- **整改**：定义 RPO/RTO；加密异机版本化备份、校验和和保留策略；每次数据格式升级前创建快照，提供向前迁移和失败回滚。
- **验收**：从空主机恢复全部关键状态；季度自动恢复演练；升级夹具验证代码和数据一起前滚/回滚。

### P1-TEST-01 自动化测试导入生产 singleton 并改写真实 .db

- **证据**：service/bin/service.js:23-53、service/bin/admin/precache.js:284-321；tests/accessApi.test.js:6 等测试直接导入 singleton；package.json:15 使用默认并行 node --test。
- **本次实证**：执行 npm test 后，.db/admin/precache-tasks.json 在 2026-07-10 22:35:51 +0800 被重写为 3 字节；该文件被 Git 忽略，普通工作区检查不会发现。
- **影响**：本地或部署前测试可能中断真实预缓存任务，多测试进程还会并发写相同 store；质量门禁本身成为数据破坏源。
- **整改**：改为 createService(config, dependencies) 工厂；测试强制注入独立临时 dataDir/cacheDir；测试环境解析到仓库 .db 时立即失败。
- **验收**：测试前后工作区 .db 哈希完全一致；并行用例只写各自临时目录；CI 和 deploy 测试均通过隔离回归。

## 五、P2：中优先级加固

### P2-KML-01 KML 输入和服务模型缺少完整边界

- **证据**：src/map/kml-format.js:1-65、src/map/kml.js:1182-1217、src/map3d/kml.js:1175-1208、service/bin/admin/sharedKml.js:153-201、service/bin/simpleApi.js:654-676。
- **风险**：本地导入没有字节、要素和顶点上限；空线/面、Infinity 和越界坐标可进入渲染；服务端 status、coordCorrection、features 基本原样接受，10 MB 文本可膨胀为大量对象，并发 read-modify-write 会丢更新。
- **整改/验收**：统一严格 schema、有限值和经纬范围、几何最小点数、字段/要素/顶点预算、revision/If-Match；大文件移 Worker 解析并事务提交。测试覆盖伪装文件、空几何、Infinity、越界、超量、QuotaExceeded 和并发冲突。

### P2-3D-01 3D 定位失败路径会调用未导入的 showAlert

- **证据**：src/map3d/location.js:1-12,354-361。
- **风险**：定位拒绝时原错误被 ReferenceError 覆盖，形成未处理 Promise。
- **整改/验收**：补齐统一弹窗依赖并测试定位 reject 后有可见提示、Promise 不泄漏。

### P2-URL-01 URL 状态校验不足且定位写入会丢失其他状态

- **证据**：src/3d.js:1214-1264 只判 NaN；src/map/url-state.js:3-52 未完整校验范围；src/map/location.js:221-225,510-513 使用 replaceState 覆盖 query。
- **风险**：Infinity/越界参数可让 Cesium 初始化抛错；定位拖动会丢 layer、editPublicKml、其他 query 和 hash。
- **整改/验收**：统一 map-view schema、范围 clamp/fallback 和 URLSearchParams 更新；参数化测试 NaN、Infinity、越界、超长和状态保留。

### P2-KML-02 KML 富内容请求控制器存在乱序竞态

- **证据**：src/map/kml-content-panel.js:254-269,367-390。
- **风险**：旧请求 finally 可清空新 controller，第三次选择无法取消第二次，旧详情可能覆盖当前点位。
- **整改/验收**：按 controller identity 清理并增加 selection requestId；三请求逆序测试只允许最新结果提交。

### P2-KML-03 2D 私人 KML 首次渲染被公共接口耦合

- **证据**：src/map/kml.js:72-102,1136-1145；3D 的 src/map3d/kml.js:1558-1566 已先渲染本地数据。
- **风险**：共享列表请求慢或挂起时，本地离线 KML 也不显示。
- **整改/验收**：2D 与 3D 一致，先渲染本地、公共数据独立加载；shared fetch 永不 resolve 时本地图层仍立即可见。

### P2-TILE-01 底图瓦片失败没有健康状态、熔断或事务式回退

- **证据**：src/map/layers.js:59-86；src/3d.js:1166-1193。
- **风险**：catalog 成功但上游 403、限额或超时时，2D/3D 可长期白屏；切层时先删除旧层又放大失败影响。
- **整改/验收**：聚合 tileerror/errorEvent、保留旧层直到新层首瓦片成功、显示健康状态并支持受控 fallback/circuit breaker；注入 404、慢瓦片和间歇错误。

### P2-ADMIN-01 管理首页一个非核心接口失败会丢弃其余成功结果

- **证据**：src/admin/dashboard.js:111-177 使用 13 个请求的 Promise.all；通用请求又无 deadline。
- **风险**：任一统计或非核心端点失败会使整个后台不可用或空白。
- **整改/验收**：session 先行、分区 allSettled、局部错误和独立重试；逐个端点故障时其他区域仍可操作。

### P2-LAYER-01 前端对 catalog 默认层 invariant 缺少防御

- **证据**：src/map/layers.js:210-238 在无 default、URL 和缓存匹配时仍可能对 undefined 调用 addTo。
- **风险**：配置迁移或损坏返回“有可渲染层但无默认层”时，地图初始化失败。
- **整改/验收**：回退到首个可用层并显示配置告警；畸形 catalog 契约测试不得抛错。

### P2-A11Y-01 KML 导入文案与交互不一致且键盘不可用

- **证据**：index.html:127-132、3d.html:190-195、src/map/kml.js:1178-1218、src/map3d/kml.js:1171-1209。
- **风险**：导入区是不可聚焦 div，代码没有 drop/dragover，既不支持键盘也不支持文案宣称的拖拽；弹窗缺少完整焦点陷阱和恢复。
- **整改/验收**：使用 button/label 或正确键盘语义，实现真实拖拽；axe 和纯键盘 E2E 覆盖导入、弹窗和 choice。

### P2-STORAGE-01 localStorage 访问和旧数据结构并非全面容错

- **证据**：src/map/location.js:102-110、src/map3d/location.js:110-124 在模块顶层直接读存储；KML/guideline 仅做部分容器校验。
- **风险**：隐私模式或禁用存储抛 SecurityError 时整个模块加载失败；合法 JSON 但坏 schema 可在渲染阶段崩溃。
- **整改/验收**：统一安全 storage adapter、schema normalize/migrate/quarantine；模拟 getter 抛错和多版本坏数据时核心地图仍启动。

### P2-SUPPLY-01 客户端密钥和运行时第三方脚本缺少可控交付

- **证据**：src/config.js:1-4 硬编码高德 key/security code；src/map/layers.js:308-315 运行时从 unpkg 加载截图脚本且无 SRI、deadline。
- **风险**：密钥难以按环境轮换；离线或 CDN 故障使截图失败，供应链被攻陷等同执行第三方脚本，失败又只写 console。
- **整改/验收**：密钥环境化并按供应商要求限制来源、轮换；截图依赖纳入构建或本地托管；CSP 下离线测试、加载失败提示和并发去重。

### P2-PERF-01 首包体积过大，弱网和低端设备启动脆弱

- **证据**：本次构建 main JS 约 1.15 MB，3D JS 约 4.14 MB，Vite 报 chunk 体积警告。
- **风险**：3G、弱 CPU 或内存压力下首启、解析和执行时间明显增加，放大白屏和页面被系统回收概率。
- **整改/验收**：为各入口设置传输/解析/执行预算，动态加载搜索、KML、管理和 Cesium 可选能力；低端移动档 WebPageTest/Lighthouse 进入 CI 趋势监控。

### P2-HEADERS-01 缺少统一浏览器安全头

- **证据**：服务入口未统一设置 CSP、HSTS、Permissions-Policy、frame-ancestors 等，Express 默认标识也未关闭。
- **风险**：XSS、点击劫持、第三方脚本和敏感浏览器能力缺少纵深约束。
- **整改/验收**：根据 2D/3D/高德/Cesium 实际资源形成最小 CSP，生产 HTTPS 启用 HSTS，收紧定位等权限；自动测试各入口和 API 响应头。

### P2-API-01 错误响应格式、状态码和内部信息不一致

- **证据**：service/index.js:67-71 的 body parser 位于路由包装前；service/bin/simpleApi.js:22-35,404,660-665,1864-1871。
- **风险**：畸形/超限 JSON 走 Express HTML，Multer 超限常变成 500，URL 解码异常变 500，error.message 可能泄漏内部细节。
- **整改/验收**：最终 404/错误中间件统一 jsonErr 和中文稳定错误码，正确映射 400/401/403/404/409/413/429/502/503/504；故障矩阵验证不回传内部路径。

### P2-CORS-01 CORS 白名单使用字符串包含匹配

- **证据**：service/cors.conf.js:8-15。
- **风险**：功能启用后，相似域名如受信域名加 attacker.example 后缀可能通过。
- **整改/验收**：解析 Origin，按完整 hostname 或点边界子域精确匹配，拒绝 null 和非 http/https；覆盖合法子域、lookalike、端口和大小写。

### P2-STATIC-01 无 hash 的 Cesium 资源被缓存一年且 immutable

- **证据**：service/index.js:86-102。
- **风险**：升级 Cesium 后旧主文件、Worker、Widgets 和新应用混用，3D 地图可长期白屏。
- **整改/验收**：使用版本化资源目录/manifest；只有内容 hash 文件 immutable，无 hash 资源短缓存或协商缓存；做跨版本浏览器缓存升级测试。

### P2-CONFIG-01 启动配置校验和重型任务资源隔离不足

- **证据**：service/config.js:8-9,43-55；service/index.js:64-134；预缓存并发可到 64，在线瓦片、缓存统计和任务共享事件循环。
- **风险**：非法端口、不可写目录和弱生产配置不能 fail-fast；预缓存/全量扫描可拖慢在线瓦片。
- **整改/验收**：统一 normalize/validate 配置，在监听前校验目录、凭据和磁盘；建立全局上游 semaphore/优先级，重任务迁移 worker。并发压测下在线瓦片 p95 和错误率满足 SLO。

### P2-OBS-01 缺少可关联的日志、指标、告警和日志轮转定义

- **证据**：service/config.js:16 默认 debug=false，service/bin/simpleApi.js:1864-1871 的通用异常只在 debug 下记录；仓库无 request ID、metrics 或告警配置。
- **风险**：上游退化、磁盘将满、缓存命中下降、任务卡死和重启只能靠人工发现；本地访问日志已约 125 MB，仓库也未定义轮转。
- **整改/验收**：脱敏结构化日志和 requestId；暴露错误率、延迟、上游、缓存、磁盘、任务、事件循环指标；为 500、超时、低水位、重启建立告警并进行演练。

### P2-CI-01 质量检查覆盖不全且没有仓库级 CI

- **证据**：package.json:16 仅手工列举 node --check 文件，遗漏 pm2、cron、sharedKml 等；存在 ESLint 配置但未安装 ESLint；仓库无 CI workflow。
- **风险**：已经失效的 PM2 配置仍可通过 npm run check；新增源文件容易漏检，测试隔离、构建和安全审计没有合并门禁。
- **整改/验收**：动态覆盖全部源码和运行配置，引入 ESLint、shellcheck、覆盖率和契约检查；CI 执行 check、test、build、prod/all audit、冷启动和关键浏览器故障测试。

### P2-DOC-01 OpenAPI、API、需求、架构和 changelog 存在漂移

- **证据**：service/bin/simpleApi.js:210-291 的 OpenAPI 只有路径/200 且被 jsonSuc 包装；docs/api.md 漏多条已注册路由；需求中存在未实现或路径不同接口；docs/architecture.md 仍写旧 panels 目录；package 1.4.32 而 changelog 最新版本条目为 1.4.8。
- **风险**：前后端和后续 Agent 依据不同契约实现，错误会在集成阶段才出现。
- **整改/验收**：选定唯一契约源，生成可直接校验的 OpenAPI；每路由写清鉴权、请求、响应、错误和 schema；需求标明规划/部分实现/已完成/废弃，CI 检查路由与文档差异。

### P2-RELEASE-01 生产运行和回滚不可复现，过度依赖在线 registry

- **证据**：deploy-66.sh:105-155 在发布和回滚都在线 npm ci 且原地修改 release；PM2 未在依赖中固定；仓库无容器或主机 provisioning 定义；deploy-66.sh 还被本地 .git/info/exclude 忽略，需确认是否受版本控制。
- **风险**：registry 故障时发布失败，回滚再次依赖同一故障源；原目录可能处于依赖中间态，生产逻辑难审计。
- **整改/验收**：CI 生成含生产依赖、构建物、commit 和校验清单的不可变 release，保留上一完整版本；干净主机仅凭受控 artifact 和机密即可部署，断网时可直接回滚。

### P2-DEPS-01 依赖治理未自动化

- **证据**：生产 npm audit 为 0；完整 audit 在 nodemon→chokidar 链发现 braces@3.0.2 和 picomatch@2.3.1 的高危开发期通告；axios、cesium、fs-extra、vite 有补丁更新；仓库无 SBOM/Dependabot/Renovate。
- **风险**：开发工具风险和补丁升级依赖人工发现，地图渲染兼容回归也没有固定流程。
- **整改/验收**：升级或 override 开发链，分别审计生产/完整依赖，生成 SBOM；定期小批量更新并运行 2D/3D 渲染、离线和缓存升级回归。

### P2-PRECACHE-01 超大预缓存任务和诊断探测缺少最后安全边界

- **证据**：service/bin/admin/precache.js:499-508 允许超过 maxTiles；service/bin/admin/tileCatalog.js:1689-1720,2658-2708 的 Key/图源测试未完整使用真实请求头和矢量资源链，并读取无界 arraybuffer。
- **风险**：误操作可创建超出磁盘预算的任务；后台“测试成功/失败”与真实图源行为不一致。
- **整改/验收**：保留业务允许的软提示，但增加不可绕过的磁盘预算、最大安全瓦片数、任务 deadline 和低水位暂停；诊断按真实 Key/代理/资源类型探测且有响应大小上限。

## 六、已有的有效控制

以下基础应在整改中保留，避免为了重构而回退：

- 现有 78 项 node:test 在本次运行中全部通过，说明已有成功路径和部分安全边界回归基础。
- 审查到的 /api/v1/admin 路由除登录外均使用 requireAdmin。
- 地图访问密码已使用随机 salt + scrypt；访问 Cookie 具备 HttpOnly 和 SameSite=Lax，Token 有签名、过期和密码版本。
- 公开 catalog 已裁剪模板、代理、缓存、密钥等服务端内部字段；管理响应也隐藏 Key 明文/哈希和代理密码。
- 图源瓦片 z/x/y 有整数及范围校验，legacy relay hostname/path 使用精确 allowlist。
- FetchRelay 已有 10 秒基础超时、2xx 缓存限制、内容类型 allowlist、Range-aware key、临时文件后 rename 和 stale 回退。
- 预缓存已有暂停、失败记录、429 退避和手动恢复能力。
- 前端源码未发现业务代码直接调用原生 alert、confirm、prompt，当前遵守统一弹窗约定。
- 临时生产构建与 service/app 字节级一致；生产依赖 npm audit 未发现已知漏洞。

## 七、验证记录

| 验证项 | 结果 | 说明 |
| --- | --- | --- |
| npm run check | 通过 | 但仅覆盖手工文件列表，不能证明全部源码和 PM2 配置有效 |
| npm test | 78/78 通过 | 测试导入生产 singleton，并实证重写 .db/admin/precache-tasks.json；在完成隔离前不要把“通过”视为无副作用 |
| npm run build | 通过 | Vite 提示 main 与 3D 大 chunk；本次生成物与 service/app 一致 |
| npm audit --omit=dev | 0 个漏洞 | 使用 npm 官方 registry 验证 |
| 完整 npm audit | 2 个开发链高危通告 | braces、picomatch，经 nodemon/chokidar 引入，不属于生产依赖 |
| npm outdated | 有补丁版本 | axios、cesium、fs-extra、vite |
| node pm2.config.js | 失败 | ESM 下 module 未定义，证实冷启动配置失效 |
| bash -n deploy-66.sh | 通过 | 只证明 shell 语法，不证明发布、回滚或线上路径有效 |
| 本地缓存盘点 | 约 5.7 GB、446,590 文件、25 个临时文件 | 仅为本地现场，不代表生产容量；用于证明当前实现没有自动容量边界 |

### 测试副作用特别说明

本次审查执行测试时，.db/admin/precache-tasks.json 在 2026-07-10 22:35:51 +0800 被改写为 3 字节。该文件被 Git 忽略，本报告没有继续修改或尝试恢复它，以免覆盖未知运行态。本次事件本身就是 P1-TEST-01 的可重复证据；后续 Agent 在隔离测试前应先由项目负责人确认该文件的正确恢复来源。

## 八、未验证边界

- 未连接 66 或其他生产主机，没有核实线上环境变量、监听边界、反向代理、共享缓存、真实文件权限、PM2 logrotate、磁盘告警和异机备份。
- 未进行真实移动设备 8 小时定位长跑、浏览器 BFCache/冻结/杀页、弱网和权限变化测试。
- 未对真实上游图源执行大规模故障注入、DNS rebinding、重定向 SSRF、限额、代理池和 Key 池切换测试。
- 未进行百万缓存条目、磁盘低水位、ENOSPC、进程崩溃、备份恢复和无损 reload 压测。
- 未对 service/app 构建产物做独立源码审计；仅确认当前临时构建与仓库产物一致。
- 审查期间并发改动的具体文件已列在“审查快照和并发改动边界”；本报告没有回退它们，也没有把候选实现视为风险关闭。后续整改开始前应记录新的 commit 和 worktree 状态，重新定位证据行号。

## 九、整改路线

### 阶段 0：立即止血与现场核验

1. 核验并轮换生产管理员密码和 Token Secret，确认非必要端口不对公网暴露。
2. 对 .db 做只读快照、校验和和异机备份；确认本次被测试改写的 precache-tasks.json 恢复来源。
3. 停止生产应用内自动 git pull 和 PM2 watch，修复 PM2 冷启动配置。
4. 在反向代理层临时阻断默认凭据、限制管理入口来源、清理 query Token 日志暴露。
5. 建立最小 readiness：至少校验版本、构建入口、关键 store 和可写目录。

### 阶段 1：核心可靠性与安全边界

1. 按持续定位专项需求实现共用状态机、generation、single-flight、deadline、watchdog 和动态漂移判断。
2. 重构 AdminStore 的错误语义、事务、权限、版本和备份恢复。
3. 建立 safe-fetch、认证隔离缓存键、single-flight、响应/缓存容量和磁盘水位。
4. 完成管理认证哈希、会话撤销、限流和日志脱敏。
5. 实现优雅停机、真实 liveness/readiness、不可变发布和可离线回滚。

### 阶段 2：功能正确性与长期运行

1. 长轨迹改为有界渲染、增量持久化和可见存储降级。
2. 修复路线乱序/坐标系、弹窗并发、KML 输入/内容竞态、底图健康回退。
3. 重做 PWA 版本、路由缓存和离线升级策略。
4. 把预缓存执行、清理、代理/Key failover 统一到真实图源请求契约。
5. 加入结构化日志、指标、告警、磁盘和任务仪表盘。

### 阶段 3：工程门禁与持续演练

1. 建立仓库级 CI、完整 lint/check、隔离测试、构建、依赖审计和 OpenAPI 契约检查。
2. 建立浏览器故障注入、8 小时定位仿真、缓存/磁盘压力和滚动重启测试。
3. 固化 RPO/RTO、SLO、备份恢复、密钥轮换和灾备演练。
4. 持续清理 2D/3D、KML 和超大路由文件的重复实现，降低跨端漏修概率。

## 十、建议的 Agent 工作包

| 工作包 | 负责范围 | 首要编号 | 依赖与交付 |
| --- | --- | --- | --- |
| A. 管理认证与 Store | 默认凭据、密码哈希、会话撤销、Store 事务/权限/损坏语义、备份格式 | P0-01、P0-02、P1-AUTH-01、P1-STORE-01、P1-BACKUP-01 | 先更新安全和数据契约；提供迁移夹具、故障注入和恢复文档 |
| B. 安全 Fetch 与缓存 | SSRF、缓存 scope/single-flight/原子提交、容量、水位、公开缓存头 | P1-SSRF-01、P1-CACHE-01/02、P1-CAP-01 | 与 A 约定 secret identity 摘要；更新 docs/api.md 和缓存运维文档 |
| C. 持续定位 | 2D/3D 共用状态机、deadline、generation、watchdog、漂移和长轨迹 | P1-LOC-01/02、P1-BOOT-01 的定位部分、P1-TRACK-01 | 以 continuous-location-reliability.md 为准；先补纯函数和虚拟时钟测试 |
| D. 地图前端可靠性 | 启动降级、路线、弹窗、PWA、KML、底图健康、存储容错 | P1-BOOT-01、P1-DIALOG-01、P1-PWA-01、P1-XSS-01、P1-ROUTE-01 | 不与 C 同时修改定位热点；增加浏览器/E2E 故障夹具 |
| E. 图源与预缓存运行时 | 真实 catalog 契约、代理/Key failover、日志/计数异步化、资源隔离 | P1-IO-01、P1-PRECACHE-01、P1-UPSTREAM-01 | 依赖 B 的 safe-fetch/cache API；提供自定义图源和代理端到端测试 |
| F. 运维与发布 | PM2、自动拉取、优雅停机、健康检查、不可变发布、观测与告警 | P1-PM2-01、P1-DEPLOY-01、P1-LIFE-01、P1-HEALTH-01 | 依赖 A 的 readiness/store 状态；交付冷启动、reload、回滚和恢复手册 |
| G. 测试与契约 | 测试 dataDir 隔离、CI、OpenAPI、文档漂移、依赖治理 | P1-TEST-01、P2-CI-01、P2-DOC-01、P2-DEPS-01 | 应最先修测试隔离，再为其他工作包提供门禁；不直接改业务规则 |

协作约束：

- A/B/E 都可能修改 service/bin/admin/tileCatalog.js、service/bin/simpleApi.js 和 FetchRelay，必须先冻结接口边界并按顺序合并，不能让多个 Agent 同时大范围编辑这些热点文件。
- C/D 可能同时触碰 src/main.js、src/3d.js、KML 和弹窗；定位控制器契约应由 C 先稳定，D 只消费公开接口。
- 每个工作包必须同步更新需求/API/开发记录，并提供成功、非法输入、超时、停止后旧回调、敏感字段、磁盘/存储失败等自动化测试。
- 后端先交付稳定接口和契约，前端再对接真实接口；不得用前端本地假设补齐服务端业务规则。

## 十一、统一放行门槛

以下门槛全部满足后，才建议把应用标记为“达到持续可用加固基线”：

1. P0 全部关闭，P1 无未接受风险；线上默认凭据、Secret、文件权限和共享缓存配置已完成现场核验。
2. npm run check、npm test、npm run build、生产/完整依赖审计和浏览器关键测试均通过，且测试前后仓库 .db 哈希不变。
3. 15 秒间隔、100 km/h 的 8 小时定位仿真持续更新；500 km/h 内不被固定阈值锁死；stop 后任何旧回调都不能复活。
4. 高德、catalog、访问状态、瓦片上游永不响应时均在总 deadline 内降级，核心页面不会无限白屏。
5. 破坏关键 JSON、制造只读目录、低磁盘水位和 ENOSPC 时不启用默认安全配置、不覆写原文件，并产生 readiness 失败和告警。
6. 100 个同瓦片并发请求只回源一次；不同认证上下文不共享缓存；容量达到高水位后自动、有界淘汰。
7. 在长瓦片流和预缓存任务运行时执行 reload，连接按约定 drain，任务可恢复，部署能核对新 commit/version。
8. 从空主机按文档恢复全部关键状态并满足已批准的 RPO/RTO；断网或 registry 5xx 时可切回上一完整 release。
9. OpenAPI 可被标准 validator/client generator 直接消费，所有新增/变更接口具备鉴权、请求、响应、错误码和字段说明。

## 十二、最终结论

当前版本具备可继续演进的功能基础，但其可靠性主要建立在“上游正常、存储正常、请求按序、进程不重启、配置不损坏”的理想路径上。对地图应用而言，这不足以支撑长期定位、持续瓦片服务和可验证灾备。

后续整改不应从零散 try/catch 开始，而应优先建立四个系统性边界：**明确的异步 deadline 与状态机、fail-closed 且可恢复的持久化、容量受控且隔离身份的缓存、唯一且可验证的发布/健康/恢复链路**。完成这些基础后，再处理 PWA、KML、路线、可访问性和工程治理，才能把“当前能用”提升为“故障下仍可用、失败后可恢复、结果可信”。
