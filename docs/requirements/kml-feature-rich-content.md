# KML 点位富媒体内容展示需求

状态：第一阶段已实现链接及受支持 HTML 媒体标签解析、公开点位内容接口、媒体点位图标、前台详情面板和统一媒体预览器；当前交互升级为“点位首击预览、整个 KML 连续浏览、全屏与小窗切换”。第二阶段内容库集成规划见 `kml-rich-content-phase2-content-library.md`。后续新增接口仍必须同步更新 `docs/api.md`、相关后端测试和前端交互说明。

## 背景和目标

当前 KML 点位弹窗只展示要素名称和描述，适合轻量标注，但无法支撑现场照片、视频记录、外部业务页面、巡检报告、设备详情等内容展示。实际业务中，这些内容往往不应该直接写入 KML 点位：

- KML 更适合表达空间要素，图片、视频、音频和页面属于独立内容资源。
- 同一个内容库可能服务多个点位、图层或业务对象。
- 点位可能先通过描述中的链接、业务 URL 或外部页面关联内容，后续再演进为可管理的内容库 ID。
- 大图片、视频、音频和 iframe 页面如果直接放入点位弹窗，会造成性能、安全和移动端体验问题。

本需求目标是在不破坏现有 KML 导入导出和公共 KML 工作流的前提下，为 KML 点位提供可演进的富媒体内容展示能力：

1. 第一阶段支持从点位描述或管理配置中的链接及 `img`、`video`、`audio`、`iframe` 等标签识别图片、视频、音频和可嵌入页面。
2. 第二阶段引入服务端内容库，以内容库 ID 或绑定规则加载一组相关内容。
3. 第三阶段再扩展上传资产、标签检索、批量关联、权限和审计。

核心原则：KML 仍然负责空间数据，富媒体内容由独立内容模型管理，点位详情只做内容解析和展示入口。

## 用户和场景

### 前台地图用户

- 点击点位后查看点位基础信息和相关图片。
- 在不离开地图的情况下播放巡检视频或查看设备页面。
- 在手机上通过底部详情面板查看图片、视频和外链，不被地图弹窗遮挡。
- 当内容不可用、无权限或 iframe 被拦截时，可以打开原始链接作为兜底。

### 内容管理员

- 为一批点位维护图片库、视频库和 iframe 页面。
- 使用链接快速录入内容，不需要第一阶段就搭建完整资产上传系统。
- 后续通过内容库 ID 管理一个点位或业务对象关联的多项内容。
- 禁用某个内容项或内容库后，前台不再展示。

### KML 数据管理员

- 继续维护公共 KML 的导入、编辑、发布和禁用。
- 不需要把图片、视频等非空间数据写进导出的 KML。
- 可以通过点位链接、稳定 Feature ID 或业务标识关联内容。

## 范围

### 范围内

- KML 点位详情展示图片、视频、音频、iframe 页面和普通链接。
- 从 KML 点位 `description` 的纯文本链接和受支持 HTML 媒体标签中提取 URL，并按安全规则分类展示。
- 图片、视频、音频和页面点位在 2D/3D 地图上显示对应媒体图标；图标只表达轻量类型，不预加载媒体资源。
- 管理端维护内容库和内容项的服务端数据模型。
- 内容库通过 ID、点位绑定或链接匹配规则与 KML 点位发生关系。
- 前台 2D Leaflet 和 3D Cesium 共用同一套点位详情内容模型。
- iframe 域名白名单、协议限制、sandbox、referrer policy 和外链兜底。
- 公共 KML 内容解析接口、管理接口、数据校验、响应脱敏和 `node:test` 覆盖。
- 与动态 Feature Layer 的单要素详情接口兼容，避免列表接口返回大体积媒体数据。

### 暂不纳入

- 第一阶段不做任意 URL 服务端代理、截图、转码或缩略图抓取；仅为已确认存在浏览器证书兼容问题的固定旧图片下载地址提供受控兼容通道。
- 第一阶段不做本地大文件上传、对象存储、断点续传和视频转码。
- 第一阶段不做复杂 CMS、多人协同编辑、版本回滚和内容审批流。
- 不把富媒体内容写入标准 KML 导出文件。
- 不允许把任意 HTML 原样注入点位详情；仅解析受支持标签的 URL、标题和纯文字，随后使用受控组件渲染。
- 不支持绕过目标站点 `X-Frame-Options` 或 CSP 的 iframe 嵌入。

## 核心决策

### KML 与内容解耦

KML Feature 只保留空间要素和少量文本属性。图片、视频、音频、iframe 页面和内容库关系放在独立存储中，通过解析或绑定关系在点位详情阶段合并。

现有 `.kml` 导入导出保持兼容：

- 导入时继续解析 `name`、`description` 和几何，并保留媒体识别所需的 `styleUrl` 提示。
- 导出时继续输出标准 KML，不包含内容库、iframe 配置或服务端内部 ID。
- 如果点位描述中本来包含 URL，导出时按原描述文本保留，但不额外注入内容库元数据。

### 点位详情分层加载

地图上的 Marker/Entity 不直接挂载大体积内容。前台点击点位时：

1. 先展示轻量 popup，包含名称、摘要和“详情”入口。
2. 打开详情面板后再加载富媒体内容。
3. 图片、视频、音频和 iframe 继续懒加载，只有进入对应分组或可视区域时才加载真实资源。

公共 KML 和动态 Feature Layer 应通过单要素详情或内容解析接口加载富媒体，列表和 bbox 接口不得默认返回媒体数组。

### 链接优先，内容库演进

需求按三种关联方式递进：

| 方式 | 阶段 | 说明 | 适用场景 |
| --- | --- | --- | --- |
| `description-links` | 第一阶段 | 从点位描述中的文本链接或受支持媒体标签提取 URL，按规则识别图片、视频、音频、iframe 或普通链接 | 快速试用、导入外部 KML |
| `manual-binding` | 第二阶段 | 管理员把点位或业务标识绑定到内容库或内容项 | 公共 KML 内容维护 |
| `library-id` | 第二阶段后 | 点位或外部系统只提供内容库 ID，前台按 ID 加载完整内容集合 | 对接已有业务内容库 |

三种方式可以同时存在。展示顺序建议为：手工绑定内容优先，内容库 ID 次之，描述链接最后作为兜底。

## 核心概念

### Content Library

内容库是一组可发布的富媒体内容集合。一个内容库可以包含图片、视频、音频、iframe 页面和普通链接。

建议 ID 格式：

```text
content-lib-<timestamp>-<random>
```

### Content Item

内容项是内容库中的单个资源，类型包括：

- `image`：图片 URL 或后续上传图片。
- `video`：视频 URL 或受支持平台视频。
- `audio`：音频 URL 或现场录音。
- `iframe`：允许嵌入的外部页面。
- `link`：普通外链，不以内嵌方式展示。

第一阶段所有内容项以外部 URL 方式保存。后续上传资产时再扩展 `source.mode=upload`。

### Content Binding

内容绑定描述“哪些内容应该出现在某个点位详情中”。绑定关系不写入 KML 文件，而是保存在服务端。

绑定目标可以是：

- 公共 KML Feature：`sharedKmlId + featureId`。
- 动态 Feature Layer Feature：`layerId + featureId`。
- 业务锚点：`subjectKey`，例如设备编号、巡检点编号、外部系统对象 ID。
- 链接匹配规则：点位描述中包含某个 URL、域名、标签或业务参数时关联内容库。

### Feature Content View

前台最终消费的点位内容视图，由服务端或前端解析后返回，结构上按内容类型分组：

```json
{
  "featureId": "feat-1719561600001-d4e5f6",
  "groups": [
    {
      "type": "image",
      "title": "图片",
      "items": []
    },
    {
      "type": "video",
      "title": "视频",
      "items": []
    },
    {
      "type": "audio",
      "title": "音频",
      "items": []
    },
    {
      "type": "iframe",
      "title": "页面",
      "items": []
    },
    {
      "type": "link",
      "title": "链接",
      "items": []
    }
  ],
  "sourceSummary": {
    "bindings": 1,
    "libraries": 1,
    "descriptionLinks": 3
  }
}
```

## 功能需求

### F1. URL 提取和分类

系统应提供纯函数从点位 `description` 和后续 `properties.links` 中提取 URL。`description` 可以是纯文本，也可以包含受支持的 HTML 媒体标签。

提取规则：

- 只接受 `https://` URL；第一阶段不接受 `javascript:`、`data:`、`file:`、`ftp:` 等协议。
- URL 文本前后空白、中文标点和 Markdown 链接语法应能被正常处理。
- `img[src/srcset]`、`picture/source`、`video[src]/source`、`audio[src]/source`、`iframe[src]`、`embed[src]`、`object[data]` 和 `a[href]` 应提取对应 URL；标签本身不得直接渲染。
- 去重时按规范化后的 URL 比较，保留首次出现顺序。
- 单个点位最多解析 50 个 URL，超过部分丢弃并在解析结果中标记 `truncated: true`。
- URL 不应在服务端日志中完整记录查询参数，尤其是 `token`、`key`、`secret`、`password`、`signature` 等敏感参数。

分类规则：

| 分类 | 判定规则 | 展示方式 |
| --- | --- | --- |
| `image` | URL 扩展名或响应元数据为 `jpg`、`jpeg`、`png`、`webp`、`gif`、`avif` | 图片缩略图和查看器 |
| `video` | URL 扩展名为 `mp4`、`webm`、`mov`、`m3u8`，或命中受支持视频平台规则 | 视频卡片或平台嵌入 |
| `audio` | URL 扩展名为 `mp3`、`wav`、`ogg`、`m4a`、`aac`、`flac`、`opus`，或来自 `audio/source` 标签 | 原生音频控制条和外链兜底 |
| `iframe` | URL 域名命中 iframe 白名单，且管理配置允许内嵌 | sandbox iframe |
| `link` | 其他安全 URL | 普通外链卡片 |

第一阶段不要求服务端远程请求 URL 获取 `Content-Type`。媒体标签中的无扩展名 URL 按标签语义分类；纯文本无扩展名 URL 或无法判断的链接归类为 `link`。

### F2. 点位首击预览与详情入口

点击 KML 点位后的轻量 popup 应承担“快速判断”职责，不再要求用户先进入详情才能发现媒体：

- 展示名称和最多 2 到 4 行的描述摘要。
- 展示内容数量摘要，例如“3 张图片 / 1 个视频 / 1 段音频 / 1 个页面”。
- 如果当前点位存在图片，首击 popup 直接加载受控缩略图；视频、音频和 iframe 使用轻量类型卡片，不在 popup 内直接创建播放器或 iframe。
- 点击缩略图或类型卡片直接进入统一媒体预览器，因此从点位到大图/播放器最多两次点击。
- 当前点位媒体超过 popup 展示上限时，末尾“+N”槽位仍可点击并从第一项未展示媒体开始浏览，不能形成无操作的死信息。
- popup 明确提示进入查看器后可连续浏览当前 KML 的全部媒体资源。
- “查看详情”只负责打开更完整的文字、坐标、图层来源和媒体清单，不再作为媒体预览的必经步骤。
- 可编辑点位仍保留编辑和删除入口。

点击“查看详情”后打开内容面板：

- 桌面端使用右侧详情抽屉。
- 移动端使用底部面板。
- 2D 和 3D 地图保持一致的信息架构。
- 面板关闭后不改变地图选中状态；再次点击同一点位可恢复。
- 内容加载失败只影响内容区域，不应导致地图点位渲染失败。
- 详情面板与媒体预览器相互独立；媒体预览器收缩为小窗后，用户可关闭详情或继续操作地图。

### F3. 图片库展示

图片内容组要求：

- 展示缩略图网格，图片懒加载。
- 支持点击查看大图、上一张、下一张。
- 支持标题、说明和来源链接。
- 图片加载失败时展示占位状态和打开原链接按钮。
- 不在列表中一次性加载原图，除非缩略图和原图相同且图片数量很少。
- 单个点位默认最多展示 100 张图片，超过时显示截断提示，后续通过分页或内容库详情加载。

后续上传资产阶段应补充：

- 文件大小限制。
- MIME 校验。
- 图片尺寸读取。
- 缩略图生成策略。
- 存储清理和引用计数。

### F3A. 统一媒体预览器

图片、视频、音频和允许嵌入的页面应使用站内统一预览器，不以新开无样式浏览器页面作为默认预览方式。普通链接以及媒体加载失败后的原始资源入口继续使用受控外链。

统一约束：

- 预览器使用模态层承载，桌面端覆盖地图视口，移动端覆盖可用安全区；标题、关闭、前后切换、媒体区域和来源入口必须在横竖屏中保持稳定位置。
- 打开任一点位媒体时，以当前 KML 文件为边界聚合所有可预览图片、视频、音频和白名单 iframe；起始位置保持为用户点击的内容，而不是只创建当前点位或当前媒体类型的小集合。
- 提供可滚动的媒体轨道，显示类型、所属点位、当前位置和总数；点击轨道项、上一项/下一项按钮或方向键均可切换，首尾循环。
- 媒体轨道中的图片使用懒加载缩略图，视频、音频和页面使用轻量类型封面；不得因为打开查看器而一次性加载整个 KML 的原始媒体。
- 支持将全屏查看器收缩为可继续播放和切换的浮动小窗，并可重新展开；小窗状态解除页面滚动锁且不得阻断地图交互。
- 打开时聚焦关闭按钮并锁定页面滚动，`Escape`、遮罩和关闭按钮均可退出；关闭后恢复触发元素焦点，不能出现无法关闭或焦点落到地图背后的状态。
- 切换内容或关闭时必须暂停视频、音频并销毁图片手势实例，避免后台播放、事件监听和变换状态泄漏。
- 原始资源入口统一使用 `target="_blank"`、`rel="noopener noreferrer"` 和明确的“打开原始文件/页面”命令；普通链接不尝试绕过目标站点限制进行预览。

图片预览：

- 图片首次显示时按完整可见规则自适应并居中，比例为 `1x`；加载完成、失败、横竖屏变化或图片切换不能造成默认位置偏移。
- 支持双指缩放、滚轮缩放、拖拽、双击缩放、缩放按钮、滑杆和一键复位；缩放范围固定为 `1x` 到 `6x`，拖拽仅在放大后生效。
- 多图支持上一张、下一张、左右方向键和当前位置计数；切换图片后重置为居中 `1x`，首尾循环切换。
- 加载失败时显示独立错误状态并保留打开原始图片入口，不影响其他图片和点位详情面板。
- 对 `野兰谷.kml` 使用的 `https://down-files.2bulu.com/f/dn1` 旧下载地址，缩略图和预览图通过同源兼容接口加载；“原始文件”仍指向 KML 中的原始 URL。

其他媒体预览：

- 视频使用稳定的 `16:9` 可用区域、`playsinline` 和原生控制条，默认不自动播放；直接支持浏览器可播放的视频 URL，并为 HLS `.m3u8` 提供受控播放适配，加载失败时保留原始视频入口。
- 音频使用居中的媒体信息区和原生控制条，默认不自动播放；切换或关闭时停止播放并复位。
- iframe 延续内容项的 allowlist、`sandbox` 和 `referrerPolicy`，使用完整可用区域展示；目标站点拒绝嵌入时保留打开原始页面入口。

### F4. 视频库展示

视频内容组要求：

- 支持直接播放 `mp4`、`webm` 和后续明确支持的 HLS。
- 支持受控平台嵌入，例如通过 allowlist 配置 YouTube、Bilibili 或内部视频平台。
- 默认不自动播放，不默认静音循环。
- 视频卡片展示标题、封面、时长和来源。
- 播放失败时提供打开原链接兜底。
- 移动端面板中视频必须保持稳定宽高比，不能挤压地图主体布局。

平台视频只允许使用已知嵌入 URL 模板，不直接把任意视频页面 URL 塞入 iframe。

### F4A. 音频展示

- 支持 `mp3`、`wav`、`ogg`、`m4a`、`aac`、`flac`、`opus` 等常见音频链接和 `audio/source` 标签。
- 使用原生音频控件，默认不自动播放，预加载策略为 `metadata`。
- 播放失败时保留打开原链接入口；音频加载失败不得影响其他内容或地图交互。

### F5. iframe 页面展示

iframe 内容组用于嵌入设备详情、监控看板、报表或第三方业务页面。由于风险较高，必须采用默认拒绝策略。

允许嵌入的条件：

- URL 使用 `https://`。
- 域名命中后台配置的 iframe allowlist。
- 路径命中可选的 path allowlist。
- 配置了明确的 `title`。
- 内容项状态为 `published`。

iframe 渲染要求：

```html
<iframe
  sandbox="allow-scripts allow-forms allow-popups"
  referrerpolicy="no-referrer"
  loading="lazy"
></iframe>
```

默认不加 `allow-same-origin`。确需添加时必须按域名独立配置，并在文档中说明原因。

如果目标站点禁止被 iframe 嵌入，前台应展示“无法内嵌，打开新页面”兜底，不做任何绕过。

### F6. 内容库管理

后台新增“内容库”管理能力，建议路由为 `/admin/content`。

内容库列表展示：

- 名称。
- 状态：`draft`、`published`、`disabled`。
- 内容数量和类型统计。
- 关联点位数量。
- 创建时间和更新时间。

内容库操作：

| 操作 | 说明 |
| --- | --- |
| 新建内容库 | 创建空内容库，默认 `draft` |
| 编辑基本信息 | 修改名称、描述、标签和封面 |
| 添加 URL 内容项 | 输入 URL、类型、标题、说明和排序 |
| 批量添加链接 | 粘贴多行 URL，按规则分类为内容项 |
| 发布 | 前台可见 |
| 禁用 | 前台不可见但保留数据 |
| 删除 | 仅未被绑定或管理员确认后可删除 |
| URL 校验 | 检查协议、域名、类型和 iframe 策略，不做任意远程抓取 |

第一阶段内容库只存储外部 URL。上传能力作为后续独立需求补充。

### F7. 内容绑定管理

后台应提供内容绑定能力，用于把内容库或内容项关联到点位。

绑定方式：

| 绑定方式 | 字段 | 说明 |
| --- | --- | --- |
| 指定 Feature | `sharedKmlId`、`featureId` | 最直接，适合公共 KML 稳定点位 |
| 业务锚点 | `subjectKey` | 适合设备编号、站点编号等跨系统 ID |
| 内容库 ID | `libraryId` | 点位或外部系统提供内容库 ID 后直接加载 |
| 链接匹配 | `match.urlContains`、`match.domain` | 点位描述包含特定链接时关联内容库 |

绑定规则：

- 同一 Feature 可以绑定多个内容库。
- 同一内容库可以绑定多个 Feature。
- 手工绑定优先级高于描述链接自动解析。
- 禁用的绑定不返回给前台。
- 删除公共 KML 时，不应直接删除内容库；应将绑定标记为孤立，后台提示清理。

### F8. 公共 KML 点位内容解析

公共 KML Feature 的内容解析顺序：

1. 查找 `sharedKmlId + featureId` 的有效绑定。
2. 查找 Feature 公开属性中的 `contentLibraryIds`，如果后续模型允许该字段。
3. 查找业务锚点 `subjectKey` 的绑定。
4. 从 `description` 中提取 URL 并分类。
5. 应用链接匹配规则补充内容库。
6. 合并、去重、排序并返回 Feature Content View。

去重规则：

- 同一内容项 ID 只返回一次。
- 没有内容项 ID 的 URL 内容按规范化 URL 去重。
- 手工内容项覆盖自动提取链接的同 URL 项。

### F9. 个人 KML 兼容

个人 KML 仍保存在浏览器 localStorage。第一阶段个人 KML 不依赖服务端内容库：

- 前端可以从个人点位 `description` 中本地提取文本链接和受支持 HTML 媒体标签并展示。
- 个人 KML 不支持服务端内容库绑定，除非用户具备管理员身份并将个人 KML 发布为公共 KML。
- 个人 KML 导出保持现有行为。

后续如果需要个人内容库，应单独设计用户身份、存储和权限模型，不能混用管理员内容库。

### F10. 与动态 Feature Layer 兼容

动态 Feature Layer 的 bbox 和 clusters 接口不得返回富媒体详情，只能返回轻量摘要：

```json
{
  "id": "feat-1",
  "name": "设备点 A",
  "contentSummary": {
    "imageCount": 3,
    "videoCount": 1,
    "audioCount": 1,
    "iframeCount": 0,
    "linkCount": 2,
    "hasRichContent": true
  }
}
```

完整内容必须通过单要素详情或内容接口加载：

```http
GET /api/v1/kml/shared/:id/features/:featureId/content
```

如果动态 Feature Layer 后续独立于 KML，应使用同构接口：

```http
GET /api/v1/feature-layers/:layerId/features/:featureId/content
```

## 数据模型建议

### Content Library

```json
{
  "id": "content-lib-1719561600000-a1b2c3",
  "name": "1 号基站巡检资料",
  "description": "图片、视频和设备详情页",
  "status": "published",
  "tags": ["基站", "巡检"],
  "coverItemId": "content-item-1719561600001-d4e5f6",
  "items": [],
  "createdAt": "2026-07-06T08:00:00.000Z",
  "updatedAt": "2026-07-06T08:00:00.000Z"
}
```

字段说明：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `id` | string | 是 | 内容库稳定 ID |
| `name` | string | 是 | 内容库名称 |
| `description` | string | 否 | 管理说明和前台摘要，需转义展示 |
| `status` | string | 是 | `draft` / `published` / `disabled` |
| `tags` | array | 否 | 标签数组，公开返回前需限制长度 |
| `coverItemId` | string | 否 | 封面内容项 ID |
| `items` | array | 是 | 内容项数组 |
| `createdAt` | string | 是 | ISO 8601 创建时间 |
| `updatedAt` | string | 是 | ISO 8601 更新时间 |

### Content Item

```json
{
  "id": "content-item-1719561600001-d4e5f6",
  "type": "image",
  "title": "设备正面照片",
  "description": "2026 年 7 月巡检拍摄",
  "source": {
    "mode": "url",
    "url": "https://example.com/assets/site-a/front.webp"
  },
  "thumbnailUrl": "https://example.com/assets/site-a/front-thumb.webp",
  "sortOrder": 10,
  "status": "published",
  "metadata": {
    "width": 1600,
    "height": 900,
    "duration": null,
    "provider": null
  },
  "embedPolicy": {
    "allowIframe": false,
    "sandbox": null,
    "referrerPolicy": "no-referrer"
  }
}
```

字段说明：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `id` | string | 是 | 内容项稳定 ID |
| `type` | string | 是 | `image` / `video` / `iframe` / `link` |
| `title` | string | 是 | 展示标题 |
| `description` | string | 否 | 内容说明 |
| `source.mode` | string | 是 | 第一阶段固定为 `url` |
| `source.url` | string | 是 | 资源 URL，必须通过校验 |
| `thumbnailUrl` | string | 否 | 缩略图 URL |
| `sortOrder` | number | 是 | 同一内容库内排序 |
| `status` | string | 是 | `draft` / `published` / `disabled` |
| `metadata` | object | 否 | 宽高、时长、平台等非敏感信息 |
| `embedPolicy` | object | 否 | iframe 或平台嵌入策略 |

公开接口不得返回管理备注、内部文件路径、未发布内容项、敏感查询参数明文或服务端校验详情。

### Content Binding

```json
{
  "id": "content-binding-1719561600002-f7g8h9",
  "status": "enabled",
  "subject": {
    "type": "shared-kml-feature",
    "sharedKmlId": "shared-kml-1719561600000-a1b2c3",
    "featureId": "feat-1719561600001-d4e5f6",
    "subjectKey": "device:BS-001"
  },
  "targets": [
    {
      "type": "library",
      "libraryId": "content-lib-1719561600000-a1b2c3"
    }
  ],
  "match": null,
  "sortOrder": 10,
  "createdAt": "2026-07-06T08:00:00.000Z",
  "updatedAt": "2026-07-06T08:00:00.000Z"
}
```

绑定存储建议复用 `service/bin/admin/store.js`：

- `.db/admin/content-libraries.json`
- `.db/admin/content-bindings.json`
- `.db/admin/content-settings.json`

## API 契约草案

正式实现时必须将完整字段、示例和错误码同步到 `docs/api.md`。

### 公开接口

公开接口应继承前台访问控制。如果地图开启访问密码，点位内容接口必须与公共 KML 接口一致校验访问 cookie。

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| `GET` | `/api/v1/kml/shared/:id/features/:featureId/content` | 获取公共 KML 单点位富媒体内容 |
| `GET` | `/api/v1/content/libraries/:id` | 获取已发布内容库公开详情 |

#### `GET /api/v1/kml/shared/:id/features/:featureId/content`

成功响应：

```json
{
  "code": 0,
  "result": {
    "sharedKmlId": "shared-kml-1719561600000-a1b2c3",
    "featureId": "feat-1719561600001-d4e5f6",
    "version": "shared-kml-1719561600000-a1b2c3:12",
    "groups": [
      {
        "type": "image",
        "title": "图片",
        "items": [
          {
            "id": "content-item-1719561600001-d4e5f6",
            "type": "image",
            "title": "设备正面照片",
            "description": "2026 年 7 月巡检拍摄",
            "url": "https://example.com/assets/site-a/front.webp",
            "thumbnailUrl": "https://example.com/assets/site-a/front-thumb.webp",
            "sourceType": "library",
            "libraryId": "content-lib-1719561600000-a1b2c3"
          }
        ]
      }
    ],
    "sourceSummary": {
      "bindings": 1,
      "libraries": 1,
      "descriptionLinks": 0,
      "truncated": false
    }
  }
}
```

错误：

- KML 不存在、未发布或点位不存在：404，`KML 点位不存在或未发布`。
- 访问控制失败：401，`请先通过访问验证`。
- 参数格式非法：400，`点位内容参数不合法`。

### 管理接口

管理接口统一归入 `/api/v1/admin`，必须校验管理员 Bearer Token。

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| `GET` | `/api/v1/admin/content/libraries` | 内容库列表 |
| `GET` | `/api/v1/admin/content/libraries/:id` | 内容库详情 |
| `POST` | `/api/v1/admin/content/libraries` | 创建内容库 |
| `PUT` | `/api/v1/admin/content/libraries/:id` | 更新内容库基本信息和状态 |
| `DELETE` | `/api/v1/admin/content/libraries/:id` | 删除内容库 |
| `POST` | `/api/v1/admin/content/libraries/:id/items` | 新增内容项 |
| `PUT` | `/api/v1/admin/content/libraries/:id/items/:itemId` | 更新内容项 |
| `DELETE` | `/api/v1/admin/content/libraries/:id/items/:itemId` | 删除内容项 |
| `GET` | `/api/v1/admin/content/bindings` | 查询绑定 |
| `POST` | `/api/v1/admin/content/bindings` | 创建绑定 |
| `PUT` | `/api/v1/admin/content/bindings/:id` | 更新绑定 |
| `DELETE` | `/api/v1/admin/content/bindings/:id` | 删除绑定 |
| `POST` | `/api/v1/admin/content/validate-url` | 校验 URL 类型和嵌入策略 |

管理接口响应也必须使用现有 `jsonSuc` / `jsonErr` 风格，错误消息使用中文。

## 前端交互要求

### 信息架构

前台信息分为三个层级：

- 点位 popup：名称、短摘要、媒体缩略预览和快速操作。
- 详情面板：完整描述、坐标、图层来源和按类型整理的内容清单。
- 媒体预览套件：当前 KML 全部可预览媒体、连续切换、全屏查看和浮动小窗。

点位详情面板建议分为：

- `概览`：点位名称、描述、坐标、来源图层。
- `图片`：图片库。
- `视频`：视频库。
- `音频`：音频库。
- `页面`：iframe 页面。
- `链接`：普通外链。

没有内容的分组不显示。只有描述但没有富媒体时，详情面板仍可只展示概览。

### 状态处理

- 加载中：展示骨架或轻量 loading。
- 空状态：不显示富媒体分组，不弹错误。
- URL 被安全策略拦截：展示被拦截原因和打开原链接按钮。
- iframe 站点拒绝嵌入：展示兜底外链。
- 视频或图片加载失败：仅该内容项显示失败状态。

### 交互约束

- 不使用浏览器原生 `alert`、`confirm`、`prompt`。
- 复用 `src/ui/dialog.js` 体系处理确认、错误和表单输入。
- 弹窗、详情面板和媒体查看器不能遮挡无法关闭。
- 移动端文本和按钮不能溢出容器。
- 点位 popup 允许展示受控图片缩略图及视频/音频/页面类型卡片，但不直接塞入原图、视频播放器、音频播放器或 iframe。
- 详情面板内的媒体缩略项使用按钮进入统一预览器，不以直接外链作为默认预览交互。
- 图片缩放控件使用固定尺寸，动态缩放值和长标题不得引发布局位移；移动端必须适配安全区和横屏高度。
- 全屏与小窗切换不能重建当前媒体或丢失播放位置；只有切换媒体或关闭预览器时才释放当前媒体资源。

## 安全要求

### URL 安全

- 默认只允许 `https://`。
- 禁止 `localhost`、`127.0.0.0/8`、`10.0.0.0/8`、`172.16.0.0/12`、`192.168.0.0/16`、link-local、metadata 服务和非预期协议。
- 第一阶段不提供任意 URL 抓取。旧图片兼容接口只接受带唯一非空 `downParams` 的 `https://down-files.2bulu.com/f/dn1`，拒绝用户名密码、非默认端口、其他主机、其他路径和查询参数。
- 兼容接口在回源前校验 DNS 解析结果，禁止内网、loopback、link-local、metadata、保留地址和非 IP 结果；响应只接受带有效 `Content-Length`、不超过 20 MB 的 `image/*`。
- 兼容接口继承地图访问控制，访问日志必须脱敏目标 URL。后续扩大域名、路径、媒体类型或文件上限时，必须先更新需求、接口契约、SSRF 防护和自动化测试。

### iframe 安全

- iframe 默认拒绝，必须 allowlist。
- 每个 allowlist 规则应包含域名、可选路径前缀、是否允许 `allow-same-origin`、允许的 `sandbox` 能力。
- 不允许用户在内容项中直接覆盖全局 sandbox 策略。
- 不允许为了嵌入页面而新增任意 URL 代理入口。

### XSS 和敏感信息

- 点位描述和内容说明按文本渲染，不作为 HTML 注入。
- URL 展示时应脱敏敏感查询参数。
- 公开接口只返回前台渲染所需字段。
- 管理备注、内部校验日志、上传临时路径和未发布内容不得出现在公开接口。

## 性能要求

- 地图初始加载、公共 KML 列表、bbox features 和 clusters 接口不加载完整媒体内容。
- 点位内容接口应按需调用，并可按 `version` 缓存。
- 前端切换点位时使用 `AbortController` 取消旧请求。
- 图片、视频、音频和 iframe 使用懒加载。
- KML 全量媒体集合只保存必要的展示元数据；媒体轨道缩略图懒加载，活动媒体之外不得预加载原始视频、音频或 iframe。
- 单个点位公开内容默认上限：
  - 图片 100 项。
  - 视频 30 项。
  - iframe 10 项。
  - 普通链接 100 项。
- 超过上限时返回 `truncated: true`，前台显示“内容较多，仅展示前 N 项”。

## 测试要求

后端必须补充 `node:test`：

- URL 提取、去重、截断和分类。
- 非法协议、内网地址、敏感参数脱敏。
- iframe allowlist 命中和拒绝。
- 内容库 normalize/validate/sanitize。
- 内容项状态过滤，未发布内容不出现在公开接口。
- 内容绑定按 Feature、subjectKey、libraryId 和链接匹配解析。
- 公共 KML 不存在、点位不存在、未发布 KML、鉴权失败和访问控制失败。
- 删除 KML 后绑定孤立状态处理。

前端应覆盖或手工验证：

- 2D/3D 点位首击即可看到媒体缩略预览，第二次点击直接进入大图或播放器。
- 2D 点位详情打开、关闭、切换点位。
- 3D 点位详情打开、关闭、切换点位。
- 图片加载失败、视频播放失败、iframe 被拒绝。
- 移动端底部面板布局。
- 桌面与移动端统一预览器的打开、关闭、焦点恢复和滚动锁定。
- 图片默认居中、自适应、按钮/滑杆/滚轮/双指缩放、拖拽、复位及多图切换。
- 视频、音频和 iframe 切换时的暂停、销毁和原始链接兜底。
- 跨点位、跨媒体类型的整个 KML 循环切换，媒体轨道点击定位以及 100 项以上媒体集合的懒加载表现。
- 全屏预览收缩为浮动小窗、地图继续交互、重新展开和关闭后的焦点/滚动状态。
- 固定旧图片兼容接口的主机/路径白名单、DNS 私网拦截、访问控制、MIME、文件大小和日志脱敏。
- 不使用原生阻塞弹窗。

## 验收标准

- 用户点击公共 KML 点位，可以在详情面板中看到从描述文本链接或媒体标签解析出的图片、视频、音频、iframe 或普通链接。
- 用户第一次点击含媒体的 KML 点位即可看到缩略预览，第二次点击媒体即可进入大图、视频、音频或页面查看，不必经过详情面板。
- 用户进入任一媒体后，可以在同一预览套件中连续浏览当前 KML 的全部可预览媒体，并在全屏和浮动小窗之间切换。
- 管理员可以创建内容库，添加 URL 内容项，发布后绑定到指定公共 KML 点位。
- 前台公开接口不返回未发布内容库、未发布内容项、管理备注和敏感字段。
- iframe 只允许白名单域名嵌入；非白名单 URL 只能作为普通链接打开。
- 点位列表、bbox features 和 clusters 响应不包含大体积媒体数组。
- KML 导出结果不包含服务端内容库私有字段，原有 KML 导入导出能力不回退。
- 图片、视频或 iframe 加载失败不会导致地图点位消失或页面崩溃。
- `野兰谷.kml` 中的旧域名图片可在 2D/3D 详情和统一预览器中正常加载，其他 URL 不能借兼容接口转发。
- 图片、视频、音频和允许嵌入的页面默认在统一预览器中打开；图片在桌面和移动端默认完整居中，并可在 `1x` 到 `6x` 范围内缩放、拖拽和复位。
- 预览器可通过明确的关闭按钮和 `Escape` 退出，切换或退出后不存在后台媒体播放、遗留手势监听或页面滚动锁定。
- 新增后端模型、服务和路由有 `node:test` 覆盖。
- 文档、API 契约、测试和开发记录同步更新。

## 基础测试样例

仓库内用于富媒体回归的真实 KML 样例统一放在 `tests/fixtures/kml/`：

- `kmltest1.kml`：较小图片图层，用于点位首击缩略图、图层图库和旧图片兼容通道回归。
- `kmltest2.kml`：100 项以上的大型图片图层，用于媒体轨道、循环切换和懒加载回归。

后续新增样例应放入同一目录，并至少有一项自动化测试读取它，避免测试文件只作为人工素材存在。

## 分阶段路线

### 第一阶段：链接解析和前台展示

- 从 KML 点位描述中提取 URL。
- 前端点位详情面板支持图片、视频、音频、iframe allowlist 和普通链接展示。
- 公共 KML 增加点位内容解析接口。
- 不做内容库后台和上传，不做任意 URL 远程抓取；只保留固定旧图片下载地址的受控兼容通道。

### 第二阶段：内容库和绑定

- 后台新增内容库管理。
- 后台支持 URL 内容项维护和批量添加。
- 后台支持把内容库绑定到公共 KML Feature、业务锚点或链接匹配规则。
- 前台点位内容接口合并绑定内容和描述链接。

### 第三阶段：资产上传和批量治理

- 支持图片和视频上传到受控存储。
- 生成缩略图、读取尺寸和时长。
- 支持批量导入内容库和绑定关系。
- 支持内容搜索、标签过滤、引用统计和清理孤立资源。

### 第四阶段：业务系统集成

- 支持通过内容库 ID 对接外部内容系统。
- 支持业务对象详情页的 iframe 单点登录或签名 URL，但必须独立评估安全边界。
- 支持更细粒度权限、审计日志和访问统计。

## 待确认问题

- 第一批内容是否只来自外部 URL，还是必须支持本地上传。
- iframe allowlist 初始域名列表由谁维护，是否需要区分开发、测试和生产环境。
- 点位是否已有稳定业务编号；如果没有，公共 KML 重新导入后如何迁移旧绑定。
- 视频平台优先支持哪些来源。
- 内容库是否需要被多个公共 KML 或未来 Feature Layer 共享。
