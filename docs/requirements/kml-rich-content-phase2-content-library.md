# KML 点位富媒体第二阶段：外部内容库与资产库集成规划

> 个人空间资源集合的 ID 引用和浏览器直读契约已单独收敛到[独立资源集合、引用绑定与按需加载需求](./kml-resource-collection-references.md)。本文继续描述更广义的外部内容库/DAM 集成，不把个人集合引用与管理员内容库绑定混为同一模型。

状态：第二阶段规划。第一阶段链接解析和前台展示完成后，再进入本阶段 PoC 与落地。

## 背景和目标

第一阶段只从 KML 点位描述中解析 URL，并在点位详情面板展示图片、视频、iframe 页面和普通链接。这能快速验证展示体验，但不适合长期维护：

- 图片、视频、页面和文档资产需要独立生命周期，不应跟随 KML 文件一起管理。
- 内容库可能同时服务多个地图图层、点位、业务系统和非地图端。
- 后续会出现内容审核、上传、权限、标签、搜索、资产转码、签名 URL、审计等能力，继续在 `map-service` 内自研会让项目职责膨胀。

本阶段目标是把内容库/资产库作为单独工程建设或部署，优先整合成熟开源项目或开放体系，`map-service` 只保留点位内容适配、访问控制和安全兜底。

## 核心决策

### D1. 内容库独立工程化

内容库不作为 `map-service` 的后台子模块实现。`map-service` 只做：

- 根据 `sharedKmlId + featureId`、`layerId + featureId`、`subjectKey` 或 `contentLibraryId` 解析内容。
- 调用外部内容服务的只读 API。
- 将外部内容服务返回的数据规整为第一阶段已定义的 `Feature Content View`。
- 继承地图访问控制和 iframe 安全策略。
- 对公开响应做脱敏、字段裁剪和错误兜底。

内容库工程负责：

- 内容库、内容项、资产、绑定、标签、状态、权限和审计。
- 文件上传、缩略图、视频元数据、对象存储和 CDN。
- 内容管理后台和运营工作流。
- 对外提供稳定 API 或通过适配器被 `map-service` 调用。

### D2. 不把外部系统耦死在 KML

点位内容绑定优先使用稳定业务锚点：

1. `subjectKey`：设备编号、站点编号、巡检对象 ID。
2. `contentLibraryId`：内容库直接 ID。
3. `sharedKmlId + featureId`：当前公共 KML 的稳定 Feature ID。
4. 描述 URL 自动解析：只作为兜底。

如果 KML 重新导入会重建 `featureId`，绑定会失效。因此第二阶段必须补充 Feature 外部标识能力，例如 `properties.subjectKey` 或 KML `ExtendedData` 导入。

### D3. map-service 保持安全适配层

前台仍访问：

```http
GET /api/v1/kml/shared/:id/features/:featureId/content
```

`map-service` 内部再调用外部内容库。这样可以保证：

- 前台不暴露内容库管理 Token。
- 地图访问密码继续生效。
- iframe allowlist、敏感字段脱敏、未发布内容过滤由 `map-service` 二次校验。
- 后续切换 Directus、Payload、Strapi 或 DAM 系统时，前台契约不变。

## 选型维度

| 维度 | 权重 | 说明 |
| --- | --- | --- |
| 开源/许可确定性 | 高 | 是否可自托管，商业使用是否有额外限制，是否存在 open-core/源可用限制 |
| 内容建模能力 | 高 | 能否表达内容库、内容项、绑定、标签、状态、排序、多语言和自定义字段 |
| 资产管理能力 | 高 | 上传、缩略图、图片处理、视频元数据、S3/对象存储、权限和外链能力 |
| API 与集成 | 高 | REST/GraphQL/SDK、字段裁剪、过滤、鉴权、Webhook、服务端调用体验 |
| 运营后台体验 | 中 | 非开发人员是否能维护内容、批量录入、搜索、筛选和预览 |
| 部署运维成本 | 中 | 数据库、对象存储、队列、转码依赖、备份和升级复杂度 |
| 地图点位适配成本 | 中 | 是否容易按 `subjectKey` 或绑定表查询内容集合 |
| 长期扩展 | 中 | 是否能演进到审批、审计、多租户、外部系统同步和资产治理 |

## 候选方案对比

| 方案 | 定位 | 许可与开放性 | 优点 | 风险 | 适配结论 |
| --- | --- | --- | --- | --- | --- |
| Directus | 数据库优先 Headless CMS / 后台 / API | 当前仓库采用 Monospace Sustainable Core License，属于源可用并带竞争限制，4 年后授予 GPL-3.0；不是传统 MIT/Apache 意义上的宽松开源 | SQL 数据库反射、REST/GraphQL/SDK、权限细、文件能力和后台体验成熟，适合快速搭内容模型 | 许可需要评估；复杂查询压力会落到数据库；深度定制可能依赖 Directus 扩展体系 | **最快 PoC 首选**，前提是接受其许可边界 |
| Payload CMS | TypeScript / Next.js 全栈 Headless CMS | MIT | 代码即 schema，REST/GraphQL/Local API，认证、访问控制、文件上传和图片处理内置；与当前 Node 技术栈契合 | 需要写 schema 和部署 Next/Payload 工程；运营自由改模型不如低代码 CMS | **严格开源首选**，适合长期可控工程化 |
| Strapi | 经典 Headless CMS | Community Edition MIT，企业能力 open-core | 管理后台成熟，内容类型可视化，REST/GraphQL、草稿发布、国际化、插件生态好，运营友好 | 地理/业务绑定要自定义；复杂资产治理弱于专业 DAM；企业特性边界需确认 | **运营友好备选**，适合文旅/内容编辑类场景 |
| KeystoneJS | GraphQL 优先 Headless CMS | MIT | Node/React/GraphQL 技术栈，关系模型灵活，后台可定制 | 文件/资产能力和社区生态弱于 Strapi/Payload；需要更多开发 | 技术可行但不是优先选项 |
| ResourceSpace | 专业 DAM | 官方定位为开源 DAM | 元数据、集合、权限、分享、自动转换、资产治理能力强，适合大规模图片/视频素材库 | 更像资产库而非内容库；点位结构化内容、绑定关系和 API 聚合需要额外服务 | **资产重场景可组合使用**，不建议单独承担内容库 |
| Pimcore | 企业级 PIM/MDM/DAM/DXP | 2025 后为 Pimcore Open Core License，收入阈值、生产使用和竞争限制较复杂 | PIM/MDM/DAM 一体，适合企业主数据、商品、资产、体验管理融合 | 架构重、PHP/Symfony 运维复杂、许可和成本风险高 | 只有企业主数据治理需求很强时才考虑 |
| Mayan EDMS | 文档管理 / OCR / 审计 | Apache-2.0 | PDF、工程图纸、审批文档、OCR、版本和审计强 | 不是图片/视频/iframe 内容库；前台点位详情体验需要二次开发 | 仅适合作为文档附件系统 |
| NocoDB + MinIO | 低代码表格 + 对象存储 | NocoDB AGPL；MinIO 许可需单独评估版本 | 快速维护绑定表和附件字段；MinIO 适合作为 S3 兼容对象存储 | 不是完整 CMS/DAM；权限、发布、预览、资产处理能力弱 | 可作为临时方案或底层对象存储，不作为主内容库 |

## 推荐路线

### 推荐 1：Directus 适配 PoC

适用条件：

- 更看重快速上线和后台配置效率。
- 内容模型主要是内容库、内容项、绑定表和资产。
- 可接受 Directus 当前源可用许可和内部使用边界。

建议 PoC：

- Directus 独立部署 PostgreSQL + S3/MinIO 文件存储。
- 建 3 张核心表：`content_libraries`、`content_items`、`feature_content_bindings`。
- `map-service` 新增 Directus adapter，用服务端 Token 查询已发布内容。
- 前台契约不变，仍使用第一阶段点位内容接口。

### 推荐 2：Payload CMS 严格开源方案

适用条件：

- 希望内容库工程长期可控、许可宽松、代码可版本化。
- 团队接受独立 Node/Next 工程和 schema 代码管理。
- 未来需要较强自定义 API、签名 URL、业务系统同步和自动化。

建议 PoC：

- 新建 `map-content-service` Payload 工程。
- 以 TypeScript 定义 Collections：`ContentLibraries`、`ContentItems`、`FeatureBindings`、`Media`。
- 使用 Postgres 或 MongoDB，文件存储接 S3/MinIO。
- 暴露面向 `map-service` 的只读 endpoint：`/api/map-feature-content`。

### 推荐 3：Strapi 运营优先方案

适用条件：

- 内容编辑和运营人员是主要维护者。
- 需要多语言、草稿发布、内容类型可视化配置。
- 对代码级 schema 控制要求不高。

建议 PoC：

- Strapi 独立部署 PostgreSQL + Upload Provider。
- 使用 Content Type Builder 建模内容库、内容项和绑定。
- 自定义 controller 输出 `Feature Content View`。

### 不推荐作为主线

- ResourceSpace：适合作为图片/视频 DAM，但点位内容聚合和结构化绑定仍需要 CMS 或适配服务。
- Pimcore：能力过重，许可和运维复杂度不适合作为本项目第二阶段默认方案。
- Mayan EDMS：适合工程文档和审计，不适合作为点位富媒体主内容库。
- KeystoneJS：可做，但相对 Payload/Strapi 没有明显优势。

## 推荐架构

```text
前台地图
  |
  | GET /api/v1/kml/shared/:id/features/:featureId/content
  v
map-service
  - 访问密码校验
  - KML/Feature 存在性校验
  - subjectKey 解析
  - 调用内容库 adapter
  - 响应脱敏与 iframe 二次校验
  |
  | service token
  v
外部内容库工程
  - Directus / Payload / Strapi
  - 内容库、内容项、绑定、资产
  - 上传、缩略图、对象存储、权限、审计
  |
  v
对象存储 / CDN
```

## 内容库标准数据契约

无论选哪个系统，都必须能输出以下标准结构，供 `map-service` adapter 转换：

```json
{
  "subject": {
    "sharedKmlId": "shared-kml-xxx",
    "featureId": "feat-xxx",
    "subjectKey": "device:BS-001"
  },
  "libraries": [
    {
      "id": "content-lib-001",
      "name": "1 号基站资料",
      "status": "published"
    }
  ],
  "items": [
    {
      "id": "asset-001",
      "libraryId": "content-lib-001",
      "type": "image",
      "title": "设备正面照片",
      "description": "2026 年 7 月巡检",
      "url": "https://assets.example.com/asset-001.webp",
      "thumbnailUrl": "https://assets.example.com/asset-001-thumb.webp",
      "status": "published",
      "sortOrder": 10,
      "embedPolicy": null,
      "metadata": {
        "width": 1600,
        "height": 900,
        "duration": null
      }
    }
  ]
}
```

`map-service` 对外仍返回第一阶段的 `Feature Content View`，不把外部系统字段直接透传。

## 绑定模型

外部内容库至少需要支持：

| 字段 | 说明 |
| --- | --- |
| `binding.id` | 绑定稳定 ID |
| `binding.status` | `enabled` / `disabled` |
| `binding.subjectType` | `shared-kml-feature` / `feature-layer-feature` / `subject-key` |
| `binding.sharedKmlId` | 公共 KML ID，可为空 |
| `binding.layerId` | Feature Layer ID，可为空 |
| `binding.featureId` | Feature ID，可为空 |
| `binding.subjectKey` | 业务对象稳定 ID |
| `binding.libraryIds` | 关联内容库 ID 数组 |
| `binding.itemIds` | 可选，直接关联内容项 |
| `binding.sortOrder` | 绑定排序 |

第二阶段同时需要在 KML Feature 模型中支持可选字段：

```json
{
  "properties": {
    "subjectKey": "device:BS-001",
    "contentLibraryIds": ["content-lib-001"]
  }
}
```

导出标准 KML 时不输出服务端私有字段；如果确需导出业务标识，应使用 KML `ExtendedData` 并另行补充需求。

## map-service 适配层任务

1. 新增内容库 adapter 抽象：
   - `resolveFeatureContent({ sharedKmlId, layerId, featureId, subjectKey })`
   - `healthCheck()`
   - `sanitizePublicContent(raw)`
2. 新增 adapter 配置：
   - `provider`: `directus` / `payload` / `strapi` / `custom`
   - `baseUrl`
   - `serviceToken`
   - `timeoutMs`
   - `iframeAllowlist`
3. 点位内容接口接入 adapter：
   - 外部内容加载成功：合并外部内容和描述链接。
   - 外部内容加载失败：降级为第一阶段描述链接解析。
   - 外部返回未发布内容：强制过滤。
4. 增加缓存：
   - key：`provider + sharedKmlId/layerId + featureId + subjectKey + contentVersion`
   - TTL：默认 60 到 300 秒。
   - 管理端提供清缓存或刷新能力。
5. 增加测试：
   - adapter 成功、超时、401、字段污染、未发布过滤、iframe 拒绝、敏感 URL 脱敏。

## PoC 计划

### PoC A：Directus

验收目标：

- 1 天内可创建内容模型和后台录入流程。
- 通过 REST API 按 `subjectKey` 查询已发布内容。
- `map-service` 点位详情可以展示 Directus 文件 URL、缩略图和普通链接。
- iframe URL 必须被 `map-service` 二次 allowlist。

失败条件：

- 许可边界不被接受。
- 查询和权限模型需要大量 Directus 扩展代码。
- 文件 URL 权限无法满足前台访问控制。

### PoC B：Payload CMS

验收目标：

- 用 TypeScript 定义内容库、内容项、绑定和媒体集合。
- 提供一个专用 endpoint 输出标准内容契约。
- 支持 S3/MinIO 文件存储和缩略图。
- 通过服务端 Token 给 `map-service` 调用。

失败条件：

- 独立 Next/Payload 工程运维成本不可接受。
- 运营人员无法接受代码管理 schema 的流程。

### PoC C：Strapi

验收目标：

- 使用后台可视化建模并发布内容。
- 自定义 controller 输出标准内容契约。
- 验证草稿发布、多语言和上传能力。

失败条件：

- 自定义绑定查询和响应整理过于复杂。
- 插件和企业功能边界影响关键需求。

## 最终选型门槛

进入正式集成前，候选方案必须满足：

- 可自托管。
- 商业使用许可可接受。
- 支持服务端 API Token。
- 支持发布/禁用状态。
- 支持图片上传和缩略图，视频至少能作为资产或外链管理。
- 支持按 `subjectKey` 或绑定表查询内容集合。
- 支持对象存储或可迁移的本地文件存储。
- 支持备份和恢复。
- 前台不需要直接持有内容库管理凭证。

## 开放问题

- 对“开源”的要求是 OSI 宽松开源，还是可接受源可用/open-core。
- 内容资产是否有内网访问或私有访问要求。
- 是否需要图片/视频上传，还是只管理外部 URL。
- 是否已有稳定设备编号或业务对象 ID。
- 内容库是否要服务除地图外的其他业务端。
- 是否需要多语言、审批流、审计日志和单点登录。

## 参考资料

- Directus 文档：https://directus.com/docs/
- Directus License：https://github.com/directus/directus/blob/main/license
- Payload 文档：https://payloadcms.com/docs
- Payload License：https://github.com/payloadcms/payload/blob/main/LICENSE.md
- Strapi 文档：https://docs.strapi.io/
- Strapi License：https://github.com/strapi/strapi/blob/main/LICENSE
- ResourceSpace：https://www.resourcespace.com/
- ResourceSpace OpenAPI 文档：https://www.resourcespace.com/knowledge-base/developers/openapi
- Pimcore License：https://github.com/pimcore/pimcore/blob/12.x/LICENSE.md
- Mayan EDMS 文档：https://docs.mayan-edms.com/
- Keystone 文档：https://keystonejs.com/docs
