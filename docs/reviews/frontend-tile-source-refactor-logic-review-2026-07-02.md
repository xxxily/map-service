# 前端图源/图层重构逻辑审查

审查日期：2026-07-02

审查范围：当前工作区内前端图源、图层、代理、缓存、预缓存、对外发布相关逻辑实现。重点检查 `src/admin/`、`src/map/layers.js`、`src/3d.js` 与后端接口契约的匹配情况。

不在本次范围：视觉样式、布局美观度、交互动效、组件外观评价。

## 结论

建议先修改后再交付前端对接。当前实现能通过语法检查和生产构建，但仍存在几个会影响核心功能闭环的问题：对外发布功能没有覆盖专用图源/代理/缓存覆盖配置，组合图层发布给出的接入 URL 是错误接口，图层表单模板存在可能破坏提交链路的结构错误，诊断日志“查看全部”也无法按当前后端路由工作。

## 修复处理记录

处理日期：2026-07-02

本审查列出的 11 项逻辑问题已完成处理：

- 对外发布表单已支持系统图源、专用图源、组合图层，并支持发布项级代理覆盖和缓存覆盖。
- 组合图层发布示例已改为后端 source tile 接口，按图层图源列表输出多 URL 叠加示例。
- 组合图层编辑表单结构已修复，保存链路所需字段保持在同一 form 内。
- 诊断日志“查看所有日志”已接入 `GET /api/v1/admin/external-publish-logs`，并保留错误状态展示。
- 图源/图层保存、删除、设置默认后会同步刷新预缓存目录。
- 前台 2D/3D 已改为校验后端 catalog 响应，并使用受控后端 fallback 图源。
- 2D 图层控制已处理重名展示，内部仍保留图层 ID 映射。
- 代理/图源/发布测试结果已统一读取 `errorMessage`，代理池按成员成功数展示。
- 2D/3D 图层创建已使用图源级 `tileUrl`、缩放、原生缩放、瓦片尺寸等元数据。
- 组合图层预缓存估算已展示分源明细。
- 旧 `tileApiLogs`、`clearTileApiLogs` 前端 API 方法已删除。

修复后验证：

- `npm run check`：通过。
- `npm test`：通过，54 个用例全部通过。
- `npm run build`：通过；Vite 仍提示 3D chunk 超过 500 kB，这是体积警告，不阻塞构建。

## 高优先级问题

### 1. 对外发布表单缺少专用图源、代理覆盖、缓存覆盖能力

位置：

- `src/admin/pages/tileSources.js:499`
- `src/admin/pages/tileSources.js:507`
- `src/admin/pages/tileSources.js:1198`
- `src/admin/pages/tileSources.js:1216`
- `docs/api.md:481`
- `docs/api.md:486`
- `docs/api.md:487`

问题：

后端发布项模型支持 `targetType: source | layer | dedicated_source`，并支持 `overrides.proxy`、`overrides.cache` 覆盖发布项的代理和缓存策略。但前端表单只提供“系统图源”和“组合图层”两类目标，提交时还固定写入 `overrides: { proxy: null, cache: null }`。

这会导致需求里明确提到的“对外 API 可以单独配置额外图源、代理重新关联、缓存跟图源/代理/缓存体系对应”无法在前端完成。

建议：

- 对外发布表单补齐 `dedicated_source` 创建或选择链路。
- 对发布项补齐代理覆盖和缓存覆盖配置，至少支持继承、禁用、固定出口、代理池、缓存开关、TTL。
- 不要在提交时无条件把 `overrides` 写成 `null`，否则编辑发布项会清掉后端已有覆盖配置。

### 2. 组合图层对外发布显示的瓦片 URL 是错误接口

位置：

- `src/admin/pages/tileSources.js:578`
- `src/admin/pages/tileSources.js:582`
- `src/admin/pages/tileSources.js:598`
- `service/bin/admin/tileCatalog.js:1215`
- `service/bin/admin/tileCatalog.js:1276`
- `service/bin/admin/tileCatalog.js:1287`

问题：

发布项接入示例始终生成：

```text
/api/v1/external/:pathSlug/{z}/{x}/{y}
```

但后端对 `targetType=layer` 的发布项明确拒绝这个接口，并要求组合图层使用：

```text
/api/v1/external/:pathSlug/sources/:sourceId/{z}/{x}/{y}
```

当前前端会把组合图层发布项的 Leaflet 示例展示成一个不可用的单图源 XYZ 地址，外部用户按示例接入会得到 400。

建议：

- 当 `activePublish.targetType === 'layer'` 时，不展示单一 XYZ 地址。
- 通过 `activePublish.targetId` 找到对应 `mapLayer.items`，生成每个 `sourceId` 的 source tile URL，并提示调用方按顺序叠加。
- TileJSON URL 可以保留为主入口，但示例代码需要按 `sources` 或 `layer.items` 多层叠加。

### 3. 组合图层编辑表单模板存在错误闭合标签，可能破坏提交链路

位置：

- `src/admin/pages/tileSources.js:306`
- `src/admin/pages/tileSources.js:308`
- `src/admin/pages/tileSources.js:316`
- `src/admin/pages/tileSources.js:388`
- `src/admin/pages/tileSources.js:397`
- `src/admin/pages/tileSources.js:1169`
- `src/admin/pages/tileSources.js:1177`

问题：

组合图层表单在 `<form data-tile-sources-form="layer">` 后没有打开对应的 `.form-grid`，但在 `src/admin/pages/tileSources.js:316` 多了一个 `</div>`。浏览器 HTML 解析遇到这种跨层闭合时，可能提前关闭外层 `div` 或 `form`，导致后续字段和保存按钮不再属于该表单。

提交逻辑依赖 `form.elements.enabled`、`form.elements.frontendVisible`、`form.elements.client_2d` 等字段。如果实际 DOM 中这些字段脱离 form，保存组合图层会出现提交不触发或读取字段时报错。

建议：

- 修正表单模板结构，给 ID/名称字段补上明确的 `<div class="form-grid">`。
- 为组合图层表单增加一个轻量前端测试或 DOM 断言，至少覆盖保存时需要读取的字段都属于同一个 form。

## 中优先级问题

### 4. 诊断日志“查看所有日志”当前不可用

位置：

- `src/admin/api.js:140`
- `src/admin/pages/tileSources.js:698`
- `src/admin/pages/tileSources.js:764`
- `service/bin/simpleApi.js:952`

问题：

诊断页提供“查看所有日志”选项，空值会调用：

```text
/api/v1/admin/external-publishes//logs
```

但后端当前只注册了：

```text
/api/v1/admin/external-publishes/:id/logs
```

请求失败后前端直接把日志置空，没有暴露错误，管理员会误以为确实没有日志。

建议：

- 要么前端移除“查看所有日志”，默认选中第一个发布项。
- 要么后端补 `GET /admin/external-publishes/logs` 或 `GET /admin/external-publish-logs`，前端空筛选时调用这个接口。
- 捕获错误时保留错误状态，不要静默显示空表。

### 5. 图源/图层变更后没有刷新依赖目录，预缓存页会读到旧数据

位置：

- `src/admin/dashboard.js:142`
- `src/admin/pages/tileSources.js:1141`
- `src/admin/pages/tileSources.js:1190`

问题：

后台初始化时会加载 `precacheCatalog`，预缓存页依赖这个目录展示可缓存的图源/图层。保存图源后只刷新 `state.tileSources`，保存图层后只刷新 `state.mapLayers`，没有同步刷新 `state.precacheCatalog`。

结果是管理员新建或修改图源/图层后，预缓存页可能仍看不到新条目或继续显示旧权限状态，必须整页重新加载才能恢复。

建议：

- 图源、图层创建/更新/删除成功后，同时刷新 `precacheCatalog`。
- 如果后续还有前台目录预览，也建议抽一个统一的 `reloadCatalogRelatedState()`，避免多个页面状态分叉。

### 6. 前台 2D/3D 地图读取 catalog 的容错和 fallback 不符合新架构

位置：

- `src/map/layers.js:43`
- `src/map/layers.js:45`
- `src/map/layers.js:72`
- `src/map/layers.js:74`
- `src/3d.js:971`
- `src/3d.js:973`
- `src/3d.js:993`
- `src/3d.js:998`

问题：

2D 和 3D 都直接 `fetch('/api/v1/map/catalog')` 后读取 `catalog.result.layers`，没有检查 `res.ok` 和 `payload.code === 0`。当接口返回业务错误 JSON 或非预期结构时，前端会进入本地 fallback。

fallback 也有问题：

- 2D fallback 直接请求高德上游 URL，绕过了后端图源、缓存、代理和访问控制体系。
- 3D fallback 使用 `autonavi-satellite`、`autonavi-road`，但当前默认后端图源 ID 是 `amap-satellite`、`amap-road`，fallback 会请求不存在的图源。

建议：

- 校验 `res.ok` 和 `payload.code`，错误时显示明确的非阻塞错误或受控降级。
- fallback 仍然走 `/api/v1/tiles/:sourceId/...`，并使用后端默认图源 ID。
- 如果 catalog 不可用，不要绕过后端直连上游。

### 7. 2D 图层控制以图层名称作为 key，重复名称会互相覆盖

位置：

- `src/map/layers.js:60`
- `src/map/layers.js:61`
- `src/map/layers.js:116`

问题：

`mapLayers[layer.name] = ...` 会用图层名称作为 Leaflet 控件 key。图层 ID 才是唯一键，名称允许管理员调整，也可能重复。重复名称会覆盖前一个图层，导致某些图层消失、默认图层匹配错误、本地持久化结果不可预期。

建议：

- 内部状态统一用 `layer.id` 作为唯一键。
- Leaflet 控件展示名可以拼接名称和 ID，或维护 `displayName -> id` 映射并处理重名。

### 8. 代理/图源/发布测试结果字段与后端返回不匹配

位置：

- `src/admin/pages/proxy.js:352`
- `src/admin/pages/proxy.js:353`
- `src/admin/pages/proxy.js:409`
- `src/admin/pages/proxy.js:410`
- `src/admin/pages/tileSources.js:881`
- `src/admin/pages/tileSources.js:882`
- `service/bin/admin/tileCatalog.js:1378`
- `service/bin/admin/tileCatalog.js:1382`
- `service/bin/admin/tileCatalog.js:1420`
- `service/bin/admin/tileCatalog.js:1424`

问题：

后端测试接口返回的是 `errorMessage`，代理池返回的是 `members`，且 `success` 表示至少一个出口成功。前端代理出口测试却读取 `res.error`；代理池测试读取 `res.fastestMs` 和 `res.error`，并在成功时显示“全数通过”。这些字段后端并没有返回，成功语义也不一致。

结果是失败原因可能显示为 `undefined`，代理池部分成功会被前端描述成全部成功。

建议：

- 前端统一使用 `errorMessage`。
- 代理池展示应基于 `members` 计算成功数、失败数、最快耗时。
- 文案语义应区分“全部通过”和“至少一个出口可用”。

### 9. 前台图层渲染没有使用图源级元数据

位置：

- `src/map/layers.js:51`
- `src/map/layers.js:54`
- `src/3d.js:1116`
- `src/3d.js:1117`
- `service/bin/admin/tileCatalog.js:567`
- `service/bin/admin/tileCatalog.js:575`

问题：

后端 public catalog 返回 `sources` 和 `layers`，图源里包含 `tileUrl`、`minZoom`、`maxZoom`、`maxNativeZoom`、`tileSize` 等元数据。前端创建 2D/3D 图层时只使用 layer item 的 `sourceId` 和 `opacity`，没有按 `sourceId` 查 `sources`。

这会导致 `maxNativeZoom`、`tileSize` 等图源级配置无法影响客户端渲染。后续接入非 256 瓦片或特殊最大原生级别图源时，前端表现可能和后台配置不一致。

建议：

- catalog 加载后构建 `sourceById`。
- 创建 2D `L.tileLayer` 和 3D `UrlTemplateImageryProvider` 时使用图源级 `tileUrl` 与缩放/尺寸元数据。

### 10. 组合图层预缓存估算没有展示后端返回的分源明细

位置：

- `src/admin/pages/precache.js:161`
- `src/admin/pages/precache.js:169`
- `service/bin/admin/precache.js:415`
- `service/bin/admin/precache.js:428`

问题：

后端对 `targetType=layer` 的估算会返回 `sources` 分源结果，但前端仍只渲染 `estimate.ranges`。组合图层估算时没有 `ranges`，页面会显示“暂无分级明细”，管理员看不到每个图源拆分后的任务规模。

建议：

- 当 `estimate.targetType === 'layer'` 时渲染 `estimate.sources`。
- 创建任务成功返回数组时，也建议在通知或任务列表上明确每个子任务对应的图源名称。

## 低优先级问题

### 11. API 客户端仍保留已移除的旧 tile-api 日志方法

位置：

- `src/admin/api.js:101`
- `src/admin/api.js:102`
- `docs/api.md:739`

问题：

旧的 `/admin/tile-api/logs` 已从后端接口中移除，当前前端没有调用这两个方法，但保留在 API 客户端里会误导后续开发继续使用旧分叉逻辑。

建议：

- 删除 `tileApiLogs` 和 `clearTileApiLogs`。
- 对外发布日志统一走新的 `external-publishes/:id/logs` 契约。

## 验证结果

- `npm run check`：通过。
- `npm test`：失败 1 个用例，`tests/admin.test.js:416` 的 `precache manager allows oversized tasks and applies request interval` 断言 `interval >= 4` 未满足。该失败发生在后端预缓存测试，但会影响本次重构整体交付信心。
- `npm run build`：通过。Vite 提示 `map3d` chunk 超过 500 kB，这是构建体积警告，不阻塞构建。

## 建议修复顺序

1. 先修复对外发布能力缺口和组合图层发布 URL 示例，避免给外部用户错误接入契约。
2. 修复组合图层表单模板结构，并补一个最小 DOM/提交链路测试。
3. 修复诊断日志空筛选、测试结果字段映射、图源/图层保存后的关联状态刷新。
4. 调整 2D/3D catalog 加载、fallback 和 source 元数据使用，让前台展示真正受后台图源配置驱动。
5. 清理旧 API 方法，并补齐关键前端逻辑测试覆盖。
