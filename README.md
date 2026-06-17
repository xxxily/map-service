# map-service

`map-service` 是一个轻量地图服务。项目使用 Vite 构建 Leaflet + 高德地图前端，
通过 `/api/v1` 暴露版本化接口，并为白名单瓦片请求提供可刷新、可回源校验的
服务端缓存代理。

## 环境要求

- Node.js >= 22.13
- npm >= 10

依赖管理只使用 npm。请保留 `package-lock.json`，不要重新引入 `yarn.lock`。

## 快速开始

```bash
npm install
npm run build
npm run exec
```

默认服务地址：

```text
http://127.0.0.1:3088
```

常用页面和接口：

- `GET /`：地图 PWA 应用。
- `GET /?view=admin`：管理后台。
- `GET /api/v1/health`：健康检查。
- `GET /api/v1/tiles/relay?url=...`：白名单瓦片缓存代理。
- `GET /api/v1/admin/cache`：登录后查看缓存状态。

本地开发默认后台账号密码为 `admin` / `admin`。非本地环境必须配置：

- `MAP_SERVICE_ADMIN_USERNAME`
- `MAP_SERVICE_ADMIN_PASSWORD`
- `MAP_SERVICE_ADMIN_TOKEN_SECRET`

## 开发

```bash
npm run dev
npm test
npm run check
npm run build
```

## 文档

- [开发指南](docs/development.md)
- [架构说明](docs/architecture.md)
- [API 参考](docs/api.md)
- [需求文档](docs/requirements/README.md)
- [变更日志](docs/changelog.md)
