# KML 目录管理、文件排序与分享点位聚合需求

状态：实现完成（2026-08-26）

## 1. 背景与目标

当前 KML 管理只按文件平铺展示，用户无法按主题组织文件，也无法稳定调整文件顺序；分享编辑、地图 KML 面板和管理后台之间的组织语义不一致。分享地图在低缩放级别展示大量点位时还会造成视觉噪声和渲染压力。

本需求建立统一的 KML 组织模型，并在分享地图提供可选的点位聚合：

- 用户可以创建、重命名、排序和删除目录；目录可以批量显示/隐藏。
- KML 文件可以拖动或通过选择器移动到目录，并在目录内或根目录排序。
- KML 文件自身的显隐仍独立可控；目录显隐是批量操作，不覆盖用户对文件的后续单独设置。
- “我的 KML”“我的分享”、地图 KML 面板和管理后台使用同一目录/文件顺序与稳定 ID。
- 分享可以选择单个文件或整个目录；发布时展开为文件快照，后续目录变更不隐式改变已发布内容。
- 分享聚合只作用于 Point，默认关闭；开启后按缩放级别和屏幕像素网格递归聚合，点击聚合图标放大到可继续拆分的级别，最终展开点位。LineString/Polygon 和点位详情、编辑拖拽不参与聚合。

## 2. 范围

### 2.1 包含

1. 个人 KML 目录模型、目录 CRUD、目录排序、文件归属和文件排序。
2. 个人 KML 列表、地图侧栏和“我的分享”目录选择/展开。
3. 分享编辑目录选择、目录展开后的文件排序与默认显隐。
4. 分享公开 manifest 的聚合配置和分享页 2D 点位聚合。
5. SQLite 迁移、输入校验、权限检查、审计、接口文档和自动化测试。

### 2.2 不包含

- 目录嵌套；第一版目录为单层目录，`parentId` 固定为空。
- 公共 KML（管理员公共图层）目录化；公共 KML 仍维持现有管理模型。
- 3D Cesium 点位聚合；分享配置在 3D 下仍返回但 3D 第一阶段不启用聚合。
- 线段/面要素聚合或改变已有要素拖拽编辑行为。

## 3. 领域模型与兼容规则

### 3.1 目录

目录字段：`id`（服务端稳定 ID）、`ownerId`、`name`、`position`（非负整数）、`enabled`、`createdAt`、`updatedAt`。名称经 NFKC、去控制字符和长度校验，单层目录名称在同一用户下唯一（大小写不敏感）。

系统保留虚拟目录“未分类”，不落库为可删除实体，`directoryId = null` 的历史和新建文件均显示在该目录。删除实体目录时文件移动到未分类，不删除文件。

### 3.2 KML 文件

新增 `directoryId` 和 `position` 字段。`position` 只在同一目录（含未分类）内比较；排序接口采用完整 ID 顺序提交，服务端重新编号，避免客户端稀疏序号和并发冲突。默认 KML仍受默认文件保护，但可以显示在未分类目录中。

文件拖拽与要素拖拽必须使用不同数据类型和 DOM 标记：

- 文件：`application/x-map-service-kml-file`、`data-kml-file-draggable`。
- 要素：保留 `application/x-map-service-kml-feature`、`data-kml-draggable`。

### 3.3 分享快照

分享创建/编辑时目录选择先展开为当前用户有权访问的 active 文件，按当前文件顺序写入 `kml_share_items.position`。分享项增加 `directoryId`、`directoryName`（仅用于所有者编辑回显）和 `sourcePosition` 快照字段；公开 manifest 只返回渲染所需的 `directoryId`、`directoryName`、`position`、`visibleByDefault`，不返回目录管理字段。

已发布分享不会因目录重命名、移动或排序自动改变；所有者必须在“我的分享”显式保存/同步分享后才生成新的发布快照。目录删除仅影响未保存的选择器回显。

### 3.4 聚合配置

聚合配置位于分享 `viewConfig.kmlPointClustering`：

```json
{
  "enabled": false,
  "minZoom": 0,
  "maxClusterZoom": 13,
  "gridSize": 64,
  "maxMembersPerCluster": 5000
}
```

默认 `enabled=false`，保持现状。服务端限制：`minZoom`/`maxClusterZoom` 为 0～24 整数且 `minZoom <= maxClusterZoom`；`gridSize` 为 24～128 像素整数；`maxMembersPerCluster` 为 100～20000 整数。公开 manifest 仅在配置启用时返回归一化配置。

管理员强制聚合策略中的 `share.kmlClusterMinPoints` 与分享级配置分开校验：管理员值只要求为不小于 `2` 的安全整数，不设置旧的 `1000` 固定最大值；分享所有者的 `viewConfig.kmlPointClustering` 仍保留本节面向单个分享算法参数的技术边界。

## 4. 用户流程

### 4.1 目录管理

- 在“我的 KML”或地图 KML 面板点击新增目录，输入目录名称后创建。
- 目录标题提供显示/隐藏按钮、重命名和删除操作；目录按钮只批量切换该目录当前文件的显示状态，不改变文件持久化 `enabled` 以外的编辑权限。
- 文件可拖动到目录标题/目录列表，也可在文件操作中用目录选择器移动。
- 文件在同目录拖动可改变顺序；跨目录拖动先移动再插入目标位置。
- 目录排序通过目录拖动完成；目录与文件拖动区域视觉和事件标记明确区分。

### 4.2 分享编辑

- 分享对话框按目录分组显示活跃文件，支持勾选整个目录、取消整个目录和展开目录后选择单文件。
- 选择目录时按当前目录文件顺序加入；右侧仍可对已选文件排序和设置默认显隐。
- 分享配置提供“分享地图点位聚合”开关；关闭时不发送聚合字段或发送 `enabled:false` 均归一为关闭。

### 4.3 分享地图

- 开启聚合且当前缩放低于 `maxClusterZoom` 时，只对视口内 Point 计算聚合；每个聚合图标显示成员数量。
- 点击聚合图标以动画放大到下一拆分级别；若仍密集则继续显示子聚合，不能一次性强制展开全部点位。
- 达到阈值或聚合成员只有 1 个时恢复普通点位、媒体交互、标签和 popup。
- 线段和面始终按现有视口虚拟化/渲染路径处理；点位聚合不得关闭 Leaflet 连续缩放动画。

## 5. 接口契约

### 5.1 目录

| 方法 | 路径 | 权限 | 说明 |
| --- | --- | --- | --- |
| GET | `/api/v1/kml/directories` | `kml.own.read` | 返回目录及每个目录的文件计数、显隐汇总 |
| POST | `/api/v1/kml/directories` | `kml.own.write` | 创建目录，body `{name}` |
| PUT | `/api/v1/kml/directories/:id` | `kml.own.write` | 重命名或更新 `enabled` |
| DELETE | `/api/v1/kml/directories/:id` | `kml.own.write` | 删除目录，文件转入未分类 |
| POST | `/api/v1/kml/directories/reorder` | `kml.own.write` | body `{ids: string[]}`，提交完整目录顺序 |
| POST | `/api/v1/kml/directories/:id/visibility` | `kml.own.write` | body `{enabled: boolean}`，批量设置目录文件显隐 |

### 5.2 文件组织

现有 `GET /api/v1/kml/files` 响应增加 `directoryId`、`directoryName`、`position`；支持 `directoryId` 筛选和 `sort=position`。现有 `PUT /api/v1/kml/files/:id` 接受 `directoryId`、`position`。新增：

| 方法 | 路径 | 权限 | 说明 |
| --- | --- | --- | --- |
| POST | `/api/v1/kml/files/reorder` | `kml.own.write` | body `{directoryId: string|null, ids: string[]}`，同目录完整顺序 |
| POST | `/api/v1/kml/files/:id/move` | `kml.own.write` | body `{directoryId: string|null, beforeId?: string|null}` |

### 5.3 分享

现有 `POST/PUT /api/v1/kml/shares` 的 `items` 支持 `directoryId` 项：服务端在创建/保存时展开目录并去重；也继续兼容 `{kmlId}`。`viewConfig` 增加 `kmlPointClustering`。公开 `GET /api/v1/public/kml-shares/:publicId` manifest 的每个 item 增加 `directoryId`、`directoryName`，并返回归一化的 `viewConfig.kmlPointClustering`。

成功响应、错误码和分页规则沿用 `jsonSuc/jsonErr`；新增错误码包括 `KML_DIRECTORY_NOT_FOUND`、`KML_DIRECTORY_NAME_CONFLICT`、`KML_DIRECTORY_INVALID`、`KML_REORDER_INVALID`、`KML_MOVE_INVALID`、`SHARE_CLUSTER_CONFIG_INVALID`。

## 6. 权限、安全与边界

- 目录和文件始终按 owner 过滤；跨用户 ID 一律按 `RESOURCE_NOT_FOUND` 处理，不能泄露存在性。
- 回收站文件不可进入分享；目录批量显隐只作用于 active 文件，默认文件可显示但不能被目录操作删除。
- 公开响应不得返回 owner 内部 ID、管理备注、密码、Token、代理信息或未发布文件。
- 目录最多 200 个、单目录文件最多受用户 KML 配额限制；目录名称最多 80 个字符。
- 聚合计算必须有稳定的 Point ID 和准确成员计数；禁止用固定数量静默丢弃点位。成员超限时分层聚合或继续保留计数，不丢失可达路径。

## 7. 验收标准

1. 新建、重命名、删除目录及删除后的未分类转移可通过 API 和 UI 完成，并有鉴权/非法输入测试。
2. 文件拖动、选择移动、同目录排序和跨目录排序可持久化；要素拖动仍只改变要素坐标/要素顺序，不触发文件移动。
3. 目录显隐和单文件显隐在刷新、重新登录和分享编辑后保持一致；目录按钮不产生重复请求或状态反转。
4. 分享选择目录后包含目录当时的全部 active 文件，保存后公开 manifest 顺序与默认显隐稳定；历史分享兼容无目录字段的记录。
5. 聚合关闭时现有分享地图渲染结果和连续缩放行为不变；开启时仅分享页 Point 聚合，点击聚合可逐级放大，LineString/Polygon 和媒体 popup 不受影响。
6. 完成 `npm run check`、`npm test`、`npm run build`；若环境阻断必须记录具体命令和原因。

## 8. 实施顺序

1. SQLite schema v9、纯函数 normalize/排序/聚合算法和服务层测试。
2. REST 路由、API 文档和个人 KML/分享服务契约。
3. 账户页和分享对话框目录管理、文件移动排序和显隐。
4. 地图 KML 面板目录渲染、文件拖拽与目录批量显隐。
5. 分享页点位聚合、性能/连续缩放验证。
6. 回归、构建和开发记录。
