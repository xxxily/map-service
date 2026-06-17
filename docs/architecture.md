# 架构概览

## 入口

- `service/index.js` 创建 Express 应用，挂载中间件，注册 API，服务静态资源并启动定时任务。
- `index.html` 是 Vite 源 HTML 入口。
- `src/main.js` 负责浏览器端地图应用启动和后台视图切换。
- `src/admin/` 是管理后台前端模块。
- `service/app/` 是 `npm run build` 生成的生产静态产物，由 Express 服务。

## 前端结构

前端是一个 Vite 应用：

```text
index.html                 Vite HTML 入口
src/config.js              前端运行配置
src/main.js                应用启动和视图切换
src/map/                   Leaflet 地图、定位、搜索、URL 状态
src/admin/api.js           管理后台 API 客户端
src/admin/dashboard.js     管理后台编排层
src/admin/layout.js        后台布局和登录页
src/admin/state.js         后台状态和导航定义
src/admin/utils.js         后台通用格式化/转义工具
src/admin/panels/          后台各面板组件
src/ui/dialog.js           统一 Web 弹窗组件
src/pwa.js                 Service Worker 注册
src/styles.css             Vite 引入的全局样式
service/app/               构建后的静态产物
```

浏览器只保留 `/` 一个页面入口。地图是默认视图，管理后台通过 `/?view=admin`
打开。旧的 `map.html` 和独立静态脚本已经移除。

管理后台不是单个巨石页面，而是按职责拆分：

- `overview.js`：系统和访问概览。
- `cache.js`：缓存统计和清空。
- `precache.js`：高德搜索、地图选区、预缓存任务。
- `layers.js`：图层配置查看。
- `settings.js`：代理和图层级代理策略。

## 后端结构

- `service/bin/simpleApi.js` 注册 `/api/v1` 路由。
- `service/bin/service.js` 是 API handler 使用的服务层。
- `service/bin/admin/` 包含后台认证、运行时设置、访问统计、图层目录和预缓存任务管理。
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

管理后台在同一个 Vite 应用内实现，调用 `/api/v1/admin/*` 接口。前端将
Bearer Token 保存在浏览器 localStorage。

后台运行时状态存放在 `.db/admin/`：

```text
.db/admin/settings.json
.db/admin/precache-tasks.json
```

后台设置当前包含代理配置和按图层代理策略。预缓存任务会把 bounds 和 zoom
展开为 Web Mercator 瓦片坐标，并复用 fetchRelay 管线下载和写入缓存。

## 图层与代理策略

图层目录由 `service/bin/admin/tileProviders.js` 统一维护。每个图层包含厂商、
类型、URL 模板、缩放范围和默认代理建议。

代理策略按 providerId 判断：

- Google 图层默认建议走代理。
- 高德图层默认不走代理。
- 普通瓦片请求会尝试根据 URL 自动识别图层。
- 预缓存任务天然带有 providerId。
- `useProxy=true` 可以强制单次请求走代理。

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
