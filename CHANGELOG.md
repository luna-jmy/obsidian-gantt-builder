# Changelog

All notable changes to this project are documented in this file.

## [Unreleased]

## [0.1.9] - 2026-03-23

### Fixed
- Fixed language follow behavior to use Obsidian app language (`getLanguage()`), so plugin UI now follows Obsidian's current language setting.
- Fixed `Gantt Title` behavior in `Below specific heading` mode: title is no longer locked and remains editable.
- Changed default `Gantt Title` to empty; when empty, Mermaid output omits the `title` line.

### Added
- Added bilingual UI (Chinese/English) for main editor, notices, commands, and settings.
- Added `LICENSE` file (MIT).

### Docs
- Updated `README.md`:
  - Build/release artifacts do not include `versions.json`.
  - Development instructions no longer reference `npm run dev`.

## [0.1.8] - 2026-03-23

### Fixed
- Fixed task block relocation in `heading` mode: when a data scope already exists, `写入/更新任务` now removes old scope and reinserts it under the configured heading.
- Fixed heading matching behavior to require explicit Markdown heading syntax (for example `## Project Plan`) and exact heading level/text matching.

### Changed
- Task group input is now a 2-row textarea with auto-wrap and narrower column width.
- Date and relation fields are aligned in horizontal label+control rows (`从/至`, `ID`, `依赖`).
- `排除周末` and `写入位置` controls are moved to the bottom settings area of the editor.
- `默认写入位置` now applies to both Gantt and task writing behavior.
- Added separate settings for heading-mode target insertion: `甘特图默认目标标题` and `任务默认目标标题`.
- Writing tasks now persists section groups as `###` headings inside data scope.

## [0.1.7] - 2026-03-23

### Fixed
- Fixed task table layout regression where all row fields were squeezed into the first column.
- Fixed row cell rendering by keeping `td` as native table cells and using inner wrappers for flex layout.

### Changed
- Split `分组` into an independent column (now: 操作 | 分组 | 任务 | 日期 | ID/依赖).
- Adjusted table min-width and per-column widths for the new 5-column layout.

## [0.1.6] - 2026-03-23

### Changed
- Task list layout is refactored to improve alignment and editing efficiency: operation column, task content column, combined date column, and combined ID/dependency column.
- Status controls are moved below task title in horizontal arrangement for long task readability.
- Operation buttons are now icon-based (`+` / `-`) and stacked vertically at row start.
- Plugin header now shows current note name to distinguish multiple open tabs.
- `写入/更新任务` now writes plain task lines directly into task scope markers without adding headings.

### Compatibility
- Task scope markers now use safer syntax: `%% gantt-builder-data-start %%` and `%% gantt-builder-data-end %%`.
- Backward compatibility is kept for legacy markers: `%% gantt-builder:data:start %%` and `%% gantt-builder:data:end %%`.

## [0.1.5] - 2026-03-23

### Added
- Task list now supports drag-and-drop reordering.
- Added section-level quick add (`＋`) to insert a new task in the same group.
- Added `写入/更新任务` action to write task list back into `data start/end` scope.

### Improved
- Added date conflict guard: when start date is later than due date, row highlights and shows `日期冲突`.

## [0.1.4] - 2026-03-23

### Fixed
- Fixed Tasks Emoji parsing when a whitespace appears after emoji markers.
- Start (`🛫`), scheduled (`⏳`), due (`📅`), ID (`🆔`), and dependency (`⛔`) now parse correctly in common `emoji + space + value` format.

## [0.1.3] - 2026-03-23

### Added
- Added export buttons for `SVG` and `PNG` images from the rendered Gantt preview.

### Changed
- `%% gantt-builder:data:start %% ... %% gantt-builder:data:end %%` is now treated as task parsing scope only.
- Gantt save now only writes/updates the `%% gantt-builder:start %% ... %% gantt-builder:end %%` block.
- Gantt overwrite update now prioritizes existing `start/end` marker block replacement.

### Fixed
- Fixed parsing failures for start date, due date, ID, and dependency by using robust Unicode-aware emoji matching.
- Fixed out-of-scope task parsing when `data start/end` markers exist.
- Fixed dependency task duration calculation to align with QuickAdd script behavior.

## [0.1.2] - 2026-03-23

### Added
- Support selecting Gantt insert location: cursor, note bottom, or below a specific heading.
- Date fields now use date pickers.
- Task ID cell now supports random ID generation (`🎲`).
- Dependency field now uses dropdown options from existing tasks with IDs.
- Added `CHANGELOG.md`.

### Changed
- Task table column order is now: Group, Status, Task, Start, Due, ID, Dependency, Action.
- In “below specific heading” insert mode, custom chart title is disabled and default title is used.
- Task parsing updated to align with Tasks Emoji format for supported Gantt fields (`🛫`, `⏳`, `📅`, `🆔`, `⛔`, `🔺`).

## [0.1.1] - 2026-03-23

### Added
- Editable chart title in UI with persistence and reload support.
- Persisted structured data block for better re-editing across sessions.

### Fixed
- Reload now falls back to parsing `%% gantt-builder:start %% ... %% gantt-builder:end %%` when data block is missing.

## [0.1.0] - 2026-03-23

### Added
- Initial Obsidian plugin release.
- UI builder for note tasks with Mermaid Gantt preview.
- Write/update Gantt artifacts back into current note.
- Open modes: modal, new tab, sidebar.
