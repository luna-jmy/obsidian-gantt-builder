# Obsidian Gantt Builder

An Obsidian plugin to build and edit Mermaid Gantt charts from tasks in the **current note**.

## Core Features

- Open builder in `New Tab` / `Sidebar` / `Modal`.
- Edit tasks in UI with:
  - section/group
  - status toggles
  - task name
  - start/due date picker
  - task ID + random ID generator
  - dependency dropdown from existing task IDs
- Switch between **Preview** and **Mermaid code** tabs.
- Persist editable task data and Mermaid block back to note.
- Reload from persisted data, or fallback parse from existing Gantt block.

## Gantt Insert Position

- Cursor position
- Note bottom
- Below a specific heading
  - In this mode, chart title is fixed to default `Gantt Chart`.

## Task Format Support

Reference:
- [About Task Formats](https://publish.obsidian.md/tasks/Reference/Task+Formats/About+Task+Formats)
- [Tasks Emoji Format](https://publish.obsidian.md/tasks/Reference/Task+Formats/Tasks+Emoji+Format)

Supported Tasks Emoji fields (for Gantt parsing):
- `🛫 YYYY-MM-DD` (start)
- `⏳ YYYY-MM-DD` (scheduled, used as start fallback)
- `📅 YYYY-MM-DD` (due)
- `🆔 <id>`
- `⛔ <id>` (depends on)
- `🔺` / `#crit` / `#critical` (critical)

Supported Dataview-style fields:
- `[start:: YYYY-MM-DD]`
- `[scheduled:: YYYY-MM-DD]`
- `[due:: YYYY-MM-DD]`
- `[id:: task-id]`
- `[dependsOn:: task-id]` / `[depends on:: task-id]` / `[depends:: task-id]`

## Development

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

Release artifacts:
- `main.js`
- `manifest.json`
- `styles.css`
- `versions.json`
