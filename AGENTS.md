# 项目协作规则

## 文档

- 项目文档统一使用中文。
- 较大的产品或系统改动，应先更新 `docs/requirements/` 下的需求文档。

## 前端交互

- 禁止在业务代码中直接使用浏览器原生阻塞弹窗：`alert`、`confirm`、`prompt`，包括 `window.alert`、`window.confirm`、`window.prompt`。
- 需要提示、确认或输入时，必须使用项目内统一的 Web 组件。
- 当前统一弹窗组件位于 `src/ui/dialog.js`，新增交互应复用它或在同一组件体系内扩展。

## 工程约定

- 依赖管理只使用 npm，不重新引入 Yarn。
- 不手动编辑 `service/app/` 下的构建产物；修改前端源码后通过 `npm run build` 生成。
- 提交前至少运行 `npm run check`、`npm test`、`npm run build`。
