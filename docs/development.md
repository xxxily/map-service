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

管理后台账号通过环境变量配置：

```bash
MAP_SERVICE_ADMIN_USERNAME=admin
MAP_SERVICE_ADMIN_PASSWORD=change-me
MAP_SERVICE_ADMIN_TOKEN_SECRET=change-me-too
```

本地开发默认账号密码是 `admin` / `admin`，方便快速启动。上线或共享环境必须覆盖默认值。

常用脚本：

- `npm run dev`：启动 Vite 前端开发服务。
- `npm run build`：构建前端到 `service/app/`。
- `npm run exec`：直接运行 `service/index.js`。
- `npm start`：通过 nodemon 运行服务。
- `npm run check`：检查后端、Vite 配置和前端模块语法。
- `npm test`：运行 Node 原生测试。
- `npm run pm2-start`：通过 `pm2.config.js` 启动。

## 前端开发

编辑 `src/` 和根目录 `index.html`。

不要手动编辑 `service/app/` 下的构建产物，改完源码后重新构建：

```bash
npm run build
```

生产服务在 `/` 提供构建后的 `service/app/index.html`。管理后台也是同一个 Vite
应用，通过 `/admin/<tab>` 打开。三维地图源码入口为根目录 `3d.html` 与 `src/3d.js`；
生产服务通过 `/3d` 提供构建后的 `service/app/3d.html`。

后台前端模块约定：

- `src/admin/dashboard.js` 只做数据加载、导航和事件分发。
- `src/admin/panels/` 每个文件负责一个面板。
- 新增后台面板时，需要同步加入 `src/admin/state.js` 的导航定义和 `npm run check`。
- 需要提示或确认时，使用 `src/ui/dialog.js`，不要直接调用 `alert`、`confirm`、`prompt`。

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
