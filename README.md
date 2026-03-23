# Obsidian Gantt Builder（插件版）

把“当前打开笔记”中的 task 读入 UI，编辑后实时预览 Mermaid 甘特图，并一键写回到该笔记。

## 功能

- 基于当前单条笔记读取 task（`- [ ] ...` / `- [x] ...`）
- UI 编辑任务字段（名称、开始/截止、分组、依赖、里程碑、关键任务）
- 实时预览 Mermaid 甘特图
- 一键写入或更新笔记里的甘特代码块（带 `%% gantt-builder:start %%` 标记）
- 支持“排除周末”按工作日计算时长

## 任务解析规则（已支持）

- 开始日期：`🛫 2026-03-20` 或 `[start:: 2026-03-20]`
- 截止日期：`📅 2026-03-28` 或 `[due:: 2026-03-28]`
- 任务 ID：`🆔 t1` 或 `[id:: t1]`
- 依赖：`⛓️ t1` / `🔗 t1` 或 `[depends:: t1]`
- 里程碑：`#milestone` 或 `🚩`
- 关键任务：`#crit` / `#critical` 或 `🔥`

## 开发

```bash
npm install
npm run dev
```

## 构建

```bash
npm run build
```

构建产物为根目录 `main.js`，并配合 `manifest.json`、`styles.css` 作为 Obsidian 插件文件使用。
