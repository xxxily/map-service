# 变更日志

## 1.2.0 - 2026-06-17

### 管理后台

- 后台改为导航式信息架构，按概览、缓存、预缓存、图层、设置拆分页面。
- 后台前端拆分为布局、状态、工具函数和独立面板模块，避免继续扩大巨石页面。
- 预缓存支持高德地点搜索，便于快速跳转到需要缓存的区域。
- 预缓存任务继续支持按图层创建，并在界面和文档中明确图层选择。
- 新增图层配置页，展示厂商、类型、缩放范围、URL 模板、子域和默认代理建议。
- 代理设置支持按图层启用，默认 Google 图层走代理，高德图层不走代理。
- 普通瓦片请求会根据 URL 识别图层，并应用图层级代理策略。

### PWA

- 新增 Web App Manifest、Service Worker、离线页和 PWA 图标。
- 应用支持安装到桌面或移动端主屏。
- Service Worker 只缓存应用壳和静态资源，明确绕过 `/api/`、`/log/` 和 `/.cache/`。

### 工程规范

- 新增 `AGENTS.md` 项目协作规则。
- 文档统一改为中文维护。
- 禁止业务代码直接调用浏览器原生 `alert`、`confirm`、`prompt`。
- 新增统一 Dialog 组件，并替换现有原生阻塞弹窗调用。
- 移除公开缓存管理接口 `/api/v1/cache/fetch-relay`，缓存查看和清理统一收口到鉴权后台。

## 1.1.0 - 2026-06-17

### 管理后台

- 新增第一版管理后台 MVP，访问入口为 `/?view=admin`。
- 地图页新增管理图标，点击后打开后台。
- 新增管理员登录，使用签名 Bearer Token 鉴权。
- 新增系统版本、运行信息、瓦片缓存、访问统计、代理设置和预缓存任务面板。
- 新增上游瓦片请求运行时代理设置。
- 新增有边界限制的瓦片预缓存任务，并持久化任务快照。
- 建立 `docs/requirements/` 需求文档目录。
- 增加后台认证、设置持久化、代理传递、访问日志解析和预缓存瓦片规划测试。

## 1.0.0 - 2026-06-17

### 发布

- API、缓存、前端和测试完成现代化改造后的第一个稳定版本。
- 本版本包含破坏性变更，不保留旧 `/api.v1` 接口面。

### API

- 将 `/api.v1` 替换为 `/api/v1`。
- 移除无关或测试接口：随机文件选择、Wallhaven 选择、GitLab webhook、静态资源/包搜索辅助接口和 `/login`。
- 新增 `GET /api/v1/health` 和根路径 `GET /health`。
- 新增 `GET /api/v1/routes` 和 `GET /api/v1/openapi.json`，用于轻量 API 发现。
- 新增缓存管理接口，后续在 1.2.0 收口到鉴权后台。

### 瓦片代理缓存

- 将永久读缓存替换为基于 TTL 的缓存元数据。
- 新增 `HIT`、`MISS`、`REVALIDATED`、`STALE` 和 `BYPASS` 缓存状态响应头。
- 支持基于 `ETag` 和 `Last-Modified` 的上游条件回源校验。
- 避免失败、过小或非瓦片类型的上游响应写入缓存。
- 使用临时文件和元数据旁路文件实现原子缓存写入。
- 将上游白名单收紧到精确 host 和瓦片路径。

### 前端

- 地图前端迁移到 Vite 8。
- 将 Leaflet 和 `@amap/amap-jsapi-loader` 改为 npm 依赖管理。
- 用模块导入和哈希构建产物替换 CDN 与手工时间戳脚本。
- 将地图代码拆分到 `src/` 下的聚焦模块。
- 移除重复的 `map.html` 和无关静态 HTML、文本、二进制资源。
- 移除浏览器端 PouchDB 瓦片缓存，让缓存新鲜度统一由后端控制。

### 依赖和测试

- 移除与已删除工具脚本绑定的依赖：Directus SDK、dayjs、ExcelJS、lowdb、Meilisearch、MiniSearch 和 p-queue。
- 移除旧离线任务脚本、JSON DB 和随机选择工具。
- 新增基于 Node 原生测试运行器的 `npm test`。
- 增加缓存新鲜度、stale 回退、失败响应拒绝缓存、缓存绕过和白名单规则测试。

## 2026-06-17 - 现代化基线

### 依赖管理

- 依赖管理从 Yarn 迁移到 npm。
- 移除 `yarn.lock`。
- 新增 `package-lock.json`。
- PM2 watch 配置改为跟踪 `package-lock.json`。
- Node.js 基线提升到 >= 22.13，npm 基线提升到 >= 10。

### 依赖升级

- 升级运行时依赖到当前稳定版本，包括 `express@5.2.1`、`axios@1.18.0`、`cron@4.4.0`、`glob@13.0.6` 等。
- 移除未使用的旧构建链依赖。
- 添加 npm overrides，约束历史传递依赖使用已审计的安全版本。

### 地图界面

- 高德 JSAPI 从 1.4.15 升级到 2.0。
- Leaflet 统一到 1.9.4。
- 移除未使用的 jQuery CDN。
- 围绕 `index.html` 统一地图入口。
- 优化搜索面板和浮动地图控件。

### 服务端兼容

- 用 Express 内置解析器替换 `body-parser`。
- 更新 CORS、glob、cron、rotating-file-stream 等 ESM 兼容写法。
- 修复 cron 模块异步加载。

### 验证

- `npm outdated --json` 无过期依赖。
- `npm audit --omit=dev --registry=https://registry.npmjs.org --json` 无生产依赖漏洞。
- 浏览器验证 `/` 能正常加载 Leaflet 1.9.4、高德 JSAPI 2.0、瓦片和标记点。
