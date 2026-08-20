# Design

## Source of truth
- Status: Active
- Last refreshed: 2026-08-20
- Primary product surfaces: 2D/3D 地图、KML 数据管理面板、媒体预览器
- Evidence reviewed: `src/map/kml.js`、`src/map3d/kml.js`、`src/ui/media-preview.js`、`src/styles.css`、`docs/requirements/kml-feature-organization-and-url-preservation.md`、`docs/requirements/kml-media-preview-and-3d-ui-polish.md`、`docs/requirements/kml-batch-management-and-media-window-layout.md`

## Brand
- Personality: 克制、清晰、以地图内容为主
- Trust signals: 稳定的保存/撤销反馈、只读状态、明确的权限边界
- Avoid: 装饰性大卡片、重复说明、阻塞式原生弹窗、深色状态闪烁

## Product goals
- Goals: 让 KML 整理适合批量工作，让媒体浏览充分利用大屏并保留个人布局偏好
- Non-goals: 改变 KML 数据模型、权限模型或引入服务端实时协同
- Success signals: 批量动作可预测且可撤销；窗口调整不干扰地图；再次打开恢复用户选择

## Personas and jobs
- Primary personas: 管理个人轨迹和素材的地图用户、在大屏上浏览媒体的桌面用户
- User jobs: 迁移/复制/清理要素；同时对照地图与媒体内容；快速切换和恢复浏览布局
- Key contexts of use: 大型 KML 文件、触摸设备、SidePanel/嵌入窗口、宽屏桌面

## Information architecture
- Primary navigation: 地图 > KML 数据管理 > 文件 > 要素
- Core routes/screens: 2D 地图、3D 地图、媒体预览浮层
- Content hierarchy: 地图与媒体内容 > 文件/要素标题 > 操作控件 > 辅助状态

## Design principles
- Selection is explicit: 批量模式必须可见、可取消，并提供只针对当前可见要素的全选/反选，不会误触原有定位操作
- Reversible actions: 批量修改一次提交、一次撤销；破坏性删除先确认
- Content first: 宽屏和小窗优先给媒体内容，标题优先于类型/位置/集合信息；底部工具与状态压为单行，iframe 不因宿主 padding 或高状态栏挤占内容
- Stable motion: 拖动/缩放只操作合成层和自身布局，不破坏地图/媒体连续过渡

## Visual language
- Color: 延续现有墨绿色强调色、浅色透明控件底、深色媒体内容面
- Typography: 现有系统字体；批量状态和标题使用紧凑层级
- Spacing/layout rhythm: 8px 基础间距；媒体状态栏保持约 30-34px 单行高度，小窗图标约 18px；工具栏允许横向滚动但不引起页面横向滚动
- Shape/radius/elevation: 6-8px 控件圆角，窗口使用轻量阴影，不叠套卡片
- Motion: 拖动/缩放使用帧合并；模式切换可使用短过渡，尊重 reduced-motion
- Imagery/iconography: 复用现有 SVG/Lucide 风格图标，新增按钮必须有 tooltip

## Components
- Existing components to reuse: `src/ui/dialog.js`、KML 文件卡片/要素行、`transferKmlFeature`、`media-preview` 控件
- New/changed components: 个人图层全局批量工具栏、批量操作纯函数、媒体布局偏好与小窗几何工具、搜索面板关闭入口
- Variants and states: normal/selection/empty/processing/readonly；centered/wide/minimized
- Token/component ownership: KML 管理由 `src/map/kml.js` 与 `src/map3d/kml.js`；媒体布局由 `src/ui/media-preview.js` 和 `src/ui/media-preview-layout.js`

## Accessibility
- Target standard: WCAG 2.1 AA 基础要求
- Keyboard/focus behavior: 复选框可 Tab 操作；批量动作和媒体按钮有明确焦点态；Escape 取消弹窗/小窗调整
- Contrast/readability: 状态文字和控件边框保持现有对比度；激活态不依赖底色变化
- Screen-reader semantics: 选择数量、`aria-pressed`、`aria-label` 和调整手柄标签完整
- Reduced motion and sensory considerations: 不依赖动画传达状态，拖动帧合并并尊重 reduced-motion

## Responsive behavior
- Supported breakpoints/devices: 桌面宽屏、窄桌面、移动触摸、SidePanel iframe
- Layout adaptations: 移动媒体继续全屏；桌面可宽屏/小窗；KML 批量选择在触摸和键盘均可用
- Touch/hover differences: 小窗拖动和缩放只在非触摸桌面显示；移动端不显示手柄

## Interaction states
- Loading: 批量执行按钮锁定并保留已选信息
- Empty: 无选择时操作按钮禁用；无可写目标时给出短提示
- Error: 原子失败，不部分写入，统一 Dialog 呈现
- Success: 显示简短结果并退出选择模式
- Disabled: 只读/公共/分享文件隐藏批量入口和选择框
- Offline/slow network, if applicable: 账号同步沿用现有草稿/冲突恢复，不在 UI 层伪造成功

## Content voice
- Tone: 短、直接、动作导向
- Terminology: “批量”“操作”“移动”“复制”“删除”“宽屏”“小窗”
- Microcopy rules: 不枚举可扩展 provider 清单，不重复解释显而易见操作

## Implementation constraints
- Framework/styling system: 原生 ES modules、Leaflet/Cesium、现有 CSS 与统一 Dialog
- Design-token constraints: 复用现有 KML/媒体 CSS 变量，不新增依赖
- Performance constraints: 批量 O(n) 处理；拖动/缩放只更新窗口自身；不裁剪媒体轨道
- Compatibility constraints: 2D/3D、账号/本地、SidePanel、移动返回手势
- Test/screenshot expectations: 纯函数单测 + source contract 测试 + `npm run check/test/build`

## Open questions
- [ ] 后续批量重命名动作的字段和审计展示方式 / 产品 / 后续版本
