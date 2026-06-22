# 提交 23174ea 代码审查

审查对象：`23174ea10eac140ced08bd899ae91e653c4f3e7b`

提交说明：优化搜索预填充、支持瓦片预加载与地图旋转，并支持记住最后位置与图层。

审查日期：2026-06-17

## 结论

建议先处理高优先级问题后再发布。功能方向本身清晰，`npm run check`、`npm test`、`npm run build` 在目标提交的临时干净 worktree 上均已通过，但新增运行时依赖许可证、旋转事件写入频率、全局原型改写和后台 AutoComplete 生命周期仍有明显改进空间。

## 高优先级

### 1. 新增 `leaflet-rotate` 为 GPL-3.0 运行时依赖，需要许可证确认或替换

位置：

- `package.json:30`
- `package-lock.json:1202`
- `package-lock.json:1206`
- `src/main.js:3`

问题：

本提交新增 `leaflet-rotate@0.2.8`，包元数据和 lockfile 均标注为 `GPL-3.0`。该依赖被打进前端生产产物 `service/app/assets/index-rBnqiHyb.js`，属于浏览器端分发代码。若项目不是按 GPL 兼容方式分发，可能带来合规风险。

建议：

- 发布前由项目负责人确认 GPL-3.0 是否可接受。
- 如不可接受，优先寻找 MIT/BSD/Apache-2.0 等宽松许可证的旋转方案。
- 如果继续使用，应在项目依赖治理文档中明确该许可证和分发策略。

## 中优先级

### 2. 地图视图从 `localStorage` 恢复时缺少结构和值域校验，可能导致地图初始化失败

位置：

- `src/map/url-state.js:20`
- `src/map/url-state.js:31`
- `src/map/url-state.js:35`

问题：

`parseDefaultView()` 会直接使用 `last_map_view.center`、`zoom`、`bearing` 作为默认值。只要本地缓存被旧版本、调试代码、浏览器扩展或用户手动写成异常结构，例如 `center: [null, "x"]` 或超出经纬度范围，最终可能把非法中心点传给 Leaflet，导致地图启动失败。当前 URL 参数只校验了 `Number.isFinite`，但本地缓存没有同等校验。

建议：

- 抽出 `normalizeMapView(raw)`，统一校验 `center` 是长度为 2 的有限数字数组。
- 校验纬度、经度、缩放级别、旋转角度范围，失败时回退 `defaultMapView`。
- 对 `zoom` 使用 `Number.isFinite`，不要用 `localView?.zoom || defaultMapView.zoom` 这种会误伤 `0` 的写法。

### 3. `rotate` 事件中同步写 URL 和 `localStorage`，触控旋转时可能造成性能抖动

位置：

- `src/main.js:66`
- `src/main.js:67`
- `src/map/url-state.js:45`
- `src/map/url-state.js:52`
- `src/map/url-state.js:56`

问题：

`rotate` 事件会调用 `writeMapViewToUrl()`，而该函数同时执行 `history.replaceState` 和同步 `localStorage.setItem`。触控旋转或 Shift+滚轮旋转会高频触发该事件，频繁同步写入会阻塞主线程，也会制造大量 URL 更新。

建议：

- 对 URL 和本地存储写入做节流，例如 `requestAnimationFrame` 或 100-200ms throttle。
- 区分即时 UI 更新和持久化写入：旋转过程中只更新按钮状态，持久化延迟到交互结束或节流写入。
- 将 `writeMapViewToUrl` 改成可选参数，例如 `{ persist: true }`，避免所有调用路径都写 `localStorage`。

### 4. 直接改写 `L.GridLayer.prototype._getTiledPixelBounds` 风险较高

位置：

- `src/map/layers.js:5`
- `src/map/layers.js:6`
- `src/map/layers.js:34`

问题：

本提交通过改写 Leaflet 私有方法 `_getTiledPixelBounds` 实现预加载。该方法不是稳定公共 API，并且 `leaflet-rotate` 也会改写 `L.GridLayer` 行为。当前导入顺序下通常能叠加工作，但这类全局 monkey patch 容易在依赖升级、测试隔离、热更新或后续插件引入时产生不可预期影响。

另外，默认已有 `keepBuffer: 10`，再叠加 `preloadBuffer: 256` 会增加初次加载和旋转/拖动期间的瓦片请求量，需要和后端缓存、上游限流能力一起评估。

建议：

- 优先使用 Leaflet 公共配置能力，或封装项目自己的 `createPreloadTileLayer` 子类，不直接改全局原型。
- 将预加载参数集中到配置中，给出按设备/网络调整的开关。
- 增加浏览器端手工或自动化验证：普通拖动、旋转、缩放、图层切换时瓦片请求数量是否可控。

### 5. 后台预缓存面板的高德 AutoComplete 实例没有生命周期管理

位置：

- `src/admin/panels/precache.js:140`
- `src/admin/panels/precache.js:181`
- `src/admin/panels/precache.js:183`
- `src/admin/panels/precache.js:186`

问题：

`initPrecacheMap()` 每次进入预缓存面板都会创建新的 `AMap.AutoComplete`，但没有保存实例，也没有在面板切换或地图销毁时解绑事件。当前只删除 `.amap-sug-result` DOM，不能保证 SDK 内部监听器、异步回调和输入框引用被释放。若 `loadAmapForAdmin(state)` 的 Promise 在面板切走后才 resolve，还会对已经不在当前界面的输入框继续初始化。

建议：

- 在 `state` 中保存 `precacheAutoComplete` 和初始化序号。
- 重新初始化前按 SDK 支持的方式销毁或解绑旧实例；至少在回调里校验当前输入框仍存在、初始化序号仍匹配。
- 避免写死全局 `id`，可用稳定但唯一的 id，或通过当前 DOM 节点绑定。

### 6. `last_map_layer` 读取没有异常保护

位置：

- `src/map/layers.js:40`
- `src/map/layers.js:41`

问题：

`url-state.js` 对 `localStorage` 读写做了 `try/catch`，但 `layers.js` 直接调用 `localStorage.getItem`。在隐私模式、存储被禁用、嵌入式 WebView 或浏览器策略限制下，读取也可能抛异常，导致地图初始化中断。

建议：

- 增加统一的 storage helper，例如 `safeGetLocalStorage(key, fallback)`、`safeSetLocalStorage(key, value)`。
- `last_map_view`、`last_map_layer` 和后台 token 均可逐步复用该 helper，降低散落异常处理。

### 7. `leaflet-rotate` 默认会添加自己的旋转控件，可能与自定义重置按钮冲突

位置：

- `src/main.js:42`
- `src/main.js:46`
- `src/main.js:66`
- `index.html:19`

问题：

项目新增了自定义的 `reset-bearing-btn`，但 `leaflet-rotate` 默认 `rotateControl` 为开启。地图初始化时没有显式关闭插件默认控件，可能在左上角出现一个未按项目 UI 风格设计的旋转控件，同时右下角又有自定义重置按钮，交互入口重复。

建议：

- 如果只保留项目自定义按钮，在 `L.map` 选项中显式设置 `rotateControl: false`。
- 如果保留插件控件，则删除自定义按钮或统一样式与行为，避免两个入口表达不同状态。

## 低优先级

### 8. URL 状态写入会覆盖现有 query 参数

位置：

- `src/map/url-state.js:52`

问题：

`replaceState(null, '', \`?coords=${coords}\`)` 会丢弃当前 URL 中除 `coords` 外的其他参数。虽然旧实现也存在类似行为，但本提交继续扩展了 URL 状态语义，建议一并修正，避免后续增加分享参数、调试参数或 PWA 参数时被地图移动清掉。

建议：

- 基于当前 `URLSearchParams` 更新 `coords`，保留其他参数。
- 对管理入口这类特殊参数，明确是否允许地图页面保留或清理。

### 9. 搜索标记清理使用模块级变量，可维护性一般

位置：

- `src/map/search.js:3`
- `src/map/search.js:24`
- `src/map/search.js:28`

问题：

`currentSearchMarker` 是模块级变量。当前主地图只有一个实例时问题不大，但后续如果增加多地图、测试并行或页面内重新初始化，状态归属不够清晰。

建议：

- 将搜索标记挂到地图实例相关的上下文对象中。
- 或让 `initAmapSearch` 返回清理函数，调用方在地图销毁时统一释放。

## 验证记录

在临时 worktree `/tmp/map-service-review-23174` 上基于目标提交验证：

- `npm ci`：通过
- `npm run check`：通过
- `npm test`：通过，18 个测试全部通过
- `npm run build`：通过，生成 `service/app/assets/index-rBnqiHyb.js` 和 `service/app/assets/index-59lGr_9n.css`

补充检查：

- `npm view leaflet-rotate@0.2.8 license` 返回 `GPL-3.0`
- `leaflet-rotate` 包源码依赖全局 `L` 并包含默认 `rotateControl`，当前 Vite 构建可完成，但建议补充真实浏览器交互验证

## 建议处理顺序

1. 先确认或替换 `leaflet-rotate` 许可证。
2. 修复 `localStorage` 读取和视图恢复校验。
3. 节流旋转期间的 URL/本地存储写入。
4. 收敛瓦片预加载实现，避免全局私有方法 patch。
5. 补齐后台 AutoComplete 生命周期管理。
6. 统一旋转控件入口和 URL 参数保留策略。
