# Design

## Source of truth
- Status: Active
- Last refreshed: 2026-08-29
- Primary product surfaces: 2D/3D 地图、KML 数据管理面板、个人空间、公开分享留言、管理后台、媒体预览器
- Evidence reviewed: `src/account/`、`src/admin/layout.js`、`src/admin/pages/users.js`、`src/admin/pages/cache.js`、`src/admin/pages/interaction.js`、`src/admin/pages/userSystemSettings.js`、`src/ui/interaction.js`、`src/ui/dialog.js`、`src/map/kml.js`、`src/map3d/kml.js`、`src/ui/media-preview.js`、`src/styles.css`、`docs/requirements/admin-users-and-account-kml-toolbar-ui-polish.md`、`docs/requirements/cache-governance-and-url-key-policy.md`

## Brand
- Personality: 克制、清晰、以地图内容为主
- Trust signals: 稳定的保存/撤销反馈、只读状态、明确的权限边界
- Avoid: 装饰性大卡片、重复说明、阻塞式原生弹窗、深色状态闪烁

## Product goals
- Goals: 让 KML 整理适合批量工作，让分享、资料、留言和后台配置在长列表与移动端中仍清晰可达
- Non-goals: 改变核心权限模型、引入服务端实时协同、增加任意外部头像代理或弱化 AI/分享安全边界
- Success signals: 批量动作可预测且可撤销；长 URL 与操作反馈始终可见；管理员能低门槛完成 AI 配置；留言身份与资源上下文准确稳定；缓存治理先分析和预演、再分批执行，页面刷新不制造高 I/O

## Personas and jobs
- Primary personas: 管理个人轨迹和素材的地图用户、公开分享访问者、审核留言与配置站点的管理员
- User jobs: 迁移/复制/清理要素；创建和复制分享；维护个人资料；留言和审核；快速定位并调整后台策略
- Key contexts of use: 大型 KML 文件、长分享列表、移动触摸设备、SidePanel/嵌入窗口、宽屏桌面、后台密集表单

## Information architecture
- Primary navigation: 地图 ↔ 个人空间 ↔ 管理后台；地图 > KML 数据管理 > 文件 > 要素；公开分享 > 点位 > 留言
- Core routes/screens: 2D 地图、3D 地图、个人空间、公开分享留言、管理后台、媒体预览浮层
- Content hierarchy: 当前业务内容 > 名称与身份 > 主要操作 > 状态与稳定 ID；管理设置和长列表旁的创建表单先按能力 Tab 分类；密集工具栏按筛选、文件操作、批量操作分层；缓存治理按概览、策略、URL 分析、执行记录分层，危险操作不占据默认主位

## Design principles
- Selection is explicit: 批量模式必须可见、可取消，并提供只针对当前可见要素的全选/反选，不会误触原有定位操作
- Reversible actions: 批量修改一次提交、一次撤销；破坏性删除先确认
- Content first: 宽屏和小窗优先给媒体内容，标题优先于类型/位置/集合信息；底部工具与状态压为单行，iframe 不因宿主 padding 或高状态栏挤占内容
- Stable motion: 拖动/缩放只操作合成层和自身布局，不破坏地图/媒体连续过渡
- Feedback stays visible: 短操作反馈固定在右下角，不随页面滚动丢失；长内容、输入和确认继续使用统一 Dialog
- Identity is contextual: 登录留言只使用账号资料，匿名资料独立记忆；历史留言使用提交时快照，不随资料修改漂移
- Secrets are write-only: API Key 可直接输入但永不回显；安全状态通过“已配置/已验证”表达
- Dense tools need hierarchy: 搜索和排序占据主行，文件级命令与批量命令分区；低频同类命令进入菜单，不能依靠无序换行承载响应式布局
- Evidence before mutation: 缓存删除和 URL 键规则启用必须先展示范围、冲突和索引完整度；建议值不能伪装成管理员不可突破的产品上限
- Quiet background work: 缓存页轮询只读取索引和小型快照；目录校准、URL 分析和批量删除必须显式呈现运行状态，且同类重任务只运行一个

## Visual language
- Color: 延续现有墨绿色强调色、浅色透明控件底、深色媒体内容面
- Typography: 现有系统字体；批量状态和标题使用紧凑层级
- Spacing/layout rhythm: 8px 基础间距；媒体状态栏保持约 30-34px 单行高度，小窗图标约 18px；工具栏允许横向滚动但不引起页面横向滚动
- Shape/radius/elevation: 6-8px 控件圆角，窗口使用轻量阴影，不叠套卡片
- Motion: 拖动/缩放使用帧合并；模式切换可使用短过渡，尊重 reduced-motion
- Imagery/iconography: 复用现有 SVG/Lucide 风格图标，新增按钮必须有 tooltip

## Components
- Existing components to reuse: `src/ui/dialog.js`、KML 文件卡片/要素行、`transferKmlFeature`、`media-preview` 控件
- New/changed components: 分享 URL Dialog、固定 Toast、后台设置/用户管理 Tab、用户资料头像输入、留言作者行、结构化留言详情 Dialog、分层 KML 工具栏与导入菜单、缓存治理子 Tab、清理预演摘要、URL 规则分析表和治理任务记录
- Variants and states: normal/selection/empty/processing/readonly；success/error/loading Toast；configured/unverified/verified provider；anonymous/authenticated author；cache-index ready/reconciling/stale；cleanup preview/running/cancelled/completed/interrupted；URL policy raw/analyzed/conflicted/enabled
- Token/component ownership: KML 管理由 `src/map/kml.js` 与 `src/map3d/kml.js`；媒体布局由 `src/ui/media-preview.js` 和 `src/ui/media-preview-layout.js`

## Accessibility
- Target standard: WCAG 2.1 AA 基础要求
- Keyboard/focus behavior: 复选框与 Tab 可键盘操作；批量动作和媒体按钮有明确焦点态；Dialog 圈定焦点并可用 Escape 关闭；Toast 关闭按钮可聚焦
- Contrast/readability: 状态文字和控件边框保持现有对比度；激活态不依赖底色变化
- Screen-reader semantics: 选择数量、`aria-pressed`、图标按钮 `aria-label/title`、`tablist/tab/tabpanel`、Toast `aria-live` 和调整手柄标签完整
- Reduced motion and sensory considerations: 不依赖动画传达状态，拖动帧合并并尊重 reduced-motion

## Responsive behavior
- Supported breakpoints/devices: 桌面宽屏、窄桌面、移动触摸、SidePanel iframe
- Layout adaptations: 移动媒体继续全屏；桌面可宽屏/小窗；KML 批量选择在触摸和键盘均可用；长 URL 任意断行；Toast 使用安全边距；后台 Tab 可横向滚动；账号 KML 工具栏在窄屏按筛选、文件操作、批量操作纵向排列且页面本身不溢出
- Touch/hover differences: 小窗拖动和缩放只在非触摸桌面显示；移动端不显示手柄

## Interaction states
- Loading: 批量执行按钮锁定并保留已选信息
- Empty: 无选择时操作按钮禁用；无可写目标时给出短提示
- Error: 原子失败，不部分写入，统一 Dialog 呈现
- Success: 右下角显示简短 Toast；分享 URL 等需保留内容的结果使用 Dialog
- Disabled: 只读/公共/分享文件隐藏批量入口和选择框
- Offline/slow network, if applicable: 账号同步沿用现有草稿/冲突恢复，不在 UI 层伪造成功

## Content voice
- Tone: 短、直接、动作导向
- Terminology: “批量”“操作”“移动”“复制”“删除”“宽屏”“小窗”
- Microcopy rules: 不枚举可扩展 provider 清单，不重复解释显而易见操作

## Implementation constraints
- Framework/styling system: 原生 ES modules、Leaflet/Cesium、现有 CSS、统一 Dialog 与现有管理后台渲染模式
- Design-token constraints: 复用现有 KML/媒体 CSS 变量，不新增依赖
- Performance constraints: 批量 O(n) 处理；拖动/缩放只更新窗口自身；不裁剪媒体轨道；缓存管理读取派生索引，禁止因页面刷新重复全目录扫描，扫描和删除按批次让出事件循环
- Compatibility constraints: 2D/3D、账号/匿名、SidePanel、移动返回手势、历史用户/留言/Provider/分享数据迁移
- Test/screenshot expectations: 纯函数单测 + API/迁移测试 + source contract 测试 + 320/375/390px 与桌面验收 + `npm run check/test/build`

## Open questions
- [ ] 后续批量重命名动作的字段和审计展示方式 / 产品 / 后续版本
