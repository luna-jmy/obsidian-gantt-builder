# Changelog

All notable changes to this project are documented in this file.

## [Unreleased]

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
