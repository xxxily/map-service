# 用户体系部署与运维

> 状态：适用于当前用户体系（SQLite schema v11）
> 更新日期：2026-08-29

本文说明用户数据库初始化、首个超级管理员引导、备份、恢复、上线检查和当前运维边界。接口契约见 [用户体系与多 KML 分享 API](./api-user-system.md)。

## 1. 数据存储

默认用户数据库：

```text
.db/map-service.sqlite
```

可通过环境变量覆盖：

```bash
MAP_SERVICE_USER_DATABASE=/absolute/path/map-service.sqlite
```

密码分享的所有者复制能力需要长期稳定的服务端密钥：

```bash
MAP_SERVICE_SHARE_SECRET_KEY='replace-with-a-long-random-stable-secret'
```

未显式配置时会兼容回退使用 `MAP_SERVICE_ADMIN_TOKEN_SECRET`，但生产环境建议单独配置并纳入密钥备份。该值不得随普通发布、进程重建或配置整理发生变化。

如服务位于反向代理后，必须按实际可信代理跳数或网段显式配置 Express 代理信任，例如：

```bash
MAP_SERVICE_TRUST_PROXY=1
# 或仅信任明确网段
MAP_SERVICE_TRUST_PROXY=loopback,10.0.0.0/8
```

默认不信任任何转发头。只有启用该配置后，`req.ip` 和 `req.secure` 才会采用可信代理提供的客户端 IP 与协议；不要在应用可被公网直接访问时配置过宽的代理范围。

数据库保存：

- 用户、密码哈希和账号状态。
- 角色、权限和用户角色关系。
- 可撤销会话、CSRF 哈希和权限版本。
- 用户 KML、收藏、分享包、分享密码校验哈希，以及仅供所有者主动复制时解密的 AES-256-GCM 密文。
- 用户体系设置、本地迁移批次和脱敏审计日志。

既有图源、代理、公共 KML和运行设置仍保存在 `.db/admin/`；完整备份必须同时覆盖 SQLite 和 `.db/admin/`。

服务启动时自动创建数据库目录、启用外键、设置 `busy_timeout`、尝试切换 WAL，并按 `schema_migrations` 执行幂等迁移。当前数据库版本为 `11`：v2～v4 完善 KML 同步幂等和删除墓碑；v5 增加空间受限分享与不限固定期授权；v6 增加手动同步的发布快照；v7 增加访问聚合、统计配置和动态限流字段；v8 增加分享密码的所有者专用加密密文；v9 增加 KML 目录、目录内文件排序及分享目录引用字段；v10 增加用户头像与性别；v11 按用户和目录重排 active KML 位置，并把历史回收记录的位置归零；仅实际变更位置的行会递增 revision 和更新时间。

## 2. 首个超级管理员

首次启动且数据库中没有有效超级管理员时，服务使用以下变量创建引导账号：

```bash
MAP_SERVICE_ADMIN_USERNAME=map-root
MAP_SERVICE_ADMIN_PASSWORD='replace-with-a-long-unique-password'
MAP_SERVICE_REQUIRE_SECURE_BOOTSTRAP=true
```

规则：

- 密码立即使用 scrypt 哈希写入 SQLite，不保存明文。
- `NODE_ENV=production` 会自动启用安全引导门禁；测试或共享环境应显式设置 `MAP_SERVICE_REQUIRE_SECURE_BOOTSTRAP=true`。
- 数据库尚无有效超级管理员时，如果未同时显式配置账号和合规强密码，服务拒绝启动，不会创建 `admin/admin`。
- 安全引导门禁开启时弱密码会直接导致启动失败；仅非生产开发兼容模式会创建 `mustChangePassword=true` 的临时账号并强制先改密。
- 数据库已有有效超级管理员后，重启或修改环境变量不会覆盖现有密码。
- 数据库没有有效超级管理员时，若引导用户名已属于普通或停用账号，服务会以显式引导密码重置该账号、清除锁定状态、递增权限版本、撤销全部旧会话，再授予超级管理员。旧密码和旧会话均不能继承新权限。
- 系统阻止停用、删除或降级最后一个有效超级管理员。
- 旧 `MAP_SERVICE_ADMIN_TOKEN_SECRET` 不再用于管理接口鉴权；迁移后的旧管理 Bearer Token 统一失效，新登录不签发 Bearer Token。

生产环境禁止使用默认 `admin/admin`。建议首个超级管理员完成登录、改密和第二个应急超级管理员创建后，再开放其他管理操作。

## 3. 启动与升级

基础环境：

```text
Node.js >= 22.13.0
npm >= 10.0.0
```

标准流程：

```bash
npm install
npm run check
npm test
npm run build
npm run exec
```

升级前：

1. 确认当前进程和数据库路径。
2. 按第 5 节创建可恢复备份。
3. 在测试环境使用备份副本启动新版本，确认 migration 和登录正常。
4. 执行 `npm run check`、`npm test`、`npm run build`。
5. 在维护窗口停止旧进程、部署新代码并启动。
6. 验证健康检查、超级管理员登录、会话、CSRF、用户列表、个人 KML和分享页。

升级到 schema v11 后，额外抽查每个用户/目录的 active `position` 是否为从 0 开始的连续序列；回收站记录不参与 active 顺序。不要在迁移前手工修改生产 `position`。

不要手工修改 `schema_migrations`、密码哈希、会话 Token 哈希或角色关系表。

## 4. 上线安全检查

- 首个超级管理员不是默认账号密码，且已完成强制改密。
- 生产数据库位于持久化磁盘，目录权限只允许服务账号和备份账号读取。
- HTTPS 终止、反向代理和应用的 Secure Cookie 判断配置一致。
- 反向代理只在受信边界内设置客户端 IP，并按实际拓扑配置 `MAP_SERVICE_TRUST_PROXY`；应用限流和 Secure Cookie 使用 Express 解析后的 `req.ip` / `req.secure`，不直接信任任意客户端转发头。
- 不在日志、监控标签、错误页或备份文件名中写入密码、Token、Cookie、CSRF 或分享密码。应用访问日志会脱敏 `password`、`token` 等敏感查询参数；Caddy、Nginx、CDN 和上游负载均衡的访问日志也必须关闭完整查询串记录，或对这些参数执行同等脱敏。
- `MAP_SERVICE_SHARE_SECRET_KEY` 已持久化备份且发布前后保持一致。更换该密钥不会破坏分享密码的哈希访问验证，但会使已有 `password_secret` 无法解密；服务不会尝试从旧哈希恢复明文，所有者需重新设置一次分享密码才能恢复复制密码和带密码链接。当前没有正式用户，缺少或不可解密的测试分享密码副本直接删除分享并按新规则重建。
- 用户体系设置中的 `share.passwordlessSharingEnabled` 默认关闭；开启后无密码分享可使用固定期限或 `expiresAt=null`，公开 `passwordAccess.ttlMode` 为 `not_applicable`。关闭后新建、移除密码、继续保存、同步内容和轮换无密码分享均被拒绝。空间受限分享重建后统一使用 `version=2`、`geometryType=BoundingBox`；旧测试分享直接删除并按当前规则重建。
- 注册默认关闭；需要开放时由拥有 `admin.registration.manage` 的账号显式开启。
- 普通管理员只分配日常运维权限；用户、角色、注册和根安全策略保留给超级管理员。
- 站点访问密码、用户会话和分享密码分别测试，确认不存在互相绕过。
- 分享 scoped catalog 只能访问受控公开栅格图源，不能传入任意 URL。

## 5. 备份

### 5.1 推荐：维护窗口冷备

SQLite 使用 WAL。最简单可靠的方式是在短维护窗口停止应用写入后备份：

1. 停止 map-service 进程，确认没有进程继续写数据库。
2. 备份以下内容：

```text
.db/map-service.sqlite
.db/map-service.sqlite-wal（若存在）
.db/map-service.sqlite-shm（若存在）
.db/admin/
```

3. 对备份目录生成校验哈希，并记录应用版本、数据库版本、备份时间和原始路径。
4. 将备份复制到与应用主机故障域不同、具备访问控制和保留策略的位置。
5. 启动服务并完成健康检查。

应用完全停止且 WAL 已正常 checkpoint 后，`-wal`、`-shm` 可能不存在；不要在服务仍运行时只复制主 `.sqlite` 文件。

### 5.2 在线备份

必须在线备份时，使用支持 SQLite Online Backup API 的受控工具创建一致性快照，不要用普通文件复制拼接一个正在写入的数据库。在线备份脚本应先在恢复演练中验证，并把失败视为备份失败，不得上传半成品。

### 5.3 保留建议

- 每日备份至少保留 7 份。
- 每周备份至少保留 4 份。
- 重大升级前备份单独标记并保留至升级稳定期结束。
- 至少每季度做一次隔离环境恢复演练。

## 6. 恢复

恢复会覆盖当前用户、会话、KML、收藏、分享和角色状态，必须在明确维护窗口执行。

1. 停止应用并确认所有实例已退出。
2. 先把当前 `.db/map-service.sqlite*` 和 `.db/admin/` 移到独立故障留存目录，不直接删除。
3. 校验备份哈希、应用版本和数据库版本。
4. 将同一备份批次的 SQLite 文件及 `.db/admin/` 恢复到原路径，并修正属主和权限。
5. 使用与备份兼容的应用版本启动；服务会校验 `schema_migrations`。
6. 验证：

   - `GET /health` 和 `GET /api/v1/health`。
   - 超级管理员登录和 `GET /api/v1/admin/session`。
   - 角色权限、注册开关和审计日志。
   - 一个普通用户的 KML、收藏和分享清单。
   - 一个匿名分享链接及其底图瓦片。

7. 确认恢复成功后再按保留策略处理故障留存目录。

若服务报告“不支持的用户数据库版本”，不要修改版本号强行启动；应使用匹配应用版本恢复，或先在副本上完成受支持迁移。

## 7. 故障处理

### 数据库被锁

- 确认是否误启多个写实例或备份工具长时间占用事务。
- 当前服务设置 5 秒 `busy_timeout`，但 SQLite 仍不适合多个独立应用实例高并发写入。
- 不要删除 WAL 文件来“解锁”；先停止写进程并在副本上诊断。

### 超级管理员无法登录

- 确认账号状态不是 `disabled`、`locked`、`deleted`。
- 环境变量不会覆盖已有账号密码，这是预期行为。
- 优先使用第二个超级管理员在后台重置密码。
- 没有可用超级管理员时，应在数据库备份副本和受审计的维护流程中处理，不直接在线修改密码哈希。

### 会话大面积失效

- 修改用户角色或角色权限会提升权限版本并撤销相关旧会话，这是安全设计。
- 修改密码、停用账号和管理员强制退出也会撤销会话。
- 检查系统时钟、Cookie 域/路径、HTTPS 和反向代理配置。

### KML 持续返回 `KML_MOVE_INVALID`

- 先确认应用代码和数据库 schema 均已升级到 v11。v11 会按 `owner_id + directory_id` 修复历史 active 顺序；普通更新也兼容旧客户端回传的同一条历史越界位置。
- 查看接口返回的 `error.details.fileName`、`action`、`kmlId`、`reason` 和 `suggestion`，不要只依据“保存失败”状态判断。
- 若升级后仍出现，使用数据库备份副本审计同一用户/目录的 active `position` 和 revision；不要直接在线重排或删除生产记录。

### 回收站数量异常或存在大量重复文件

- `GET /api/v1/kml/files` 的 `usage.fileCount/featureCount` 只表示 active 配额；`trashCount/trashFeatureCount/trashByteSize` 是回收站物理占用，二者不得相加后作为可用配额。
- 每日 03:40（Asia/Shanghai）运行回收站保留期任务，按用户 `trashRetentionDays` 分批永久清理；仍被分享引用的记录会保留并写审计。
- 对正式环境历史数据只做只读统计和抽样比对。任何批量恢复或永久删除前必须完成 SQLite/WAL 一致性备份、分享引用审计、用户归属确认和可回滚演练；不能仅凭名称重复就直接删除。

### 分享无法访问

- 检查状态是否为 `paused`、`revoked`、`blocked` 或已过期。
- 检查 `share.publicAccessPolicy` 是否继承站点访问密码。
- 密码分享需要路径受限的分享授权 Cookie。
- 轮换链接后旧 `publicId` 立即失效。

## 8. 当前限制与后续运维项

- 登录、注册和分享密码限流存储在单进程内存中；多实例部署必须改为 Redis 等共享限流存储。
- SQLite 和当前会话实现以单机、单写进程为部署基线，不承诺横向扩展。
- 当前启动迁移不会自动复制数据库备份；升级前必须按本手册完成冷备或受控在线备份。
- 回收站 `trashRetentionDays` 已由每日异步任务执行；运维仍需监控被分享引用而长期保留的记录和数据库物理空间。
- 尚无超级管理员跨用户转移 KML 所有权的接口。
- KML 解析不支持 KMZ、MultiGeometry 和完整样式体系。
- 分享访问次数为基础计数，不是高精度分析系统。
- 分享 scoped catalog 当前只支持受控公开栅格图源。

这些限制不应通过直接修改数据库、放宽代理 URL 或返回敏感字段来绕过；需要扩展时应先更新需求、接口、安全边界和测试。
