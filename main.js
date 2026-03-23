"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// main.ts
var main_exports = {};
__export(main_exports, {
  default: () => ObsidianGanttBuilderPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian = require("obsidian");

// utils/ganttHelper.ts
var DATE_PATTERN = "\\d{4}-\\d{2}-\\d{2}";
var startDateRegex = new RegExp(`(?:\\u{1F6EB}\\uFE0F?\\s*|\\[start::\\s*)(${DATE_PATTERN})\\]?`, "u");
var scheduledDateRegex = new RegExp(`(?:\\u{23F3}\\uFE0F?\\s*|\\[scheduled::\\s*)(${DATE_PATTERN})\\]?`, "u");
var dueDateRegex = new RegExp(`(?:\\u{1F4C5}\\uFE0F?\\s*|\\[due::\\s*)(${DATE_PATTERN})\\]?`, "u");
var doneDateRegex = new RegExp(`(?:\\u{2705}\\uFE0F?|\\[completion::\\s*)(${DATE_PATTERN})\\]?`, "u");
var createdDateRegex = new RegExp(`(?:\\u{2795}\\uFE0F?|\\[created::\\s*)(${DATE_PATTERN})\\]?`, "u");
var cancelledDateRegex = new RegExp(`(?:\\u{274C}\\uFE0F?|\\[cancelled::\\s*)(${DATE_PATTERN})\\]?`, "u");
var idRegex = new RegExp(`(?:\\u{1F194}\\uFE0F?\\s*|\\[id::\\s*)([a-zA-Z0-9_-]+)\\]?`, "u");
var dependencyRegex = new RegExp(`(?:\\u{26D4}\\uFE0F?\\s*|\\[(?:dependsOn|depends on|depends)::\\s*)([a-zA-Z0-9_-]+)\\]?`, "iu");
var ownerRegex = /\[owner::\s*([^\]]+)\]/;
var milestoneRegex = new RegExp(`#milestone|\\u{1F6A9}\\uFE0F?`, "iu");
var criticalRegex = new RegExp(`#crit|#critical|\\u{1F53A}\\uFE0F?`, "iu");
var DATA_START_MARKER = "%% gantt-builder-data-start %%";
var DATA_END_MARKER = "%% gantt-builder-data-end %%";
var LEGACY_DATA_START_MARKER = "%% gantt-builder:data:start %%";
var LEGACY_DATA_END_MARKER = "%% gantt-builder:data:end %%";
var GANTT_START_MARKER = "%% gantt-builder:start %%";
var GANTT_END_MARKER = "%% gantt-builder:end %%";
var DEFAULT_CHART_TITLE = "Gantt Chart";
var normalizeDate = (date) => {
  const trimmed = date.trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : "";
};
var cleanName = (name) => name.replace(startDateRegex, "").replace(scheduledDateRegex, "").replace(dueDateRegex, "").replace(doneDateRegex, "").replace(createdDateRegex, "").replace(cancelledDateRegex, "").replace(idRegex, "").replace(dependencyRegex, "").replace(ownerRegex, "").replace(milestoneRegex, "").replace(criticalRegex, "").replace(/\s+/g, " ").trim();
var sanitizeName = (name) => name.replace(/[:#]/g, "").trim();
var formatDate = (date) => date.toISOString().slice(0, 10);
var addDays = (dateStr, days) => {
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  date.setDate(date.getDate() + days);
  return formatDate(date);
};
function parseTasksFromNote(markdown) {
  const tasks = [];
  const lines = markdown.split(/\r?\n/);
  let currentProject = "Current Note";
  let currentSection = "";
  for (const line of lines) {
    const headingMatch = line.match(/^\s{0,3}(#{2,3})\s+(.+)$/);
    if (headingMatch) {
      if (headingMatch[1].length === 2) {
        currentProject = headingMatch[2].trim();
        currentSection = "";
      } else {
        currentSection = headingMatch[2].trim();
      }
      continue;
    }
    const taskMatch = line.match(/^\s*-\s*\[([ xX])\]\s+(.+)$/);
    if (!taskMatch) {
      continue;
    }
    const raw = taskMatch[2];
    const parsedStart = normalizeDate(raw.match(startDateRegex)?.[1] ?? "");
    const parsedScheduled = normalizeDate(raw.match(scheduledDateRegex)?.[1] ?? "");
    const parsedDue = normalizeDate(raw.match(dueDateRegex)?.[1] ?? "");
    const task = {
      internalId: crypto.randomUUID(),
      name: cleanName(raw) || "Untitled Task",
      project: currentProject,
      section: currentSection,
      completed: taskMatch[1].toLowerCase() === "x",
      startDate: parsedStart || parsedScheduled,
      dueDate: parsedDue,
      owner: (raw.match(ownerRegex)?.[1] ?? "").trim(),
      id: (raw.match(idRegex)?.[1] ?? "").trim(),
      dependency: (raw.match(dependencyRegex)?.[1] ?? "").trim(),
      isMilestone: milestoneRegex.test(raw),
      isHighPriority: criticalRegex.test(raw)
    };
    tasks.push(task);
  }
  return tasks;
}
var RESERVED_ATTRS = /* @__PURE__ */ new Set(["crit", "milestone", "done", "active"]);
function parseTaskLineFromMermaid(line, section, index) {
  const match = line.match(/^\s*([^:]+?)\s*:\s*(.+)\s*$/);
  if (!match) {
    return null;
  }
  const name = match[1].trim();
  const attrs = match[2].split(",").map((part) => part.trim()).filter(Boolean);
  let completed = false;
  let isMilestone = false;
  let isHighPriority = false;
  let id = "";
  let dependency = "";
  let startDate = "";
  let dueDate = "";
  for (const token of attrs) {
    if (token === "done") {
      completed = true;
      continue;
    }
    if (token === "milestone") {
      isMilestone = true;
      continue;
    }
    if (token === "crit") {
      isHighPriority = true;
      continue;
    }
    if (token.startsWith("after ")) {
      dependency = token.slice(6).trim();
      continue;
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(token)) {
      if (!startDate) {
        startDate = token;
      } else if (!dueDate) {
        dueDate = token;
      }
      continue;
    }
    if (/^\d+d$/i.test(token)) {
      const durationDays = Math.max(1, Number.parseInt(token, 10));
      if (startDate && !dueDate) {
        dueDate = addDays(startDate, durationDays - 1);
      }
      continue;
    }
    if (!RESERVED_ATTRS.has(token) && !id) {
      id = token;
    }
  }
  if (isMilestone && !dueDate) {
    dueDate = startDate;
  }
  return {
    internalId: crypto.randomUUID(),
    name: name || `Task ${index + 1}`,
    project: "Current Note",
    section,
    completed,
    startDate,
    dueDate,
    owner: "",
    id,
    dependency,
    isMilestone,
    isHighPriority
  };
}
function parseTasksFromGanttBlock(noteContent) {
  const startIndex = noteContent.indexOf(GANTT_START_MARKER);
  const endIndex = noteContent.indexOf(GANTT_END_MARKER);
  if (startIndex === -1 || endIndex === -1 || endIndex <= startIndex) {
    return null;
  }
  const raw = noteContent.slice(startIndex + GANTT_START_MARKER.length, endIndex);
  const mermaidMatch = raw.match(/```mermaid\s*([\s\S]*?)\s*```/i);
  const mermaid = mermaidMatch?.[1]?.trim();
  if (!mermaid) {
    return null;
  }
  const lines = mermaid.split(/\r?\n/);
  const tasks = [];
  let chartTitle = DEFAULT_CHART_TITLE;
  let currentSection = "";
  lines.forEach((line, index) => {
    const titleMatch = line.match(/^\s*title\s+(.+)$/i);
    if (titleMatch) {
      chartTitle = titleMatch[1].trim() || DEFAULT_CHART_TITLE;
      return;
    }
    const sectionMatch = line.match(/^\s*section\s+(.+)$/i);
    if (sectionMatch) {
      currentSection = sectionMatch[1].trim();
      return;
    }
    const task = parseTaskLineFromMermaid(line, currentSection, index);
    if (task) {
      tasks.push(task);
    }
  });
  return tasks.length ? { chartTitle, tasks } : null;
}
var calculateWorkingDays = (startDate, endDate) => {
  if (!startDate || !endDate) {
    return 1;
  }
  const start = new Date(startDate);
  const end = new Date(endDate);
  let current = start <= end ? new Date(start) : new Date(end);
  const final = start <= end ? new Date(end) : new Date(start);
  let days = 0;
  while (current <= final) {
    const dow = current.getDay();
    if (dow !== 0 && dow !== 6) {
      days += 1;
    }
    current.setDate(current.getDate() + 1);
  }
  return Math.max(1, days);
};
function calculateDuration(task, excludeWeekends) {
  if (task.isMilestone) {
    return "0d";
  }
  if (!task.startDate || !task.dueDate) {
    return "1d";
  }
  if (excludeWeekends) {
    return `${calculateWorkingDays(task.startDate, task.dueDate)}d`;
  }
  const start = new Date(task.startDate);
  const end = new Date(task.dueDate);
  const diff = Math.floor(Math.abs(end.getTime() - start.getTime()) / 864e5) + 1;
  return `${Math.max(1, diff)}d`;
}
function calculateDependencyDuration(currentTaskDueDate, dependencyTask, excludeWeekends) {
  if (!currentTaskDueDate || !dependencyTask) {
    return "1d";
  }
  let dependencyEndDate = dependencyTask.dueDate;
  if (!dependencyEndDate) {
    if (dependencyTask.startDate) {
      dependencyEndDate = addDays(dependencyTask.startDate, 1);
    } else {
      return "1d";
    }
  }
  if (excludeWeekends) {
    const depEnd2 = new Date(dependencyEndDate);
    const nextStart = new Date(depEnd2);
    nextStart.setDate(nextStart.getDate() + 1);
    while (nextStart.getDay() === 0 || nextStart.getDay() === 6) {
      nextStart.setDate(nextStart.getDate() + 1);
    }
    return `${calculateWorkingDays(formatDate(nextStart), currentTaskDueDate)}d`;
  }
  const currentDue = new Date(currentTaskDueDate);
  const depEnd = new Date(dependencyEndDate);
  const diff = Math.ceil((currentDue.getTime() - depEnd.getTime()) / 864e5);
  return `${Math.max(1, diff)}d`;
}
function generateMermaidCode(tasks, config, chartTitle = DEFAULT_CHART_TITLE) {
  const safeTitle = sanitizeName(chartTitle) || DEFAULT_CHART_TITLE;
  const lines = ["gantt", `    title ${safeTitle}`, "    dateFormat YYYY-MM-DD", "    axisFormat %m/%d", "    todayMarker on"];
  if (config.excludeWeekends) {
    lines.push("    excludes weekends");
  }
  lines.push("");
  if (!tasks.length) {
    return lines.join("\n");
  }
  const sections = /* @__PURE__ */ new Map();
  for (const task of tasks) {
    const sectionName = task.section || "Tasks";
    if (!sections.has(sectionName)) {
      sections.set(sectionName, []);
    }
    sections.get(sectionName)?.push(task);
  }
  const globalTaskMap = /* @__PURE__ */ new Map();
  for (const task of tasks) {
    if (task.id) {
      globalTaskMap.set(task.id, task);
    }
  }
  sections.forEach((sectionTasks, sectionName) => {
    lines.push(`    section ${sanitizeName(sectionName) || "Tasks"}`);
    for (const task of sectionTasks) {
      const attrs = [];
      if (task.isHighPriority) {
        attrs.push("crit");
      }
      if (task.isMilestone) {
        attrs.push("milestone");
      }
      attrs.push(task.completed ? "done" : "active");
      if (task.id) {
        attrs.push(task.id);
      }
      if (task.dependency) {
        attrs.push(`after ${task.dependency}`);
        if (task.dueDate) {
          attrs.push(calculateDependencyDuration(task.dueDate, globalTaskMap.get(task.dependency), config.excludeWeekends));
        } else {
          attrs.push("1d");
        }
      } else if (task.isMilestone) {
        attrs.push(task.dueDate || task.startDate || formatDate(/* @__PURE__ */ new Date()));
        attrs.push("0d");
      } else if (task.startDate && task.dueDate) {
        attrs.push(task.startDate);
        attrs.push(calculateDuration(task, config.excludeWeekends));
      } else if (task.dueDate) {
        attrs.push(task.dueDate);
        attrs.push("1d");
      } else {
        attrs.push(formatDate(/* @__PURE__ */ new Date()));
        attrs.push("1d");
      }
      lines.push(`    ${sanitizeName(task.name) || "Untitled Task"} :${attrs.join(", ")}`);
    }
    lines.push("");
  });
  return lines.join("\n").trimEnd();
}
var toMermaidBlock = (mermaidCode) => `\`\`\`mermaid
${mermaidCode}
\`\`\``;
function loadPersistedGanttData(noteContent) {
  const ganttData = parseTasksFromGanttBlock(noteContent);
  const defaultTitle = ganttData?.chartTitle ?? DEFAULT_CHART_TITLE;
  const scopes = [
    { start: DATA_START_MARKER, end: DATA_END_MARKER },
    { start: LEGACY_DATA_START_MARKER, end: LEGACY_DATA_END_MARKER }
  ];
  for (const scope of scopes) {
    const startIndex = noteContent.indexOf(scope.start);
    const endIndex = noteContent.indexOf(scope.end);
    if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
      const scopedContent = noteContent.slice(startIndex + scope.start.length, endIndex);
      return {
        chartTitle: defaultTitle,
        tasks: parseTasksFromNote(scopedContent)
      };
    }
  }
  if (ganttData) {
    return ganttData;
  }
  return null;
}
function buildGanttBlock(mermaidCode) {
  return [GANTT_START_MARKER, toMermaidBlock(mermaidCode), GANTT_END_MARKER].join("\n");
}
function replaceExistingGantt(noteContent, ganttBlock) {
  const startIndex = noteContent.indexOf(GANTT_START_MARKER);
  const endIndex = noteContent.indexOf(GANTT_END_MARKER);
  if (startIndex === -1 || endIndex === -1 || endIndex <= startIndex) {
    return null;
  }
  const before = noteContent.slice(0, startIndex).replace(/\s+$/, "");
  const after = noteContent.slice(endIndex + GANTT_END_MARKER.length).replace(/^\s+/, "");
  return `${before}

${ganttBlock}

${after}`.trimEnd() + "\n";
}
function parseHeadingSpec(headingText) {
  const match = headingText.trim().match(/^(#{1,6})\s+(.+)$/);
  if (!match) {
    return null;
  }
  const text = match[2].replace(/\s+#+\s*$/, "").trim();
  if (!text) {
    return null;
  }
  return { level: match[1].length, text };
}
function findHeadingInsertPos(noteContent, headingText) {
  const target = parseHeadingSpec(headingText);
  if (!target) {
    return -1;
  }
  const lines = noteContent.split(/\r?\n/);
  let offset = 0;
  for (const line of lines) {
    const headingMatch = line.match(/^\s{0,3}(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const currentText = headingMatch[2].replace(/\s+#+\s*$/, "").trim();
      if (level === target.level && currentText === target.text) {
        return offset + line.length + 1;
      }
    }
    offset += line.length + 1;
  }
  return -1;
}
function insertAfterHeading(noteContent, headingText, block) {
  const insertPos = findHeadingInsertPos(noteContent, headingText);
  if (insertPos === -1) {
    return `${noteContent.replace(/\s*$/, "")}

${block}
`;
  }
  return `${noteContent.slice(0, insertPos)}
${block}
${noteContent.slice(insertPos)}`.trimEnd() + "\n";
}
function insertBlockByMode(noteContent, block, options) {
  if (options.mode === "cursor" && typeof options.cursorOffset === "number") {
    const offset = Math.max(0, Math.min(options.cursorOffset, noteContent.length));
    return `${noteContent.slice(0, offset)}
${block}
${noteContent.slice(offset)}`.trimEnd() + "\n";
  }
  if (options.mode === "heading") {
    return insertAfterHeading(noteContent, options.headingText ?? "", block);
  }
  return `${noteContent.replace(/\s*$/, "")}

${block}
`.trimStart();
}
function upsertGanttArtifacts(noteContent, mermaidCode, _tasks, _chartTitle = DEFAULT_CHART_TITLE, options = { mode: "bottom", useCustomTitle: true }) {
  const ganttBlock = buildGanttBlock(mermaidCode);
  const replaced = replaceExistingGantt(noteContent, ganttBlock);
  if (replaced) {
    return replaced;
  }
  return insertBlockByMode(noteContent, ganttBlock, options);
}
function serializeTasksToMarkdown(tasks) {
  const sections = /* @__PURE__ */ new Map();
  for (const task of tasks) {
    const sectionName = task.section.trim() || "\u672A\u5206\u7EC4";
    if (!sections.has(sectionName)) {
      sections.set(sectionName, []);
    }
    sections.get(sectionName)?.push(task);
  }
  const lines = [];
  sections.forEach((sectionTasks, sectionName) => {
    lines.push(`### ${sectionName}`);
    for (const task of sectionTasks) {
      const parts = [`- [${task.completed ? "x" : " "}]`, task.name || "Untitled Task"];
      if (task.startDate) {
        parts.push(`\u{1F6EB} ${task.startDate}`);
      }
      if (task.dueDate) {
        parts.push(`\u{1F4C5} ${task.dueDate}`);
      }
      if (task.id) {
        parts.push(`\u{1F194} ${task.id}`);
      }
      if (task.dependency) {
        parts.push(`\u26D4 ${task.dependency}`);
      }
      if (task.isHighPriority) {
        parts.push("\u{1F53A}");
      }
      if (task.isMilestone) {
        parts.push("#milestone");
      }
      lines.push(parts.join(" "));
    }
    lines.push("");
  });
  return lines.join("\n").trim();
}
function upsertTaskScope(noteContent, tasks, options = { mode: "bottom" }) {
  const taskBody = serializeTasksToMarkdown(tasks);
  const block = `${DATA_START_MARKER}
${taskBody}
${DATA_END_MARKER}`;
  const scopes = [
    { start: DATA_START_MARKER, end: DATA_END_MARKER },
    { start: LEGACY_DATA_START_MARKER, end: LEGACY_DATA_END_MARKER }
  ];
  for (const scope of scopes) {
    const startIndex = noteContent.indexOf(scope.start);
    const endIndex = noteContent.indexOf(scope.end);
    if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
      if (options.mode === "heading") {
        const before2 = noteContent.slice(0, startIndex).replace(/\s+$/, "");
        const after2 = noteContent.slice(endIndex + scope.end.length).replace(/^\s+/, "");
        const withoutOldScope = `${before2}

${after2}`.trimEnd() + "\n";
        return insertBlockByMode(withoutOldScope, block, options);
      }
      const before = noteContent.slice(0, startIndex).replace(/\s+$/, "");
      const after = noteContent.slice(endIndex + scope.end.length).replace(/^\s+/, "");
      return `${before}

${block}

${after}`.trimEnd() + "\n";
    }
  }
  return insertBlockByMode(noteContent, block, options);
}

// main.ts
var VIEW_TYPE_GANTT_BUILDER = "gantt-builder-view";
var DEFAULT_SETTINGS = {
  excludeWeekends: true,
  openMode: "modal",
  insertMode: "bottom",
  ganttTargetHeading: "## \u9879\u76EE\u5206\u89E3",
  taskTargetHeading: "## \u9879\u76EE\u5206\u89E3"
};
var createEmptyTask = (section = "") => ({
  internalId: crypto.randomUUID(),
  name: "",
  project: "Current Note",
  section,
  completed: false,
  startDate: "",
  dueDate: "",
  owner: "",
  id: "",
  dependency: "",
  isMilestone: false,
  isHighPriority: false
});
var GanttBuilderEditor = class {
  constructor(app, file, rootEl, settings, onSettingsChange) {
    this.tasks = [];
    this.chartTitle = DEFAULT_CHART_TITLE;
    this.draggingTaskId = null;
    this.app = app;
    this.file = file;
    this.rootEl = rootEl;
    this.config = { excludeWeekends: settings.excludeWeekends };
    this.insertMode = settings.insertMode;
    this.ganttTargetHeading = settings.ganttTargetHeading;
    this.taskTargetHeading = settings.taskTargetHeading;
    this.onSettingsChange = onSettingsChange;
    this.previewComponent = new import_obsidian.Component();
    this.previewComponent.load();
    const toolbarEl = this.rootEl.createDiv("gantt-builder-toolbar");
    const titleWrapEl = toolbarEl.createDiv("gantt-builder-title-wrap");
    titleWrapEl.createEl("label", { text: "\u7518\u7279\u56FE\u6807\u9898" });
    this.titleInputEl = titleWrapEl.createEl("input", {
      type: "text",
      placeholder: DEFAULT_CHART_TITLE,
      value: this.chartTitle
    });
    this.titleInputEl.onchange = async () => {
      this.chartTitle = this.titleInputEl.value.trim() || DEFAULT_CHART_TITLE;
      this.titleInputEl.value = this.chartTitle;
      await this.refreshPreview();
    };
    titleWrapEl.createEl("small", { text: "\u5F53\u5199\u5165\u4F4D\u7F6E\u4E3A\u201C\u7279\u5B9A\u6807\u9898\u4E0B\u65B9\u201D\u65F6\uFF0C\u6807\u9898\u56FA\u5B9A\u4E3A\u9ED8\u8BA4\u503C\u3002" });
    const topButtonsEl = toolbarEl.createDiv("gantt-builder-button-row");
    const reloadButton = topButtonsEl.createEl("button", { text: "\u4ECE\u7B14\u8BB0\u91CD\u8F7D" });
    reloadButton.onclick = async () => {
      await this.reloadTasks();
      this.renderTaskTable();
      await this.refreshPreview();
      new import_obsidian.Notice("\u5DF2\u4ECE\u5F53\u524D\u7B14\u8BB0\u91CD\u8F7D\u4EFB\u52A1");
    };
    const copyButton = topButtonsEl.createEl("button", { text: "\u590D\u5236\u5230\u526A\u8D34\u677F" });
    copyButton.onclick = async () => {
      const code = generateMermaidCode(this.tasks, this.config, this.getEffectiveChartTitle());
      await navigator.clipboard.writeText(toMermaidBlock(code));
      new import_obsidian.Notice("Mermaid \u4EE3\u7801\u5DF2\u590D\u5236\u5230\u526A\u8D34\u677F");
    };
    const exportSvgButton = topButtonsEl.createEl("button", { text: "\u5BFC\u51FA SVG" });
    exportSvgButton.onclick = async () => {
      await this.exportSvg();
    };
    const exportPngButton = topButtonsEl.createEl("button", { text: "\u5BFC\u51FA PNG" });
    exportPngButton.onclick = async () => {
      await this.exportPng();
    };
    const saveTasksButton = topButtonsEl.createEl("button", { text: "\u5199\u5165/\u66F4\u65B0\u4EFB\u52A1" });
    saveTasksButton.onclick = async () => {
      await this.saveTasksToNote();
    };
    const saveGanttButton = topButtonsEl.createEl("button", { text: "\u5199\u5165/\u66F4\u65B0\u7518\u7279\u56FE", cls: "mod-cta" });
    saveGanttButton.onclick = async () => {
      await this.saveGanttToNote();
    };
    this.rootEl.createDiv("gantt-builder-note-title").setText(`\u5F53\u524D\u7B14\u8BB0\uFF1A${this.file.basename}`);
    const taskHeaderEl = this.rootEl.createDiv("gantt-builder-task-header");
    taskHeaderEl.createEl("h3", { text: "\u4EFB\u52A1\u5217\u8868\uFF08\u652F\u6301\u62D6\u62FD\u6392\u5E8F\uFF09" });
    const addTaskButton = taskHeaderEl.createEl("button", { text: "\u65B0\u589E\u4EFB\u52A1", cls: "mod-cta" });
    addTaskButton.onclick = async () => {
      this.tasks.push(createEmptyTask());
      this.renderTaskTable();
      await this.refreshPreview();
    };
    this.tableWrapEl = this.rootEl.createDiv("gantt-builder-table-wrap");
    const viewerWrapEl = this.rootEl.createDiv("gantt-builder-viewer");
    const tabsEl = viewerWrapEl.createDiv("gantt-builder-tabs");
    const previewTabButton = tabsEl.createEl("button", { text: "\u9884\u89C8", cls: "is-active" });
    const codeTabButton = tabsEl.createEl("button", { text: "Mermaid \u4EE3\u7801" });
    previewTabButton.onclick = () => this.switchTab("preview", previewTabButton, codeTabButton);
    codeTabButton.onclick = () => this.switchTab("code", previewTabButton, codeTabButton);
    this.previewPaneEl = viewerWrapEl.createDiv("gantt-builder-preview");
    this.codePaneEl = viewerWrapEl.createDiv("gantt-builder-code-pane");
    this.codePaneEl.addClass("is-hidden");
    this.codeTextEl = this.codePaneEl.createEl("textarea", {
      cls: "gantt-builder-code",
      attr: { readonly: "true" }
    });
    const bottomSettingsEl = this.rootEl.createDiv("gantt-builder-toolbar gantt-builder-bottom-settings");
    new import_obsidian.Setting(bottomSettingsEl).setName("\u6392\u9664\u5468\u672B").setDesc("\u542F\u7528\u540E\u6309\u5DE5\u4F5C\u65E5\u8BA1\u7B97\u65F6\u957F").addToggle(
      (toggle) => toggle.setValue(this.config.excludeWeekends).onChange(async (value) => {
        this.config.excludeWeekends = value;
        await this.onSettingsChange({ excludeWeekends: value });
        await this.refreshPreview();
      })
    );
    new import_obsidian.Setting(bottomSettingsEl).setName("\u5199\u5165\u4F4D\u7F6E").setDesc("\u540C\u65F6\u4F5C\u7528\u4E8E\u7518\u7279\u56FE\u548C\u4EFB\u52A1\u5199\u5165").addDropdown(
      (dropdown) => dropdown.addOption("cursor", "\u5149\u6807\u6240\u5728\u4F4D\u7F6E").addOption("bottom", "\u5E95\u90E8").addOption("heading", "\u7279\u5B9A\u6807\u9898\u4E0B\u65B9").setValue(this.insertMode).onChange(async (value) => {
        this.insertMode = value;
        await this.onSettingsChange({ insertMode: this.insertMode });
        this.updateTitleInputAvailability();
        await this.refreshPreview();
      })
    );
    this.updateTitleInputAvailability();
  }
  async initialize() {
    await this.reloadTasks();
    this.renderTaskTable();
    await this.refreshPreview();
  }
  destroy() {
    this.previewComponent.unload();
  }
  switchTab(tab, previewButton, codeButton) {
    const previewActive = tab === "preview";
    previewButton.toggleClass("is-active", previewActive);
    codeButton.toggleClass("is-active", !previewActive);
    this.previewPaneEl.toggleClass("is-hidden", !previewActive);
    this.codePaneEl.toggleClass("is-hidden", previewActive);
  }
  updateTitleInputAvailability() {
    this.titleInputEl.disabled = this.insertMode === "heading";
  }
  isValidHeadingPattern(heading) {
    return /^(#{1,6})\s+\S.+$/.test(heading.trim());
  }
  getEffectiveChartTitle() {
    return this.insertMode === "heading" ? DEFAULT_CHART_TITLE : this.chartTitle;
  }
  hasDateConflict(task) {
    if (!task.startDate || !task.dueDate) {
      return false;
    }
    return new Date(task.startDate) > new Date(task.dueDate);
  }
  async reloadTasks() {
    const content = await this.app.vault.read(this.file);
    const persisted = loadPersistedGanttData(content);
    if (persisted) {
      this.tasks = persisted.tasks.length ? persisted.tasks : [createEmptyTask()];
      this.chartTitle = persisted.chartTitle || DEFAULT_CHART_TITLE;
      this.titleInputEl.value = this.chartTitle;
      return;
    }
    this.tasks = parseTasksFromNote(content);
    if (!this.tasks.length) {
      this.tasks = [createEmptyTask()];
    }
    this.chartTitle = DEFAULT_CHART_TITLE;
    this.titleInputEl.value = this.chartTitle;
  }
  generateRandomTaskId() {
    return `task-${Math.random().toString(36).slice(2, 8)}`;
  }
  getDependencyOptions(currentTask) {
    const options = this.tasks.filter((task) => task.internalId !== currentTask.internalId && task.id.trim()).map((task) => ({ value: task.id.trim(), label: `${task.id.trim()} \xB7 ${task.name || "\u672A\u547D\u540D\u4EFB\u52A1"}` }));
    if (currentTask.dependency && !options.some((item) => item.value === currentTask.dependency)) {
      options.unshift({ value: currentTask.dependency, label: `${currentTask.dependency} \xB7 (\u5F53\u524D\u4F9D\u8D56)` });
    }
    return options;
  }
  moveTask(sourceId, targetId) {
    if (sourceId === targetId) {
      return;
    }
    const sourceIndex = this.tasks.findIndex((item) => item.internalId === sourceId);
    const targetIndex = this.tasks.findIndex((item) => item.internalId === targetId);
    if (sourceIndex === -1 || targetIndex === -1) {
      return;
    }
    const [moved] = this.tasks.splice(sourceIndex, 1);
    this.tasks.splice(targetIndex, 0, moved);
  }
  renderTaskTable() {
    this.tableWrapEl.empty();
    const table = this.tableWrapEl.createEl("table", { cls: "gantt-builder-table" });
    const head = table.createTHead();
    const headerRow = head.insertRow();
    ["\u64CD\u4F5C", "\u5206\u7EC4", "\u4EFB\u52A1", "\u65E5\u671F", "ID/\u4F9D\u8D56"].forEach((title) => headerRow.createEl("th", { text: title }));
    const body = table.createTBody();
    for (const task of this.tasks) {
      const row = body.insertRow();
      row.draggable = true;
      row.dataset.taskId = task.internalId;
      row.addEventListener("dragstart", (event) => {
        this.draggingTaskId = task.internalId;
        event.dataTransfer?.setData("text/plain", task.internalId);
      });
      row.addEventListener("dragover", (event) => {
        event.preventDefault();
        row.classList.add("gantt-builder-row-drop");
      });
      row.addEventListener("dragleave", () => row.classList.remove("gantt-builder-row-drop"));
      row.addEventListener("drop", async () => {
        row.classList.remove("gantt-builder-row-drop");
        if (!this.draggingTaskId) {
          return;
        }
        this.moveTask(this.draggingTaskId, task.internalId);
        this.draggingTaskId = null;
        this.renderTaskTable();
        await this.refreshPreview();
      });
      const actionCell = row.insertCell();
      const actionStack = actionCell.createDiv("gantt-builder-action-stack");
      const addButton = actionStack.createEl("button", { text: "+", attr: { title: "\u5728\u5F53\u524D\u5206\u7EC4\u65B0\u589E\u4EFB\u52A1" } });
      const removeButton = actionStack.createEl("button", { text: "-", cls: "mod-warning", attr: { title: "\u5220\u9664\u4EFB\u52A1" } });
      addButton.onclick = async () => {
        const index = this.tasks.findIndex((item) => item.internalId === task.internalId);
        this.tasks.splice(index + 1, 0, createEmptyTask(task.section));
        this.renderTaskTable();
        await this.refreshPreview();
      };
      removeButton.onclick = async () => {
        this.tasks = this.tasks.filter((item) => item.internalId !== task.internalId);
        if (!this.tasks.length) {
          this.tasks.push(createEmptyTask());
        }
        this.renderTaskTable();
        await this.refreshPreview();
      };
      const sectionCell = row.insertCell();
      const sectionInput = sectionCell.createEl("textarea", {
        cls: "gantt-builder-group-input",
        attr: { rows: "2", placeholder: "\u5206\u7EC4\uFF0C\u5982\uFF1A\u6267\u884C\u9636\u6BB5" }
      });
      sectionInput.value = task.section;
      sectionInput.onchange = async () => {
        task.section = sectionInput.value.trim();
        await this.refreshPreview();
      };
      const taskCell = row.insertCell();
      const taskMainCell = taskCell.createDiv("gantt-builder-task-main-cell");
      const taskInput = taskMainCell.createEl("input", { type: "text", value: task.name, placeholder: "\u4EFB\u52A1\u540D\u79F0" });
      taskInput.onchange = async () => {
        task.name = taskInput.value.trim();
        await this.refreshPreview();
      };
      const statusRow = taskMainCell.createDiv("gantt-builder-status-inline");
      const doneLabel = statusRow.createEl("label");
      const doneToggle = doneLabel.createEl("input", { attr: { type: "checkbox" } });
      doneToggle.checked = task.completed;
      doneToggle.onchange = async () => {
        task.completed = doneToggle.checked;
        await this.refreshPreview();
      };
      doneLabel.appendText("\u5B8C\u6210");
      const milestoneLabel = statusRow.createEl("label");
      const milestoneToggle = milestoneLabel.createEl("input", { attr: { type: "checkbox" } });
      milestoneToggle.checked = task.isMilestone;
      milestoneToggle.onchange = async () => {
        task.isMilestone = milestoneToggle.checked;
        await this.refreshPreview();
      };
      milestoneLabel.appendText("\u91CC\u7A0B\u7891");
      const criticalLabel = statusRow.createEl("label");
      const criticalToggle = criticalLabel.createEl("input", { attr: { type: "checkbox" } });
      criticalToggle.checked = task.isHighPriority;
      criticalToggle.onchange = async () => {
        task.isHighPriority = criticalToggle.checked;
        await this.refreshPreview();
      };
      criticalLabel.appendText("\u5173\u952E");
      const dateCell = row.insertCell();
      const dateStack = dateCell.createDiv("gantt-builder-date-stack");
      const startRow = dateStack.createDiv("gantt-builder-inline-field");
      startRow.createEl("span", { cls: "gantt-builder-inline-label", text: "\u4ECE" });
      const startInput = startRow.createEl("input", { type: "date", value: task.startDate });
      startInput.onchange = async () => {
        task.startDate = startInput.value.trim();
        this.renderTaskTable();
        await this.refreshPreview();
      };
      const dueRow = dateStack.createDiv("gantt-builder-inline-field");
      dueRow.createEl("span", { cls: "gantt-builder-inline-label", text: "\u81F3" });
      const dueInput = dueRow.createEl("input", { type: "date", value: task.dueDate });
      dueInput.onchange = async () => {
        task.dueDate = dueInput.value.trim();
        this.renderTaskTable();
        await this.refreshPreview();
      };
      if (this.hasDateConflict(task)) {
        row.classList.add("gantt-builder-row-conflict");
        dateStack.createDiv("gantt-builder-date-conflict").setText("\u65E5\u671F\u51B2\u7A81");
      }
      const relationCell = row.insertCell();
      const relationStack = relationCell.createDiv("gantt-builder-relation-stack");
      const idWrap = relationStack.createDiv("gantt-builder-id-cell gantt-builder-inline-field");
      idWrap.createEl("span", { cls: "gantt-builder-inline-label", text: "ID" });
      const idInput = idWrap.createEl("input", { type: "text", value: task.id, placeholder: "\u53EF\u9009" });
      idInput.onchange = async () => {
        task.id = idInput.value.trim();
        this.renderTaskTable();
        await this.refreshPreview();
      };
      const randomButton = idWrap.createEl("button", {
        text: "\u{1F3B2}",
        attr: { title: "\u81EA\u52A8\u751F\u6210\u968F\u673A ID", "aria-label": "\u81EA\u52A8\u751F\u6210\u968F\u673A ID" }
      });
      randomButton.onclick = async () => {
        task.id = this.generateRandomTaskId();
        this.renderTaskTable();
        await this.refreshPreview();
      };
      const depWrap = relationStack.createDiv("gantt-builder-inline-field");
      depWrap.createEl("span", { cls: "gantt-builder-inline-label", text: "\u4F9D\u8D56" });
      const dependencySelect = depWrap.createEl("select");
      dependencySelect.addClass("gantt-builder-dependency-select");
      dependencySelect.createEl("option", { value: "", text: "\u65E0\u4F9D\u8D56" });
      for (const option of this.getDependencyOptions(task)) {
        dependencySelect.createEl("option", { value: option.value, text: option.label });
      }
      dependencySelect.value = task.dependency || "";
      dependencySelect.onchange = async () => {
        task.dependency = dependencySelect.value;
        await this.refreshPreview();
      };
    }
  }
  getCursorOffsetForCurrentFile() {
    const markdownView = this.app.workspace.getActiveViewOfType(import_obsidian.MarkdownView);
    if (!markdownView?.file || markdownView.file.path !== this.file.path) {
      return void 0;
    }
    const editor = markdownView.editor;
    const cursor = editor.getCursor();
    if (typeof editor.posToOffset === "function") {
      return editor.posToOffset(cursor);
    }
    const lines = editor.getValue().split("\n");
    let offset = 0;
    for (let line = 0; line < cursor.line; line++) {
      offset += (lines[line] ?? "").length + 1;
    }
    return offset + cursor.ch;
  }
  getRenderedSvgElement() {
    return this.previewPaneEl.querySelector("svg");
  }
  async saveBinaryToVault(filename, bytes) {
    const attachmentFolder = this.app.vault.getConfig?.("attachmentFolderPath") || "";
    const normalizedFolder = attachmentFolder.trim();
    const path = normalizedFolder ? `${normalizedFolder}/${filename}` : filename;
    await this.app.vault.createBinary(path, bytes);
    return path;
  }
  async exportSvg() {
    const svgElement = this.getRenderedSvgElement();
    if (!svgElement) {
      new import_obsidian.Notice("\u672A\u627E\u5230\u53EF\u5BFC\u51FA\u7684\u7518\u7279\u56FE\uFF0C\u8BF7\u5148\u70B9\u51FB\u9884\u89C8\u3002");
      return;
    }
    const cloned = svgElement.cloneNode(true);
    cloned.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    const content = `<?xml version="1.0" encoding="UTF-8"?>
${new XMLSerializer().serializeToString(cloned)}`;
    const bytes = new TextEncoder().encode(content);
    const savedPath = await this.saveBinaryToVault(`${this.file.basename}-gantt-${Date.now()}.svg`, bytes);
    new import_obsidian.Notice(`SVG \u5DF2\u5BFC\u51FA\uFF1A${savedPath}`);
  }
  async exportPng() {
    const svgElement = this.getRenderedSvgElement();
    if (!svgElement) {
      new import_obsidian.Notice("\u672A\u627E\u5230\u53EF\u5BFC\u51FA\u7684\u7518\u7279\u56FE\uFF0C\u8BF7\u5148\u70B9\u51FB\u9884\u89C8\u3002");
      return;
    }
    const cloned = svgElement.cloneNode(true);
    cloned.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    const viewBox = cloned.getAttribute("viewBox");
    let width = 1200;
    let height = 600;
    if (viewBox) {
      const parts = viewBox.split(/[,\s]+/).filter(Boolean);
      if (parts.length >= 4) {
        width = Math.max(1, Math.round(Number(parts[2])));
        height = Math.max(1, Math.round(Number(parts[3])));
      }
    }
    const svgRaw = new XMLSerializer().serializeToString(cloned);
    const blob = new Blob([svgRaw], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    try {
      const image = await new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error("\u65E0\u6CD5\u52A0\u8F7D SVG \u5BFC\u51FA PNG"));
        img.src = url;
      });
      const canvas = document.createElement("canvas");
      canvas.width = width * 2;
      canvas.height = height * 2;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        throw new Error("\u65E0\u6CD5\u521B\u5EFA Canvas");
      }
      ctx.scale(2, 2);
      ctx.drawImage(image, 0, 0, width, height);
      const dataUrl = canvas.toDataURL("image/png");
      const base64 = dataUrl.split(",")[1];
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      const savedPath = await this.saveBinaryToVault(`${this.file.basename}-gantt-${Date.now()}.png`, bytes);
      new import_obsidian.Notice(`PNG \u5DF2\u5BFC\u51FA\uFF1A${savedPath}`);
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  async refreshPreview() {
    const mermaidCode = generateMermaidCode(this.tasks, this.config, this.getEffectiveChartTitle());
    this.codeTextEl.value = toMermaidBlock(mermaidCode);
    this.previewPaneEl.empty();
    await import_obsidian.MarkdownRenderer.render(this.app, `${toMermaidBlock(mermaidCode)}
`, this.previewPaneEl, this.file.path, this.previewComponent);
  }
  async saveTasksToNote() {
    if (this.insertMode === "heading" && !this.isValidHeadingPattern(this.taskTargetHeading)) {
      new import_obsidian.Notice("\u4EFB\u52A1\u9ED8\u8BA4\u76EE\u6807\u6807\u9898\u683C\u5F0F\u65E0\u6548\uFF0C\u8BF7\u4F7F\u7528\u4F8B\u5982\uFF1A## Project Plan");
      return;
    }
    const content = await this.app.vault.read(this.file);
    const cursorOffset = this.getCursorOffsetForCurrentFile();
    const mode = this.insertMode === "cursor" && cursorOffset === void 0 ? "bottom" : this.insertMode;
    if (this.insertMode === "cursor" && cursorOffset === void 0) {
      new import_obsidian.Notice("\u672A\u627E\u5230\u5149\u6807\u4F4D\u7F6E\uFF0C\u5DF2\u56DE\u9000\u5230\u5E95\u90E8\u5199\u5165\u3002");
    }
    const next = upsertTaskScope(content, this.tasks, {
      mode,
      headingText: this.taskTargetHeading,
      cursorOffset
    });
    await this.app.vault.modify(this.file, next);
    new import_obsidian.Notice("\u4EFB\u52A1\u5DF2\u5199\u5165/\u66F4\u65B0\u5230 data \u8303\u56F4\u3002");
  }
  async saveGanttToNote() {
    if (this.insertMode === "heading" && !this.isValidHeadingPattern(this.ganttTargetHeading)) {
      new import_obsidian.Notice("\u7518\u7279\u56FE\u9ED8\u8BA4\u76EE\u6807\u6807\u9898\u683C\u5F0F\u65E0\u6548\uFF0C\u8BF7\u4F7F\u7528\u4F8B\u5982\uFF1A## Project Plan");
      return;
    }
    const content = await this.app.vault.read(this.file);
    const effectiveTitle = this.getEffectiveChartTitle();
    const mermaidCode = generateMermaidCode(this.tasks, this.config, effectiveTitle);
    const cursorOffset = this.getCursorOffsetForCurrentFile();
    const mode = this.insertMode === "cursor" && cursorOffset === void 0 ? "bottom" : this.insertMode;
    if (this.insertMode === "cursor" && cursorOffset === void 0) {
      new import_obsidian.Notice("\u672A\u627E\u5230\u5149\u6807\u4F4D\u7F6E\uFF0C\u5DF2\u56DE\u9000\u5230\u5E95\u90E8\u5199\u5165\u3002");
    }
    const next = upsertGanttArtifacts(content, mermaidCode, this.tasks, effectiveTitle, {
      mode,
      headingText: this.ganttTargetHeading,
      cursorOffset,
      useCustomTitle: this.insertMode !== "heading"
    });
    await this.app.vault.modify(this.file, next);
    new import_obsidian.Notice("\u7518\u7279\u56FE\u5DF2\u5199\u5165/\u66F4\u65B0\u3002");
  }
};
var GanttBuilderModal = class extends import_obsidian.Modal {
  constructor(app, plugin, file) {
    super(app);
    this.editor = null;
    this.plugin = plugin;
    this.file = file;
    this.modalEl.addClass("gantt-builder-modal");
  }
  async onOpen() {
    this.contentEl.empty();
    this.titleEl.setText(`Gantt Builder \xB7 ${this.file.basename}`);
    this.editor = new GanttBuilderEditor(
      this.app,
      this.file,
      this.contentEl,
      {
        excludeWeekends: this.plugin.settings.excludeWeekends,
        insertMode: this.plugin.settings.insertMode,
        ganttTargetHeading: this.plugin.settings.ganttTargetHeading,
        taskTargetHeading: this.plugin.settings.taskTargetHeading
      },
      async (update) => {
        Object.assign(this.plugin.settings, update);
        await this.plugin.saveSettings();
      }
    );
    await this.editor.initialize();
  }
  onClose() {
    this.editor?.destroy();
    this.editor = null;
    this.contentEl.empty();
  }
};
var GanttBuilderWorkspaceView = class extends import_obsidian.ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.file = null;
    this.editor = null;
    this.plugin = plugin;
  }
  getViewType() {
    return VIEW_TYPE_GANTT_BUILDER;
  }
  getDisplayText() {
    return this.file ? `Gantt Builder \xB7 ${this.file.basename}` : "Gantt Builder";
  }
  getIcon() {
    return "calendar-clock";
  }
  async setState(state) {
    const file = this.app.vault.getAbstractFileByPath(state.filePath);
    if (!(file instanceof import_obsidian.TFile)) {
      new import_obsidian.Notice("\u672A\u627E\u5230\u76EE\u6807\u7B14\u8BB0\u3002");
      return;
    }
    this.file = file;
    await this.renderEditor();
  }
  getState() {
    return { filePath: this.file?.path ?? "" };
  }
  async onOpen() {
    await this.renderEditor();
  }
  async onClose() {
    this.editor?.destroy();
    this.editor = null;
  }
  async renderEditor() {
    const container = this.containerEl.children[1];
    if (!container) {
      return;
    }
    container.empty();
    if (!this.file) {
      container.createEl("div", { text: "\u8BF7\u4ECE\u547D\u4EE4\u6216\u529F\u80FD\u533A\u5728\u67D0\u6761\u7B14\u8BB0\u4E2D\u6253\u5F00 Gantt Builder\u3002" });
      return;
    }
    this.editor?.destroy();
    this.editor = new GanttBuilderEditor(
      this.app,
      this.file,
      container,
      {
        excludeWeekends: this.plugin.settings.excludeWeekends,
        insertMode: this.plugin.settings.insertMode,
        ganttTargetHeading: this.plugin.settings.ganttTargetHeading,
        taskTargetHeading: this.plugin.settings.taskTargetHeading
      },
      async (update) => {
        Object.assign(this.plugin.settings, update);
        await this.plugin.saveSettings();
      }
    );
    await this.editor.initialize();
    this.leaf.setEphemeralState({ title: `Gantt Builder \xB7 ${this.file.basename}` });
  }
};
var ObsidianGanttBuilderPlugin = class extends import_obsidian.Plugin {
  constructor() {
    super(...arguments);
    this.settings = DEFAULT_SETTINGS;
  }
  async onload() {
    await this.loadSettings();
    this.registerView(VIEW_TYPE_GANTT_BUILDER, (leaf) => new GanttBuilderWorkspaceView(leaf, this));
    this.addRibbonIcon("calendar-clock", "\u6253\u5F00\u5F53\u524D\u7B14\u8BB0 Gantt Builder", () => void this.openBuilderForActiveNote());
    this.addCommand({
      id: "open-note-gantt-builder",
      name: "\u6253\u5F00\u5F53\u524D\u7B14\u8BB0\u4EFB\u52A1\u7518\u7279\u6784\u5EFA\u5668",
      checkCallback: (checking) => {
        const markdownView = this.app.workspace.getActiveViewOfType(import_obsidian.MarkdownView);
        if (!markdownView?.file) {
          return false;
        }
        if (!checking) {
          void this.openBuilderForActiveNote();
        }
        return true;
      }
    });
    this.addSettingTab(new GanttBuilderSettingTab(this.app, this));
  }
  onunload() {
    this.app.workspace.detachLeavesOfType(VIEW_TYPE_GANTT_BUILDER);
  }
  async loadSettings() {
    const loaded = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    if (!loaded.ganttTargetHeading && loaded.targetHeading) {
      loaded.ganttTargetHeading = loaded.targetHeading;
    }
    if (!loaded.taskTargetHeading && loaded.targetHeading) {
      loaded.taskTargetHeading = loaded.targetHeading;
    }
    if (loaded.ganttTargetHeading && !/^\s*#{1,6}\s+/.test(loaded.ganttTargetHeading)) {
      loaded.ganttTargetHeading = `## ${loaded.ganttTargetHeading.trim()}`;
    }
    if (loaded.taskTargetHeading && !/^\s*#{1,6}\s+/.test(loaded.taskTargetHeading)) {
      loaded.taskTargetHeading = `## ${loaded.taskTargetHeading.trim()}`;
    }
    this.settings = loaded;
  }
  async saveSettings() {
    await this.saveData(this.settings);
  }
  async openBuilderForActiveNote() {
    const markdownView = this.app.workspace.getActiveViewOfType(import_obsidian.MarkdownView);
    const file = markdownView?.file;
    if (!file) {
      new import_obsidian.Notice("\u8BF7\u5148\u6253\u5F00\u4E00\u6761 Markdown \u7B14\u8BB0\u3002");
      return;
    }
    if (this.settings.openMode === "modal") {
      new GanttBuilderModal(this.app, this, file).open();
      return;
    }
    const leaf = this.settings.openMode === "sidebar" ? this.app.workspace.getRightLeaf(false) : this.app.workspace.getLeaf("tab");
    if (!leaf) {
      new import_obsidian.Notice("\u65E0\u6CD5\u521B\u5EFA\u76EE\u6807\u89C6\u56FE\uFF0C\u8BF7\u91CD\u8BD5\u3002");
      return;
    }
    await leaf.setViewState({
      type: VIEW_TYPE_GANTT_BUILDER,
      active: true,
      state: { filePath: file.path }
    });
    this.app.workspace.revealLeaf(leaf);
  }
};
var GanttBuilderSettingTab = class extends import_obsidian.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    new import_obsidian.Setting(containerEl).setName("\u9ED8\u8BA4\u6392\u9664\u5468\u672B").setDesc("\u65B0\u5F00\u6784\u5EFA\u5668\u65F6\u9ED8\u8BA4\u542F\u7528").addToggle(
      (toggle) => toggle.setValue(this.plugin.settings.excludeWeekends).onChange(async (value) => {
        this.plugin.settings.excludeWeekends = value;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName("\u6253\u5F00\u65B9\u5F0F").setDesc("\u9009\u62E9\u6253\u5F00\u6784\u5EFA\u5668\u7684\u9ED8\u8BA4\u4F4D\u7F6E").addDropdown(
      (dropdown) => dropdown.addOption("new-tab", "New Tab").addOption("sidebar", "\u4FA7\u8FB9\u680F").addOption("modal", "\u5F39\u6846").setValue(this.plugin.settings.openMode).onChange(async (value) => {
        this.plugin.settings.openMode = value;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName("\u9ED8\u8BA4\u5199\u5165\u4F4D\u7F6E").setDesc("\u540C\u65F6\u4F5C\u7528\u4E8E\u7518\u7279\u56FE\u4E0E\u4EFB\u52A1\u5199\u5165").addDropdown(
      (dropdown) => dropdown.addOption("cursor", "\u5149\u6807\u6240\u5728\u4F4D\u7F6E").addOption("bottom", "\u5E95\u90E8").addOption("heading", "\u7279\u5B9A\u6807\u9898\u4E0B\u65B9").setValue(this.plugin.settings.insertMode).onChange(async (value) => {
        this.plugin.settings.insertMode = value;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName("\u7518\u7279\u56FE\u9ED8\u8BA4\u76EE\u6807\u6807\u9898").setDesc("\u5FC5\u987B\u5305\u542B\u6807\u9898\u6807\u8BC6\u7B26\uFF0C\u4F8B\u5982\uFF1A## Project Plan").addText(
      (text) => text.setValue(this.plugin.settings.ganttTargetHeading).onChange(async (value) => {
        const next = value.trim();
        if (next && !/^(#{1,6})\s+\S.+$/.test(next)) {
          new import_obsidian.Notice("\u6807\u9898\u683C\u5F0F\u9519\u8BEF\uFF1A\u8BF7\u4F7F\u7528\u4F8B\u5982 ## Project Plan");
          return;
        }
        this.plugin.settings.ganttTargetHeading = next;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName("\u4EFB\u52A1\u9ED8\u8BA4\u76EE\u6807\u6807\u9898").setDesc("\u5FC5\u987B\u5305\u542B\u6807\u9898\u6807\u8BC6\u7B26\uFF0C\u4F8B\u5982\uFF1A## Project Plan").addText(
      (text) => text.setValue(this.plugin.settings.taskTargetHeading).onChange(async (value) => {
        const next = value.trim();
        if (next && !/^(#{1,6})\s+\S.+$/.test(next)) {
          new import_obsidian.Notice("\u6807\u9898\u683C\u5F0F\u9519\u8BEF\uFF1A\u8BF7\u4F7F\u7528\u4F8B\u5982 ## Project Plan");
          return;
        }
        this.plugin.settings.taskTargetHeading = next;
        await this.plugin.saveSettings();
      })
    );
  }
};
