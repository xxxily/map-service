# 需求文档

本目录用于集中管理 map-service 的产品和系统需求。

任何较大的产品能力或系统能力，在实现前都应先在这里创建或更新需求文档。文档应聚焦
用户目标、范围边界、API 契约、验收标准和后续路线。

建议文档结构：

- 背景和目标
- 用户和场景
- 范围内和范围外事项
- 功能需求
- 非功能需求
- API 或数据模型说明
- 验收标准
- 后续路线

当前需求文档：

- [3D 相机交互与真实地形立体渲染 v2](./3d-camera-interaction-and-terrain-rendering-v2.md)（当前 3D 交互与地形专项基线）
- [3D 地图交互与地形效果改进需求（历史）](./3d-map-interaction-and-terrain-improvements.md)
- [3D 地图与首页功能对标需求](./3d-feature-parity-with-index.md)
- [图源管理与图层配置重构需求](./tile-source-and-layer-management.md)
- [矢量图源渲染、预置图源库与密钥池需求](./vector-source-rendering-and-key-pool.md)
- [功能完备地图应用建设需求](./full-featured-map-application.md)
- [用户体系、角色权限、个人空间与多 KML 分享需求](./user-system-rbac-and-multi-kml-sharing.md)（核心功能已实施；分享生命周期与删除增强已于 v1.5.37 实施）
- [KML 分享空间访问控制与半公开地图需求](./kml-share-spatial-access-and-semi-public-map.md)（v1.5.13 已实施，持续验收）
- [持续定位长期运行可靠性需求](./continuous-location-reliability.md)
- [管理后台 MVP](./admin-console-mvp.md)
- [KML 导入导出](./kml-import-export.md)
- [两步路授权浏览器助手与浏览器内导入](./2bulu-authorized-browser-helper.md)（第四版已实现，待手工验收）
- [两步路公开分享轨迹导入](./2bulu-public-track-import.md)（服务端直连兼容方案，网站入口由浏览器助手替代）
- [两步路用户公开轨迹列表批量导入](./2bulu-public-track-batch-import.md)（v1.5.57 已发布到 161，待内测验收）
- [KML 点位富媒体内容展示](./kml-feature-rich-content.md)
- [KML 媒体预览与 3D 地图界面精简](./kml-media-preview-and-3d-ui-polish.md)（v1.5.19 已发布）
- [KML 点位第三方分享链接识别与嵌入预览](./kml-point-share-link-embed.md)（首期抖音 provider 已实现，待手工验收）
- [KML 点位 720 云内容与可配置图标](./kml-720yun-and-marker-icons.md)（第二版已实现，待用户验收）
- [KML 要素组织与受控 URL 参数保留](./kml-feature-organization-and-url-preservation.md)（第一版已实现）
- [KML 批量管理与媒体窗口自由布局](./kml-batch-management-and-media-window-layout.md)（第二版已实现，待手工验收）
- [KML 性能优化与资源集合点位](./kml-performance-and-resource-collections.md)（v1.5.58 已完成 161 内测发布）
- [KML 线段绘制编辑器](./kml-line-drawing-editor.md)（v1.5.59 待 161 内测验收）
- [账号 KML 同步数据丢失防护](./kml-account-sync-data-loss-prevention.md)（1.5.47 已实现；覆盖误删、冲突、恢复草稿和保存失败）
- [管理后台数值配置自由裁量与 KML 移动端布局修订](./admin-user-system-configurable-limits-and-kml-mobile-layout.md)（1.5.50 已实现）
- [用户管理与个人空间 KML 工具栏界面优化需求](./admin-users-and-account-kml-toolbar-ui-polish.md)（v1.5.52 已发布）
- [KML 协调色板与个人空间批量移动需求](./kml-color-palettes-and-account-batch-move.md)（v1.5.57 已发布到 161，待内测验收）
- [瓦片缓存治理与 URL 缓存键策略](./cache-governance-and-url-key-policy.md)（v1.5.53 已部署到 161，待内测验收）
- [KML 分享发布控制与地图交互性能](./kml-share-publishing-and-map-interaction.md)（开发中；分享生命周期与删除增强已于 v1.5.37 实施）
- [2D macOS 触摸板缩放方向稳定性](./2d-trackpad-zoom-direction-stability.md)（v1.5.23 已实现）
- [66 服务器资源安全与应用运行防护](./server-resource-safety.md)（v1.5.24 第一阶段已实现）
- [SidePanel 嵌入式 KML 双屏编辑](./sidepanel-embedded-kml-editing.md)（已实现并通过实际扩展验收）
- [KML 点位富媒体第二阶段：外部内容库与资产库集成规划](./kml-rich-content-phase2-content-library.md)
- [动态 Feature Layer 视口加载与服务端聚合](./dynamic-feature-layer-loading.md)
- [访问控制加固](./access-control-hardening.md)
- [KML 分享密码链接、访问记录、统计脚本与瓦片限流](./kml-share-password-links-access-analytics-and-rate-limits.md)（v1.5.28 修订实现）
- [轨迹渲染视口过滤与 LOD 分级优化](./track-rendering-viewport-lod.md)
- [KML 点位留言、内容举报与审核治理](./kml-comments-and-reports.md)（Phase 0、Phase 1A-F、Phase 2 受控 POC 与 Phase 3 已完成；Artalk 生产部署延期）

交互能力的部署、初始化、前端/API 接入、AI provider、备份恢复和 agent 执行入口见[交互功能部署与接入手册](../interaction-deployment-and-integration.md)。当前实现状态以[交互开发计划](../interaction-development-plan.md)为准；Artalk 生产部署仍明确延期。
