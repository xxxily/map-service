# API 参考

基础路径：

```text
/api/v1
```

所有 JSON 接口使用统一响应结构：

```json
{
  "code": 0,
  "result": {},
  "error": null
}
```

错误响应使用 `code: -1`，错误详情放在 `error.message`。

## 系统接口

### `GET /api/v1/health`

返回进程健康状态。

### `GET /health`

根路径健康检查，便于负载均衡或简单探活使用。

### `GET /api/v1/routes`

返回当前注册的 API 路由目录。

### `GET /api/v1/openapi.json`

返回根据路由元数据生成的轻量 OpenAPI 3.1 文档。

## 瓦片代理

### `GET /api/v1/tiles/relay?url=<encoded-url>`

通过服务端缓存代理访问白名单内的地图瓦片 URL。

允许的上游：

- `https://www.google.com/maps/vt`
- `https://www.google.cn/maps/vt`
- `https://webst01.is.autonavi.com/appmaptile` 到 `webst04`
- `https://webrd01.is.autonavi.com/appmaptile` 到 `webrd04`

查询参数：

- `url`：必填，URL 编码后的上游瓦片 URL。
- `refresh=true`：跳过当前缓存读取并回源刷新。
- `noCache=true`：`refresh=true` 的别名。
- `cache=false`：直接流式返回上游响应，不写入本地缓存。
- `useProxy=true`：强制本次上游请求走代理。

代理策略：

- 默认根据后台配置的图层策略判断是否走代理。
- Google 图层默认走代理。
- 高德图层默认不走代理。
- 未识别图层默认不走代理。
- `useProxy=true` 会强制走代理，主要用于调试。

响应头：

- `X-Cache: MISS`：回源并写入新缓存。
- `X-Cache: HIT`：命中新鲜缓存。
- `X-Cache: REVALIDATED`：上游返回 `304`，缓存元数据已续期。
- `X-Cache: STALE`：回源失败，返回 stale 窗口内的缓存。
- `X-Cache: BYPASS`：本次请求禁用缓存。

缓存策略：

- 只有 `2xx` 上游响应会被缓存。
- 空响应或过小响应会被拒绝，不写缓存。
- 非瓦片内容类型会被拒绝，不写缓存。
- 缓存文件通过临时文件原子写入。
- 每个缓存文件旁边保存 `<cache-file>.meta.json` 元数据。
- 默认新鲜 TTL 为 6 小时。
- 默认 stale 回退窗口为 30 天。

## 管理后台接口

管理接口统一位于 `/api/v1/admin`。除登录接口外，所有管理接口都需要：

```text
Authorization: Bearer <token>
```

管理员账号通过环境变量配置：

- `MAP_SERVICE_ADMIN_USERNAME`
- `MAP_SERVICE_ADMIN_PASSWORD`
- `MAP_SERVICE_ADMIN_TOKEN_SECRET`

本地开发默认账号密码为 `admin` / `admin`。上线前必须覆盖默认值。

### `POST /api/v1/admin/auth/login`

请求：

```json
{
  "username": "admin",
  "password": "admin"
}
```

返回 Bearer Token、过期时间和用户信息。

### `POST /api/v1/admin/auth/logout`

校验当前 Token 并返回 `status: ok`。前端负责删除本地 Token。

### `GET /api/v1/admin/session`

校验当前 Token，返回用户名和 Token 时间信息。

### `GET /api/v1/admin/system`

返回应用版本、Node.js 版本、进程号、运行时间、环境、服务器时间和 API 基础路径。

### `GET /api/v1/admin/cache`

返回缓存统计、provider 统计和最多 100 条最近缓存项。

### `DELETE /api/v1/admin/cache`

清空全部瓦片缓存。

### `DELETE /api/v1/admin/cache?url=<encoded-url>`

清理指定白名单瓦片 URL 的缓存。

### `GET /api/v1/admin/visits`

解析 `log/visitRecorder/access.log` 并返回访问统计，包括状态码分布、高频路径和最近请求。

### `GET /api/v1/admin/settings`

返回脱敏后的运行时设置。代理密码不会返回，只返回 `hasPassword`。

### `PUT /api/v1/admin/settings`

更新运行时设置。

```json
{
  "proxy": {
    "enabled": true,
    "protocol": "http",
    "host": "127.0.0.1",
    "port": 10809,
    "username": "",
    "password": "",
    "providerPolicy": {
      "amap-satellite": false,
      "amap-road": false,
      "google-satellite": true,
      "google-street": true
    }
  }
}
```

`providerPolicy` 控制哪些图层走代理。保存空密码不会覆盖已存在密码。

### `GET /api/v1/admin/precache/providers`

返回后台支持的图层目录。每个图层包含：

- `id`
- `name`
- `vendor`
- `category`
- `description`
- `template`
- `subdomains`
- `minZoom`
- `maxZoom`
- `proxyDefault`

### `GET /api/v1/admin/precache/tasks`

返回最近预缓存任务快照。

任务状态：

- `queued`：排队中
- `running`：执行中
- `pausing`：正在暂停
- `paused`：已暂停
- `completed`：已完成
- `completed_with_errors`：完成但有部分瓦片失败
- `failed`：任务失败
- `interrupted`：服务重启导致中断

### `POST /api/v1/admin/precache/estimate`

估算预缓存任务规模。请求体与创建任务一致，但不会真正创建任务；即使预计瓦片数超过上限，也会返回 `withinLimit: false` 和估算数据，便于前端展示。

返回字段包含：

- `total`：预计瓦片文件数量
- `ranges`：各缩放级别瓦片范围和数量
- `maxTiles`：服务端允许的任务瓦片上限
- `withinLimit`：是否在任务上限内
- `estimatedBytes`：按经验平均值估算的下载体积
- `estimatedBytesRange`：经验估算体积区间

### `POST /api/v1/admin/precache/tasks`

创建有边界限制的预缓存任务。

```json
{
  "providerId": "amap-road",
  "bounds": {
    "west": 113.24,
    "south": 23.11,
    "east": 113.29,
    "north": 23.15
  },
  "minZoom": 12,
  "maxZoom": 12,
  "concurrency": 4,
  "refresh": false
}
```

后端会校验图层、区域、缩放级别、并发数和任务瓦片总数。无效或超出上限的任务会被拒绝。

若基于历史任务创建更新任务，应复用历史任务的 `providerId`、`bounds`、`minZoom`、`maxZoom` 和 `concurrency`，并设置 `refresh: false`。此时已有且新鲜的缓存会直接跳过，缺失或过期缓存会按正常缓存流程下载或条件更新。

### `POST /api/v1/admin/precache/tasks/:id/pause`

暂停预缓存任务。`queued` 任务会直接变为 `paused`；`running` 任务会先变为 `pausing`，当前正在下载的瓦片结束后变为 `paused`。

### `POST /api/v1/admin/precache/tasks/:id/resume`

继续 `paused` 或 `interrupted` 任务。任务会从已完成数量之后的瓦片继续执行。

### `DELETE /api/v1/admin/precache/tasks/:id`

删除预缓存任务。执行中的任务会被标记停止，并从任务列表和持久化快照中移除。

## 已移除接口

旧版工具和测试接口已移除：

- 公开缓存管理接口 `/api/v1/cache/fetch-relay`，缓存查看和清理统一收口到鉴权后的 `/api/v1/admin/cache`
- 随机本地文件选择
- Wallhaven 壁纸选择
- GitLab webhook
- 静态资源/包搜索辅助接口
- `/login`

新增接口应放在 `/api/v1` 下，在 `service/bin/simpleApi.js` 注册，并同步更新本文档。
