# 开发指南

## 包管理

本项目统一使用 npm。

```bash
npm install
npm install <package>
npm uninstall <package>
```

不要再引入 Yarn。`package-lock.json` 是依赖锁定的唯一来源。

## 运行

后端是 ESM Node.js 应用。

```bash
npm run exec
npm start
```

用户数据库首次初始化且尚无有效超级管理员时，可通过环境变量引导创建首个超级管理员：

```bash
MAP_SERVICE_ADMIN_USERNAME=map-root
MAP_SERVICE_ADMIN_PASSWORD=replace-with-a-long-unique-password
MAP_SERVICE_USER_DATABASE=/absolute/path/map-service.sqlite
```

`MAP_SERVICE_USER_DATABASE` 可省略，默认使用 `.db/map-service.sqlite`。本地开发默认账号密码是
`admin` / `admin`，该弱密码账号会被要求首次登录改密；上线或共享环境必须在首次启动前覆盖。
数据库已有有效超级管理员后，环境变量不会覆盖其密码。新管理登录使用 Cookie 会话和 CSRF，
不再签发或在 localStorage 保存 Bearer Token。

反向代理部署使用 `MAP_SERVICE_TRUST_PROXY` 显式声明可信跳数或网段；默认关闭。认证限流和 Secure Cookie 只使用 Express 经过该配置解析的 `req.ip` / `req.secure`，业务代码不得直接读取转发头决定信任边界。

用户体系的初始化、备份和恢复流程见 [用户体系部署与运维](./user-system-deployment.md)；留言、审核、举报和 AI 审核的生产部署与客户端接入见 [交互功能部署与接入手册](./interaction-deployment-and-integration.md)。这些交互能力由内部 Interaction Service 独立提供，Artalk 只是 161 可选单向镜像，不是本地开发或生产部署依赖。

常用脚本：

- `npm run dev`：启动 Vite 前端开发服务。
- `npm run build`：构建前端到 `service/app/`。
- `npm run exec`：直接运行 `service/index.js`。
- `npm start`：通过 nodemon 运行服务。
- `npm run check`：检查后端、Vite 配置和前端模块语法。
- `npm test`：运行 Node 原生测试。
- `npm run pm2-start`：通过 `pm2.config.cjs` 启动。生产环境关闭文件监听、取消应用自拉代码和定时重启；代码更新统一使用 `deploy-66.sh`，由脚本保留现有环境变量、应用资源阈值并执行健康检查/回滚。

## 前端开发

编辑 `src/` 和根目录 `index.html`。

不要手动编辑 `service/app/` 下的构建产物，改完源码后重新构建：

```bash
npm run build
```

生产服务在 `/` 提供构建后的 `service/app/index.html`。管理后台也是同一个 Vite
应用，通过 `/admin/<tab>` 打开。三维地图源码入口为根目录 `3d.html` 与 `src/3d.js`；
生产服务通过 `/3d` 提供构建后的 `service/app/3d.html`。

### 用户体系与账号 KML 开发

- 用户、角色、会话、个人 KML、收藏和分享的业务规则放在 `service/bin/user/` 服务层；`simpleApi.js` 只负责鉴权、参数读取、服务调用和统一响应。
- 权限判断以服务端返回的权限码为准。`account.self.update` 蕴含资料读取，`kml.own.write` 蕴含个人 KML 读取，`kml.any.manage` 蕴含任意 KML 读取。
- 账号 KML 的读取权限和写入权限必须分开处理。只读账号仍可加载、查看、聚焦和导出授权数据，但不得通过隐藏控件、事件伪造、轨迹记录或撤销重做修改内存数据和服务端数据。
- 2D 与 3D 共用 `src/map/kml-account-sync.js`、`kml-account-draft-store.js`、`kml-conflict-merge.js` 和 `kml-account-recovery-ui.js`。任何新写入口都必须先更新工作文件并立即保存用户隔离草稿，再进入防抖同步。
- `/kml/sync` 的 `create.clientId` 是用户范围内的幂等键；同一创建意图在重试和恢复时必须复用。服务端同时保留 `(owner_id, sync_client_id)` 唯一约束和 `kml_sync_create_keys` 持久账本；永久删除内容行不得释放旧键。
- 同步成功只能在确认没有后续修改时清理草稿。`409 KML_REVISION_CONFLICT` 后使用 `snapshot.base / local / server` 三方合并：互不相交的修改自动合并并最多自动重试一次，真实冲突通过统一 Dialog 逐项选择本地或服务器版本；不得整文件静默覆盖、裁剪或无限重试。
- 草稿 v2 的快照必须保留完整深拷贝 `base`；Feature、坐标和资源项不得与工作文件共享引用。完整草稿以 IndexedDB 为主，750000 字符以内允许同步保存完整 localStorage 副本，大草稿 localStorage 只保存代次元数据。新元数据而完整写入未完成时必须回退到最近完整草稿，并以元数据的更高代次继续写入；不得为控制大小裁剪 KML 内容。
- `retryExhausted` 必须以精简状态随草稿持久化，不保存可过期的服务器副本或冲突结果。页面刷新后重新读取服务器并重新计算冲突，只继承已自动重试状态；人工选择提交前也必须再次读取服务器，冲突集合变化时拒绝旧选择。
- 自动合并改变工作文件后，必须通过统一替换回调同步更新 2D/3D 的 `kmlList`、图层和管理面板，再以同一对象继续提交；不得只更新同步模块的内部副本，否则后续编辑会把服务器合并结果覆盖回去。
- 默认 KML 作为账号级唯一状态处理；文件字段合并不得造成多个默认文件。回收站文件保留本地先 restore 再 update；若恢复文件要成为默认，restore 单独提交后下一批再完成默认切换。永久删除文件保留本地必须使用新 ID create。
- 会话失效监听必须在初始账号加载和恢复之前绑定；事件处理先调用 `suspendKmlAccountSync({ preserveDraft: true })`，随后才允许清理账号 KML 并加载访客本地数据。
- 修改这些模块至少运行 `tests/kml-conflict-merge.test.js`、`tests/kml-account-sync.test.js`、`tests/account-ui.test.js`、`tests/user-system.test.js`，并继续执行全量门禁。

后台前端模块约定：

- `src/admin/dashboard.js` 只做数据加载、导航和事件分发。
- `src/admin/panels/` 每个文件负责一个面板。
- 新增后台面板时，需要同步加入 `src/admin/state.js` 的导航定义和 `npm run check`。
- 需要提示或确认时，使用 `src/ui/dialog.js`，不要直接调用 `alert`、`confirm`、`prompt`。

### KML 富媒体预览开发

KML 图片、视频、音频和白名单 iframe 的预览统一由 `src/ui/media-preview.js` 负责，2D 和 3D
不得各自实现预览层。`src/map/kml-content-panel.js` 只渲染详情分组和预览入口，普通链接仍是明确
外链。图片平移缩放复用 `@panzoom/panzoom`；新增手势时不能覆盖它的 Pointer Events，也不能把
媒体 URL 重新拼成未转义 HTML。

当前点位交互由 `src/map/kml-media-gallery.js` 统一聚合：popup 首击展示当前点位缩略图/媒体卡片，
点击后按当前 KML 的全部点位聚合可预览媒体，并把点位名称、KML 名称和稳定内容 ID 保存在集合元数据中。
预览器通过 `onActiveItemChange` 将活动媒体的 `kmlId` / `featureId` 回传给当前地图实现；2D 使用 Leaflet
打开对应 layer popup，3D 使用 Cesium 实体定位并打开自定义 popup。切换时必须取消上一次短飞行动画和延迟任务，
避免快速连续切换后弹出旧点位。预览器不提供额外点位跳转按钮；关闭预览后由最后一次活动媒体已经触发的激活状态保留对应 popup。
从点位 popup 首次打开媒体时，不得再次激活同一个 `kmlId` / `featureId`，避免 Leaflet 无意义地重建当前 popup。
popup 媒体入口使用容器级事件委托，不在单个媒体按钮上保存一次性监听器；这样 Leaflet 替换内部 HTML 后，关闭预览仍能重复打开同一媒体。
`media-preview.js` 的媒体轨道只懒加载缩略图；全屏预览可切换为浮动小窗，小窗解除页面滚动锁但仍保留
当前媒体 DOM，因此视频播放进度和 iframe 页面状态不会因收缩/展开而重置。`.m3u8` 资源仅在真正打开
视频时动态加载 `hls.js`，普通图片和链接浏览不引入该执行路径。
图片元素默认占满预览画布，并通过 `object-fit: contain` 把原图等比适配到可用高宽；因此 Panzoom 的
`1x` 是完整可见的自适应尺寸，不是原图像素尺寸，小图也应放大适配，复位必须回到该基准。
旧 KML 的 `embed` / `object` 视频优先读取 `type="video/*"`，其次使用 URL 扩展名；无扩展名资源只在
`styleUrl` 明确包含 `video` 时提升为视频，不能把普通 embed 页面无条件当视频。桌面头尾控制层默认减弱到
0.3 透明度并支持 hover/focus 恢复；移动端顶部仅保留浮动关闭/小窗按钮，底部信息层隐藏。
所有视频媒体项都带有 `autoplay` 元数据，进入统一预览器后立即优先尝试带声音播放；离开、切换或关闭时由统一清理链路暂停并释放媒体。若浏览器阻止带声音的自动播放，则降级为静音播放。
个人 KML 如需允许 iframe，构建时使用 `VITE_MAP_SERVICE_KML_IFRAME_ALLOWLIST`，规则格式与服务端
`MAP_SERVICE_KML_IFRAME_ALLOWLIST` 保持一致；生产部署应同时配置两者，未配置时个人 KML 页面仍降级为普通链接。

真实 KML 回归样例位于 `tests/fixtures/kml/`。新增样例必须由至少一项 `node:test` 读取，并覆盖媒体
数量、点位归属或截断/懒加载边界；不要把只用于手工验收的文件留在仓库根目录 `temp/`。

旧 KML 图片兼容规则只允许在 `shared/kml-content.js` 与 `service/bin/admin/kmlMedia.js` 的共同
约束下扩展。不得只在前端增加 relay URL；新增主机或路径前必须同步补充 DNS 私网拦截、MIME、
文件大小、访问控制和日志脱敏测试，并更新 `docs/api.md`。原始文件入口始终使用内容项 `url`，
缩略图和预览媒体才可使用 `renderUrl`。

修改预览交互后至少验证：

- 大图和小图在桌面、移动竖屏和移动横屏中都以 `1x` 等比适配预览画布并完整居中，标题和控件没有溢出或遮挡。
- 按钮、滑杆、滚轮、双指、拖拽、双击、复位和多图循环切换正常，缩放保持在 `1x` 到 `6x`。
- 视频默认不自动播放并保持 `16:9`，音频控件不溢出；切换或关闭后音视频停止且 DOM 资源清空。
- `kmltest2.kml` 的 7 个 `MarkerStyleVideo + embed` 资源均进入视频组，并能创建原生 video 控件。
- `embed`、`object` 和普通 `<video>` 资源进入预览后都自动播放，并优先保留声音。
- 切换图片/视频后地图激活正确点位 popup；关闭预览后保留最后一项媒体对应的 popup。
- 桌面头尾区域默认 opacity 为 0.3、hover/focus 为 1；390px 移动视口不显示完整 header/footer。
- iframe 延续内容项 sandbox/referrer policy，加载失败时仍可通过原始页面入口兜底。
- iframe 水平方向占满预览舞台且仅做上下居中；抖音运行时高度参数必须使用 `%20` 保留空格编码，避免上游把 `calc()` 解析失败并重新露出白色页脚。
- 点位 popup 的媒体速览支持“打开、关闭、再次打开”连续操作，Leaflet 替换 popup 内容后委托监听仍有效。
- `野兰谷.kml` 的兼容缩略图和预览图均从 `/api/v1/kml/media` 成功加载，原始文件链接不被替换。
- `Escape`、关闭按钮和桌面遮罩均可退出，页面滚动锁和焦点在退出后恢复，控制台无脚本错误。

## 三维地图开发

三维地图使用 Cesium。页面编排保留在 `src/3d.js`，可测试规则放在 `src/map3d/`：

- `camera-interaction.js`：Pointer Events 手势分类和相机移动。普通左键/单指是平移；`Shift + 左键` 或中键是绕点旋转与倾角；双指手势在达到阈值后锁定为缩放、转向、倾角或平移。
- `scene-quality.js`：质量档、按高度的夸张计算和受控 terrain provider 选择。
- `terrain-runtime.js`：地形状态 reducer、多点高程验证、有限自动重试、运行时安全覆盖和“深度→地形射线→椭球”的统一取点。
- `map3d-styles.css`：三维控件、地形状态和 Cesium attribution 的页面样式。

不要重新启用 Cesium 默认相机控制器来“补救”单一手势，它会与适配器抢占同一个输入事件。KML、辅助线和其他地图工具处于活动状态时，优先让工具接收指针事件。相机、URL 同步、KML 和辅助线取点必须优先使用深度命中，再退化到地形射线和椭球体，不能默认 `pickEllipsoid`。无地表命中的平移必须按相机高度、FOV 和 canvas 的 CSS 宽高换算，且同时保留 CSS 位移与世界坐标位移的单帧限幅；不能用高 DPR drawing buffer 的宽高替代 CSS 尺寸。

### 地形部署配置

`src/config.js` 从以下构建期变量读取地形配置：

```bash
VITE_CESIUM_TERRAIN_PROVIDER=arcgis-terrain3d
VITE_MAPTILER_TERRAIN_URL=<经审批的_MapTiler_Quantized_Mesh_endpoint>
VITE_CESIUM_TERRAIN_EXAGGERATION=1.18
VITE_CESIUM_SCENE_QUALITY=auto
VITE_MAP3D_CAMERA_PROFILE=enhanced
```

当前默认是 `arcgis-terrain3d`，仅作为不自建 DEM 的当前 PoC/默认尝试路径。发布前必须自行确认 ArcGIS 的许可、覆盖范围、网络可达性和 CORS 策略。`cesium-world-terrain` 是待部署审批的候选，需要通过 `VITE_CESIUM_ION_TOKEN` 提供服务商允许公开、最小权限、来源受限且可撤销的只读 Token；不要把管理员 Token、私密 Token 或长期无来源限制 Token 写入 `VITE_*`，因为构建后的前端可以读取它。

`self-hosted` 仅使用受控构建变量 `VITE_CESIUM_TERRAIN_URL`；不实现 URL 查询参数、localStorage、表单输入或任意 URL relay/proxy。`maptiler-quantized-mesh` 仅从 `VITE_MAPTILER_TERRAIN_URL` 读取已审批、受控的构建期 Quantized Mesh endpoint；该 endpoint 可包含服务商明确允许公开、权限和来源均受限的读取 Key。它不是用户输入、URL 参数或 relay/proxy 的目标地址；未配置或未获审批时必须降级，不能把它作为无 Key 的通用免费备用源。由于 `VITE_*` 会编入浏览器产物，这类 Key 不能视为秘密，必须可撤销且遵循服务商限制。

受控运行时对象 `window.mapServiceTerrainConfig` 只能覆盖 `enabled`、`provider`、`quality`、`exaggeration` 和 `demoView`。其中的 `selfHostedUrl`、`mapTilerUrl`、`ionToken` 或其他 URL/Token 字段一律忽略，仍以构建期配置为准；不得通过运行时脚本、查询参数、localStorage 或页面交互注入地形地址或凭据。

三维页的初始状态为 `standby`（等待进入 3D），随后按 `disabled`、`loading`、`verifying`、`active`、`degraded`、`fallback` 展示真实运行态。加载 20 秒超时会进入椭球体 fallback；验证使用固定 LOD 10 的喜马拉雅/贡嘎局部点簇，12 秒 watchdog 超时、采样异常或局部起伏不足会保留当前 provider 并进入 degraded；连续三次瓦片错误才回退椭球体。`#terrain-status` 是独立的 `aria-live` 状态区域，`#terrain-retry-btn` 是可访问的手动重试按钮，只在 degraded/fallback 显示；重试只重建地形 provider，不改变当前图层、KML、辅助线或相机位置。

可重试的临时 fallback 只在仍处于 3D 操作档位时真正发起两次，退避为 1.5 秒和 3 秒；退避期间切到 2D 不消耗预算，验证成功或用户手动重试会重置预算。缺少受控地址、显式关闭或缺少受控 Ion 凭据不得触发无限自动请求。遇到上游失败时先验证网络、CORS、服务条款和 provider 配置；不要在控制台、问题单、截图或公开 API 中粘贴 Token、完整服务 URL 或上游请求头。Cesium provider attribution 也必须保留可见。

`prefers-reduced-motion` 已用于模式切换、平面化、山地演示、全局视角复位和方向复位。页面提供 `auto`/`economy`/`balanced`/`quality` 四段质量控件；canvas 聚焦时支持方向键平移与 `+`/`-` 缩放，输入框和地图工具模式不会被抢占。`VITE_MAP3D_CAMERA_PROFILE=compatibility` 可独立关闭增强绕点/倾角并保留基础平移/缩放；旧 `VITE_MAP3D_CAMERA_ADAPTER_ENABLED=false` 兼容映射到该档位。

### 三维验证清单

修改三维交互或地形后，除通用检查外至少执行：

```bash
rtk node --test tests/map3d-camera-interaction.test.js \
  tests/map3d-scene-quality.test.js \
  tests/map3d-terrain-runtime.test.js \
  tests/map3d-terrain-picking.test.js
rtk npm run check
rtk npm test
rtk npm run build
rtk git diff --check
```

浏览器手动验收 `/3d` 时，检查普通左拖/单指平移、`Shift + 左拖`/中键绕点、滚轮和双指缩放、工具模式不抢事件、3D 模式首次进入后自动尝试地形、状态/重试路径、山地演示视角、KML/辅助线在山地的落点、可见 attribution，以及浏览器控制台无脚本错误。还要构造加载失败、验证超时和连续瓦片错误，确认 1.5/3 秒有限重试、手动重试和椭球体 fallback 行为。服务凭据、第三方网络或移动真机无法自动验证的部分必须在变更记录中说明。

## PWA 开发

PWA 文件位于 `public/` 和 `src/pwa.js`：

- `public/manifest.webmanifest`
- `public/sw.js`
- `public/offline.html`
- `public/pwa-icon.svg`
- `public/pwa-icon-192.png`
- `public/pwa-icon-512.png`
- `src/pwa.js`

Service Worker 不缓存 `/api/` 请求。修改 PWA 文件后需要重新 `npm run build` 并在浏览器
开发者工具中验证 manifest 和 service worker 状态。

## 需求文档

较大的产品或系统改动应先更新 `docs/requirements/`。需求文档需要记录目标、范围、
功能需求、非功能需求、API 或数据模型、验收标准和后续路线。

项目文档统一使用中文。

## 提交前验证

提交服务变更前运行：

```bash
npm install
npm run check
npm test
npm run build
npm outdated --json
npm audit --omit=dev --registry=https://registry.npmjs.org --json
```

地图或后台 UI 变更还需要验证：

- `GET /` 返回构建后的应用。
- 浏览器控制台没有脚本错误。
- Leaflet 能加载地图和瓦片。
- 后台 `/?view=admin` 可以登录并切换面板。
- 预缓存页高德搜索可用，图层选择和 bounds 同步正常。
- Application 面板中 manifest 和 service worker 状态正常。

## 本地状态

以下运行时文件会被忽略：

- `.cache/`
- `.db/`
- `log/`
- `logs/`
- `.omx/`
- `.playwright-cli/`
