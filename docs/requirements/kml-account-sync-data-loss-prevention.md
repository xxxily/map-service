# 账号 KML 同步数据丢失防护需求

状态：已实现（1.5.47；恢复审计一致性补丁 1.5.48，2026-08-26）

## 1. 背景与事故结论

账号 KML 编辑同时存在地图页、管理后台和分享编辑等入口。旧实现把“当前浏览器列表中暂时没有的文件”当作删除意图，并在分页列表、详情请求或账号切换尚未完成时直接提交 `trash`。因此，用户只是在管理后台查看 KML、切回地图或遇到一次加载失败，也可能触发批量误删。

2026-08-26 对 66 服务器只读取证发现：同一账号在 15:50:34（北京时间）约 20ms 内连续产生 13 条 `kml.trash` 审计记录，间隔 1～3ms、没有删除原因或确认标记，共涉及 769 个要素。该模式不符合人工逐项删除，属于旧客户端不完整工作集推断删除。数据仍在回收站，未发生永久删除；恢复范围应以取证得到的明确 ID 为准，禁止全量恢复回收站。

## 2. 目标与非目标

### 2.1 目标

1. 不完整列表、详情失败、目录竞态、账号切换和认证刷新失败都不能产生隐式删除或跨账号写入。
2. 只有用户明确执行删除、撤销后重做删除等动作，客户端才可提交 `trash`；服务端对每一条 `trash` 强制校验确认意图。
3. 在途请求成功、失败、超时、响应畸形或响应丢失时，均保留可恢复草稿和最新工作集，不丢失后续编辑。
4. 冲突处理最多自动合并重试一次；普通保存失败不自动递归重试，避免请求风暴和“持续保存失败”。
5. 提供可审计、可回滚的定点恢复流程，并保留旧客户端数据安全边界。

### 2.2 非目标

- 不自动推断用户是否想删除文件。
- 不把回收站恢复、永久删除和普通编辑混成同一操作。
- 不通过全量回收站恢复来“找回一切”；无法从审计证据确认的文件需要人工核对。

## 3. 数据与身份模型

- `kmlId`：服务端稳定文件 ID，只用于已确认存在的服务端文档。
- `clientId` / `syncClientId`：创建请求的幂等标识，不作为已落库文件的工作集主键。
- `revision`：服务端乐观并发版本；客户端只接受不低于当前快照的响应。
- `pendingOperations`：发出请求前写入本机恢复草稿的精确批次。响应未通过完整性校验前不得清空。
- `deletedClientIds`：尚未获得服务端 ID 的创建项删除墓碑。
- `deletedFileIds`：已获得服务端 ID 的显式删除意图，必须同时带合法 `deletionIntent`。

## 4. 同步状态机

### 4.1 加载

1. 先刷新认证并确定用户 ID，再请求完整分页和每个文件详情。
2. 列表总数、页码、页大小、条目 ID、详情 ID 均必须校验；任何不完整响应都停止替换工作集。
3. 同账号加载失败时保留已有工作集用于展示，但强制只读；跨账号或身份未知时清空工作集并禁止读写。
4. 目录刷新使用 `syncEpoch + userId` 校验，较晚响应不得覆盖新账号状态。

### 4.2 写入

1. 产生编辑时立即保存 v2 草稿；发送新批次前等待完整草稿写入成功。
2. 批次成功后逐条校验 `results.length`、`action`、`clientId/kmlId` 和 `document/result` 身份，再归并 revision。
3. 2xx 响应缺失、错序或字段不匹配时视为 `KML_SYNC_RESPONSE_INCOMPLETE`，保留 pending，不自动递归请求。
4. 普通错误保存最新草稿并重建当前工作集对应的 pending 操作；下一次显式 flush 或新编辑才重试。
5. 请求在途期间发生新编辑时，失败后的重试批次必须以最新工作集为准，不能继续发送已经过时的旧批次。
6. `KML_REVISION_CONFLICT` 只允许一次自动三方合并重试；仍冲突则进入用户选择状态。

### 4.3 删除

- 工作集缺少文件、分页尚未完成、详情失败、撤销/重做的普通状态变化，均不得产生 `trash`。
- 显式删除、确认批量删除和重做删除必须传递 `deletionIntent`：`user-confirmed` 或 `user-confirmed-batch`。
- 服务端拒绝任何没有合法确认意图的 `trash`，返回 `409 KML_DELETE_CONFIRMATION_REQUIRED`；事务不产生删除或墓碑副作用。
- 旧草稿中的 `trash`、删除墓碑若没有合法确认意图，恢复时忽略并从完整服务端清单补回仍 active 的文件，同时记录 `ignoredDeletionCount`。
- 已确认删除的快照保留为 `trashed`；撤销使用 `restore(kmlId)`，不能把原文件误当成新建。

## 5. API 契约

### `POST /api/v1/kml/sync`

请求：

```json
{
  "deletionIntent": "user-confirmed",
  "operations": [
    { "action": "update", "kmlId": "kml_x", "data": { "revision": 3, "name": "新名称" } },
    { "action": "trash", "kmlId": "kml_y" }
  ]
}
```

`operations` 支持 `create`、`update`、`trash`、`restore` 和 `deletePermanent`，一次 1～100 条。只要批次包含任意 `trash`，顶层 `deletionIntent` 就必须是 `user-confirmed` 或 `user-confirmed-batch`。缺失或非法时返回：

```json
{
  "error": {
    "code": "KML_DELETE_CONFIRMATION_REQUIRED",
    "message": "移入回收站前需要用户确认"
  }
}
```

成功响应必须包含与请求逐条对应的 `results`；`create` 返回 `clientId + document`，`update/trash/restore` 返回对应 `document`，尚未创建的 client tombstone 返回 `{clientId,result:{status:"absent"}}`。

### 相关错误码

| 错误码 | HTTP | 含义 |
| --- | --- | --- |
| `KML_LIST_INCOMPLETE` / `KML_DETAILS_INCOMPLETE` | 4xx/5xx | 列表或详情未完整加载，客户端不得替换工作集 |
| `KML_DELETE_CONFIRMATION_REQUIRED` | 409 | `trash` 缺少用户确认 |
| `KML_SYNC_RESPONSE_INCOMPLETE` | 客户端状态码 | 2xx 响应无法逐条对应请求 |
| `KML_REVISION_CONFLICT` | 409 | revision 过期，需要自动合并或用户处理 |
| `KML_CREATE_REPLAY_DELETED` | 409 | 旧创建幂等标识已被确认删除/永久删除 |

## 6. 恢复与事故处置

1. 恢复前先备份数据库、配置、应用版本和审计数据，并记录时间、操作者、命令和校验摘要。
2. 只依据同一账号、同一时间窗口、同一异常操作模式确认误删 ID；不按“所有 trashed”批量恢复。
3. 恢复后校验 active/trashed 数量、恢复 ID 集合、revision、要素数量和分享引用；每次真实的恢复状态转换写入审计记录，并发状态已变化时不得写入伪造审计。
4. 生产发布顺序：161 备份与验证通过后，再备份 66、部署、健康检查，最后执行定点恢复。
5. 管理员凭据只用于会话验证，不进入代码、文档、命令历史、日志或 API 响应。

## 7. 验收标准

- [ ] 不完整分页、详情失败、同账号刷新失败和跨账号刷新失败均不丢工作集、不产生 `trash`。
- [ ] 无确认意图的单条和批量 `trash` 均返回 `409 KML_DELETE_CONFIRMATION_REQUIRED`，数据库保持 active。
- [ ] 旧草稿无确认意图时删除项被忽略，服务端 active 文件被补回。
- [ ] 畸形 2xx 不清空 pending，不出现自动无限请求。
- [ ] 在途失败期间的新编辑在下一次 flush 中完整提交。
- [ ] 认证刷新失败后工作集只读，不能写入错误账号。
- [ ] 161 和 66 均完成备份、部署、健康检查、保存/冲突/删除保护验证，并留下操作日志。
- [ ] `npm run check`、`npm test`、`npm run build` 通过。
