# Obsidian Gantt Builder

A plugin for building and editing Mermaid Gantt charts from tasks in the current note.

## What it does

- Opens the builder in a new tab, the sidebar, or a modal.
- Lets you edit task group, task name, status, start date, due date, task ID, and dependencies in a UI.
- Shows both a live preview and the generated Mermaid code.
- Writes the editable task data and Mermaid Gantt block back into the note.
- Reloads from saved plugin data, or falls back to parsing supported task syntax already in the note.

## Typical workflow

1. Open a Markdown note.
2. Run the `Open builder for current note` command, or use the ribbon icon.
3. Add or edit tasks in the builder UI.
4. Preview the Mermaid Gantt chart.
5. Write tasks or the Gantt chart back into the current note.

## Write targets

The plugin can write content:

- At the cursor
- At the bottom of the note
- Below a specific heading

`Gantt title` only controls the Mermaid chart title and can be left empty.

## Supported task formats

References:
- [About Task Formats](https://publish.obsidian.md/tasks/Reference/Task+Formats/About+Task+Formats)
- [Tasks Emoji Format](https://publish.obsidian.md/tasks/Reference/Task+Formats/Tasks+Emoji+Format)

Supported Tasks emoji fields:
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
npm run lint
npm run build
```

## Release artifacts

The release package should include:

- `main.js`
- `manifest.json`
- `styles.css`
