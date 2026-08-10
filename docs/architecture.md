# 架构概览

## 入口

- `service/index.js` 创建 Express 应用，挂载中间件，注册 API，服务静态资源并启动定时任务。
- `index.html` 是 Vite 源 HTML 入口。
- `3d.html` 是 Cesium 三维地图的 Vite HTML 入口；生产服务将 `/3d` 映射到构建后的 `3d.html`。
- `src/main.js` 负责浏览器端地图应用启动和后台视图切换。
- `src/3d.js` 负责三维地图启动、受控底图目录、相机模式、地形状态与三维工具编排。
- `src/admin/` 是管理后台前端模块。
- `service/app/` 是 `npm run build` 生成的生产静态产物，由 Express 服务。

## 前端结构

前端是一个 Vite 应用：

```text
index.html                 Vite HTML 入口
3d.html                    Cesium 三维地图 HTML 入口
src/config.js              前端运行配置
src/main.js                应用启动和视图切换
src/3d.js                  Cesium 三维地图启动和页面编排
src/map/                   Leaflet 地图、定位、搜索、URL 状态
src/map3d/                 Cesium 的 KML、辅助线、搜索、定位和相机/场景模块
src/map3d/camera-interaction.js  指针手势分类、平移、绕点与缩放适配器
src/map3d/scene-quality.js        受控地形 provider 与场景质量预设
src/map3d/terrain-runtime.js      地形状态 reducer、验证规则、受限重试与统一取点降级
src/map3d-styles.css       Cesium 页面专属样式和状态提示
src/admin/api.js           管理后台 API 客户端
src/admin/dashboard.js     管理后台编排层
src/admin/layout.js        后台布局和登录页
src/admin/state.js         后台状态和导航定义
src/admin/utils.js         后台通用格式化/转义工具
src/admin/panels/          后台各面板组件
src/ui/dialog.js           统一 Web 弹窗组件
src/ui/media-preview.js    2D/3D 共用的图片、视频、音频和 iframe 预览器
src/ui/media-preview-state.js  媒体类型、图库索引和图片缩放边界纯函数
src/pwa.js                 Service Worker 注册
src/styles.css             Vite 引入的全局样式
service/app/               构建后的静态产物
```

浏览器有两个地图入口：`/` 是 Leaflet 2D 地图，`/3d` 是 Cesium 三维地图；管理后台通过
`/admin/<tab>` 打开。Vite 构建同时生成 `index.html` 和 `3d.html`，Express 对 HTML 入口发送
`Cache-Control: no-cache`，避免部署后继续使用旧页面壳。旧的 `map.html` 和独立静态脚本已经移除。

KML 点位详情由 `src/map/kml-content-panel.js` 统一渲染，图片、视频、音频和白名单 iframe 通过
`src/ui/media-preview.js` 进入同一个模态预览层。预览器只消费已经由共享内容规则分类的 HTTPS
媒体项，文字和 URL 使用 DOM 属性或 `textContent` 设置；`@panzoom/panzoom` 只负责图片手势与
变换，媒体暂停/释放、焦点恢复、安全外链、iframe sandbox 和响应式布局仍由项目组件控制。
`renderUrl` 默认与原始媒体 URL 相同；只有命中固定 `down-files.2bulu.com/f/dn1` 规则时才指向
`/api/v1/kml/media`。该接口继承访问控制，并在服务层执行精确主机/路径、DNS、MIME 和 20 MB
大小校验；它不是可配置的任意 URL 代理。

## 三维地图与真实地形

`src/3d.js` 仅编排 Cesium Viewer、图层、页面控件和运行时状态；可独立测试的相机及场景规则拆分在
`src/map3d/` 下，避免多组 DOM 监听器同时修改相机。

- `camera-interaction.js` 接管 Cesium canvas 的 Pointer Events，并关闭会与其竞争的 Cesium 默认相机输入。普通左键拖拽和单指拖动平移；`Shift + 左键` 或中键绕开始时锁定的地表点旋转/调倾角；滚轮、触摸板与双指手势按锚点缩放。KML 与辅助线等工具模式优先于相机手势。无地表命中时，平移按相机高度、FOV 和 canvas **CSS** 尺寸换算，先限制 CSS 位移、再限制世界坐标位移，不能使用高 DPR drawing buffer 尺寸。
- 相机、KML、辅助线和 URL 相机同步取点均优先“深度命中 → 地形射线 → 椭球体命中”；相机锚点无法取得时才使用视口中心，避免真实地形下仍固定使用椭球体。
- `scene-quality.js` 只接受已知的 `provider` 枚举：`arcgis-terrain3d`、`cesium-world-terrain`、`maptiler-quantized-mesh`、`self-hosted`、`ellipsoid`。页面不提供任意地形 URL，也不增加 terrain relay/proxy。
- 当前构建期默认 provider 是 `arcgis-terrain3d`，用于不自建 DEM 的 PoC。ArcGIS Terrain3D、Cesium World Terrain 和 MapTiler 的服务条款、可用性、覆盖范围与凭据必须在部署时独立审批；默认值不构成生产授权承诺。
- `terrain-runtime.js` 的 `terrainRuntime` 与 2D/3D 操作档位独立，按 `standby`、`disabled`、`loading`、`verifying`、`active`、`degraded`、`fallback` 展示状态。加载 20 秒超时进入 fallback；验证使用固定 LOD 10 的两个局部点簇并受 12 秒 watchdog 约束；连续 3 次瓦片错误回退椭球体。可重试的临时 fallback 在 3D 档位最多真正发起两次（1.5 秒、3 秒），离开 3D 不消耗尚未执行的预算，手动重试会重置预算。
- `#terrain-status-panel` 将 live status 与独立的 `#terrain-retry-btn` 分开，防止状态文本更新破坏按钮；按钮仅在 `degraded`/`fallback` 可用。超时或不可恢复错误回退椭球体，但不得影响图层、KML、辅助线和基本相机操作。
- 场景质量预设为 `economy`、`balanced`、`quality`，分别调节分辨率上限、地形 LOD、缓存、光照、大气、阴影和后处理；页面提供固定定位的响应式四段控件，`auto` 当前规范化为 `balanced`，自动帧率降档仍属后续。`quality-controls.js` 负责 DOM/ARIA 契约，canvas 在聚焦且非工具模式时提供方向键平移和 `+`/`-` 缩放。
- `VITE_MAP3D_CAMERA_PROFILE` 只允许 `enhanced`/`compatibility`；兼容档保留相机适配器中已验证的平移、缩放和键盘基础路径，仅关闭高风险绕点/倾角增强，因此可与 `terrain.enabled` 和质量档独立回滚。
- 高程夸张按相机高度连续衰减，低空增强、约 2,000 km 及以上恢复为 `1x`。DEM 只能提供山体/沟谷起伏，不等价于城市建筑或摄影测量 3D Tiles。
- 模式切换、平面化、山地演示、全局视角复位和方向复位统一通过 `motion.js` 遵守 `prefers-reduced-motion`。
- Cesium 与地形服务的版权和 attribution 必须保持可见，不能用 CSS 隐藏 provider credits。

地形的详细交互契约、状态机、服务边界、验收和后续决策见
`docs/requirements/3d-camera-interaction-and-terrain-rendering-v2.md`。

管理后台不是单个巨石页面，而是按职责拆分：

- `overview.js`：系统和访问概览。
- `cache.js`：缓存统计和清空。
- `precache.js`：高德搜索、地图选区、预缓存任务。
- `tileSources.js`：图源、图层组合、对外发布和诊断日志。
- `proxy.js`：代理出口和代理池。
- `settings.js`：访问控制和管理密码。

## 后端结构

- `service/bin/simpleApi.js` 注册 `/api/v1` 路由。
- `service/bin/service.js` 是 API handler 使用的服务层。
- `service/bin/admin/` 包含后台认证、运行时设置、访问统计、图层目录和预缓存任务管理。
- `service/bin/admin/kmlMedia.js` 校验固定旧 KML 图片兼容目标、DNS 地址和响应边界。
- `service/bin/middleware/fetchRelay/index.js` 负责瓦片代理缓存。
- `service/bin/whitelist.js` 限制可代理的瓦片上游 host 和 path。
- `service/bin/cronJob/` 包含定时任务。

## 缓存设计

瓦片代理缓存为每个上游 URL 存储一个二进制文件和一个 JSON 元数据文件：

```text
.cache/fetchRelay/<provider>/<url-md5>
.cache/fetchRelay/<provider>/<url-md5>.meta.json
```

缓存具备新鲜度管理：

- fresh 缓存直接返回。
- stale 缓存会先尝试回源校验。
- 回源失败时，仍在 stale 窗口内的缓存可以兜底返回。
- 失败响应、过小响应、非瓦片响应不会写入缓存。
- 写缓存采用临时文件加原子 rename。

## 管理后台

管理后台在同一个 Vite 应用内实现，调用 `/api/v1/admin/*` 接口。管理员与普通用户
共用 SQLite 用户体系和服务端可撤销会话：`map_user_session` 使用 HttpOnly Cookie，
写请求同时携带 `X-CSRF-Token`。前端不再把管理 Token 保存在 localStorage，页面可见性
按权限码过滤，服务端仍对每个接口执行最终授权。

用户、角色、会话、个人 KML、收藏、分享和审计默认存放在：

```text
.db/map-service.sqlite
```

个人 KML 同步以 `(ownerId, clientId)` 记录持久创建幂等键，并以独立删除墓碑处理“删除先于创建”的请求乱序。客户端快照同时记录服务端 ID、revision、内容指纹和 `active/trashed` 状态：文件消失且快照为 active 时发送 `trash`，文件重新出现且快照为 trashed 时发送 `restore`，恢复后内容仍不一致才继续发送 `update`。若 trashed 快照尚无服务端 ID，则先按 `clientId` 取消删除墓碑，再根据响应到达时的工作文件续发原 create 或重做后的 `trash(clientId)`。每个新批次在网络发送前会以 `pendingOperations` 精确克隆到用户恢复草稿并等待 IndexedDB 落盘；网络响应未知时优先重放，明确 HTTP 失败时清除，成功后再归并快照并自动处理剩余操作。页面恢复 pending trash/restore 时以草稿 `files` 的最新存在性为准，并保留原快照映射响应，服务器 active 清单不会覆盖请求在途期间的撤销或重做。因此 2D/3D 的删除、撤销和重做不会把已回收文件误判成新建，也不会出现刷新后丢失的假恢复。

后台运行时状态存放在 `.db/admin/`：

```text
.db/admin/settings.json
.db/admin/precache-tasks.json
.db/admin/tile-sources.json
.db/admin/map-layers.json
.db/admin/proxy-outbounds.json
.db/admin/proxy-pools.json
```

后台设置只保留访问控制等全局运行时配置。代理配置统一收敛到代理出口、代理池和图源代理策略，避免和设置页产生第二套代理规则。预缓存任务会把 bounds 和 zoom 展开为 Web Mercator 瓦片坐标，并复用 fetchRelay 管线下载和写入缓存。

## 图层与代理策略

前台图层目录由 `service/bin/admin/tileCatalog.js` 统一维护。图层是一个或多个图源的叠加组合，图源包含 URL 模板、缓存策略和代理策略。

代理策略按图源解析：

- `proxy.mode=never`：始终直连。
- `proxy.mode=fixed`：使用指定代理出口。
- `proxy.mode=pool`：使用指定代理池。
- 发布项可以通过 `overrides.proxy` 覆盖图源代理策略。
- 发布项不配置覆盖时使用 `overrides.proxy=null` 表示沿用目标图源自身策略；系统不再提供“继承系统默认代理”模式。
- 历史 `/tiles/relay?url=` 接口只做白名单 relay，不再支持 `useProxy` 隐式代理。

所有图源、派生矢量资源和代理测试目标统一经过 `service/bin/security/networkTarget.js`：配置阶段拒绝非 HTTP 协议、凭据 URL、内部域名和字面保留地址；回源阶段解析全部 DNS 结果，并统一关闭重定向。直连使用固定 lookup 连接已验证地址；代理模式把请求目标改写为已验证 IP，同时保留原 HTTP `Host`、HTTPS SNI 和证书校验主机名，使代理不再重新解析原域名。这样公开瓦片接口只能按受控图源 ID 回源，不能通过 IPv4/IPv6 表示差异、DNS 混合结果、代理侧 DNS 重绑定或 3xx 跳转访问内网。

本机 Clash/Mihomo 的 Fake-IP 模式是受限例外：`198.18.0.0/15` 仍属于全局禁用地址，只有当全部解析结果都在该合成网段且代理出口明确为 `127.0.0.0/8`、`::1` 或 `localhost` 时，才允许把合成地址交给本机代理。远程代理、直连、混合 DNS 和其他私网结果不适用该例外。

`.db/admin` JSON 运行态存储对同一文件使用串行写队列和唯一临时文件，图源目录初始化也会合并并发加载，避免地图并发请求导致原子重命名冲突或初始化覆盖。

## PWA

项目使用原生 Web App Manifest 和 Service Worker 实现 PWA，不额外引入依赖。

```text
public/manifest.webmanifest  PWA manifest
public/sw.js                 Service Worker
public/offline.html          离线兜底页
public/pwa-icon.svg          PWA SVG 图标
public/pwa-icon-192.png      PWA 192 图标
public/pwa-icon-512.png      PWA 512 图标
src/pwa.js                   注册 Service Worker
```

Service Worker 只缓存应用壳和静态资源。`/api/` 请求会绕过缓存，避免影响瓦片代理、
后台接口和实时统计。

## 交互组件

业务代码禁止直接调用浏览器原生 `alert`、`confirm`、`prompt`。提示和确认操作统一
使用 `src/ui/dialog.js` 中的 Web 组件。

## 当前技术栈

- Node.js >= 22.13
- npm
- Express 5
- Vite 8
- Leaflet 1.9.4
- AMap JSAPI 2.0，通过 `@amap/amap-jsapi-loader` 加载
- Node 原生测试框架

## API 方向

API 应保持版本化和显式注册。新增接口需要：

- 放在 `/api/v1` 下。
- 明确 HTTP method。
- 做输入校验。
- 使用统一 JSON 响应。
- 为 `/api/v1/routes` 和 `/api/v1/openapi.json` 提供路由元数据。
- 对缓存、校验、权限边界相关逻辑补测试。
- 更新 `docs/api.md`。

## 需求管理

产品和系统需求统一存放在 `docs/requirements/`。较大的能力开发前，应先创建
或更新需求文档，再进入实现。
