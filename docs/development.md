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
应用，通过 `/?view=admin` 打开。

后台前端模块约定：

- `src/admin/dashboard.js` 只做数据加载、导航和事件分发。
- `src/admin/panels/` 每个文件负责一个面板。
- 新增后台面板时，需要同步加入 `src/admin/state.js` 的导航定义和 `npm run check`。
- 需要提示或确认时，使用 `src/ui/dialog.js`，不要直接调用 `alert`、`confirm`、`prompt`。

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
