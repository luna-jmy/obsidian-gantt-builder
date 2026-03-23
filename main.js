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
var startDateRegex = new RegExp(`(?:\u{1F6EB}|\\[start::\\s*)(${DATE_PATTERN})\\]?`);
var scheduledDateRegex = new RegExp(`(?:\u23F3|\\[scheduled::\\s*)(${DATE_PATTERN})\\]?`);
var dueDateRegex = new RegExp(`(?:\u{1F4C5}|\\[due::\\s*)(${DATE_PATTERN})\\]?`);
var doneDateRegex = new RegExp(`(?:\u2705|\\[completion::\\s*)(${DATE_PATTERN})\\]?`);
var createdDateRegex = new RegExp(`(?:\u2795|\\[created::\\s*)(${DATE_PATTERN})\\]?`);
var cancelledDateRegex = new RegExp(`(?:\u274C|\\[cancelled::\\s*)(${DATE_PATTERN})\\]?`);
var idRegex = /(?:🆔|\[id::\s*)([a-zA-Z0-9_-]+)\]?/;
var dependencyRegex = /(?:⛔|\[(?:dependsOn|depends on|depends)::\s*)([a-zA-Z0-9_-]+)\]?/i;
var ownerRegex = /\[owner::\s*([^\]]+)\]/;
var milestoneRegex = /#milestone|🚩/i;
var criticalRegex = /#crit|#critical|🔺/i;
var DATA_START_MARKER = "%% gantt-builder:data:start %%";
var DATA_END_MARKER = "%% gantt-builder:data:end %%";
var GANTT_START_MARKER = "%% gantt-builder:start %%";
var GANTT_END_MARKER = "%% gantt-builder:end %%";
var DEFAULT_CHART_TITLE = "Gantt Chart";
var normalizeDate = (date) => {
  const trimmed = date.trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : "";
};
var cleanName = (name) => name.replace(startDateRegex, "").replace(scheduledDateRegex, "").replace(dueDateRegex, "").replace(doneDateRegex, "").replace(createdDateRegex, "").replace(cancelledDateRegex, "").replace(idRegex, "").replace(dependencyRegex, "").replace(ownerRegex, "").replace(milestoneRegex, "").replace(criticalRegex, "").replace(/\s+/g, " ").trim();
function sanitizeName(name) {
  return name.replace(/[:#]/g, "").trim();
}
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
    const parsedTask = {
      internalId: crypto.randomUUID(),
      name: cleanName(raw),
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
    if (!parsedTask.name) {
      parsedTask.name = "Untitled Task";
    }
    tasks.push(parsedTask);
  }
  return tasks;
}
var RESERVED_ATTRS = /* @__PURE__ */ new Set(["crit", "milestone", "done", "active", "today"]);
function parseTaskLineFromMermaid(line, section, index) {
  const match = line.match(/^\s*([^:]+?)\s*:\s*(.+)\s*$/);
  if (!match) {
    return null;
  }
  const name = match[1].trim();
  const attrs = match[2].split(",").map((item) => item.trim()).filter(Boolean);
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
      startDate = token;
      continue;
    }
    if (/^\d+d$/i.test(token)) {
      const durationDays = Math.max(1, Number.parseInt(token, 10));
      if (startDate) {
        dueDate = addDays(startDate, durationDays - 1);
      }
      continue;
    }
    if (!RESERVED_ATTRS.has(token) && !id) {
      id = token;
    }
  }
  if (isMilestone && !dueDate) {
    dueDate = startDate || "";
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
  if (!tasks.length) {
    return null;
  }
  return { chartTitle, tasks };
}
function calculateWorkingDays(startDate, endDate) {
  if (!startDate || !endDate) {
    return 1;
  }
  const start = new Date(startDate);
  const end = new Date(endDate);
  const direction = start <= end ? 1 : -1;
  let current = new Date(start);
  let workingDays = 0;
  while (direction === 1 && current <= end || direction === -1 && current >= end) {
    const day = current.getDay();
    if (day !== 0 && day !== 6) {
      workingDays += 1;
    }
    current.setDate(current.getDate() + direction);
  }
  return Math.max(1, workingDays);
}
function calculateDuration(task, excludeWeekends) {
  if (task.isMilestone) {
    return "0d";
  }
  if (task.startDate && task.dueDate) {
    if (excludeWeekends) {
      return `${calculateWorkingDays(task.startDate, task.dueDate)}d`;
    }
    const start = new Date(task.startDate);
    const end = new Date(task.dueDate);
    const diff = Math.floor(Math.abs(end.getTime() - start.getTime()) / 864e5) + 1;
    return `${Math.max(1, diff)}d`;
  }
  return "1d";
}
function generateMermaidCode(tasks, config, chartTitle = DEFAULT_CHART_TITLE) {
  const safeTitle = sanitizeName(chartTitle) || DEFAULT_CHART_TITLE;
  if (!tasks.length) {
    return `gantt
    title ${safeTitle}
    dateFormat YYYY-MM-DD`;
  }
  const sections = /* @__PURE__ */ new Map();
  for (const task of tasks) {
    const sectionName = task.section || "Tasks";
    if (!sections.has(sectionName)) {
      sections.set(sectionName, []);
    }
    sections.get(sectionName)?.push(task);
  }
  const lines = [
    "gantt",
    `    title ${safeTitle}`,
    "    dateFormat YYYY-MM-DD",
    "    axisFormat %m/%d",
    "    todayMarker on"
  ];
  if (config.excludeWeekends) {
    lines.push("    excludes weekends");
  }
  lines.push("");
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
      } else if (task.startDate) {
        attrs.push(task.startDate);
      } else if (task.dueDate) {
        attrs.push(task.dueDate);
      } else {
        attrs.push("today");
      }
      attrs.push(calculateDuration(task, config.excludeWeekends));
      lines.push(`    ${sanitizeName(task.name) || "Untitled Task"} :${attrs.join(", ")}`);
    }
    lines.push("");
  });
  return lines.join("\n").trimEnd();
}
function toMermaidBlock(mermaidCode) {
  return `\`\`\`mermaid
${mermaidCode}
\`\`\``;
}
function loadPersistedGanttData(noteContent) {
  const startIndex = noteContent.indexOf(DATA_START_MARKER);
  const endIndex = noteContent.indexOf(DATA_END_MARKER);
  if (startIndex === -1 || endIndex === -1 || endIndex <= startIndex) {
    return parseTasksFromGanttBlock(noteContent);
  }
  const rawBlock = noteContent.slice(startIndex + DATA_START_MARKER.length, endIndex);
  const codeFenceMatch = rawBlock.match(/```json\s*([\s\S]*?)\s*```/i);
  const jsonText = codeFenceMatch?.[1]?.trim() ?? rawBlock.trim();
  if (!jsonText) {
    return parseTasksFromGanttBlock(noteContent);
  }
  try {
    const parsed = JSON.parse(jsonText);
    const normalizeTasks = (rawTasks) => {
      if (!Array.isArray(rawTasks)) {
        return [];
      }
      return rawTasks.filter((item) => typeof item === "object" && item !== null).map((item) => {
        const raw = item;
        return {
          internalId: raw.internalId || crypto.randomUUID(),
          name: raw.name || "Untitled Task",
          project: raw.project || "Current Note",
          section: raw.section || "",
          completed: Boolean(raw.completed),
          startDate: raw.startDate || "",
          dueDate: raw.dueDate || "",
          owner: raw.owner || "",
          id: raw.id || "",
          dependency: raw.dependency || "",
          isMilestone: Boolean(raw.isMilestone),
          isHighPriority: Boolean(raw.isHighPriority)
        };
      });
    };
    if (Array.isArray(parsed)) {
      return {
        chartTitle: DEFAULT_CHART_TITLE,
        tasks: normalizeTasks(parsed)
      };
    }
    if (typeof parsed !== "object" || parsed === null) {
      return null;
    }
    const data = parsed;
    return {
      chartTitle: typeof data.chartTitle === "string" && data.chartTitle.trim() ? data.chartTitle.trim() : DEFAULT_CHART_TITLE,
      tasks: normalizeTasks(data.tasks)
    };
  } catch {
    return parseTasksFromGanttBlock(noteContent);
  }
}
function buildArtifactsBlock(mermaidCode, tasks, chartTitle) {
  const payload = {
    chartTitle: chartTitle.trim() || DEFAULT_CHART_TITLE,
    tasks
  };
  const dataBlock = `\`\`\`json
${JSON.stringify(payload, null, 2)}
\`\`\``;
  const mermaidBlock = toMermaidBlock(mermaidCode);
  return [
    DATA_START_MARKER,
    dataBlock,
    DATA_END_MARKER,
    "",
    GANTT_START_MARKER,
    mermaidBlock,
    GANTT_END_MARKER
  ].join("\n");
}
function replaceExistingArtifacts(noteContent, artifactsBlock) {
  const startIndex = noteContent.indexOf(DATA_START_MARKER);
  const dataEndIndex = noteContent.indexOf(DATA_END_MARKER);
  const ganttStartIndex = noteContent.indexOf(GANTT_START_MARKER);
  const ganttEndIndex = noteContent.indexOf(GANTT_END_MARKER);
  if (startIndex !== -1 && dataEndIndex !== -1 && ganttStartIndex !== -1 && ganttEndIndex !== -1 && startIndex < dataEndIndex && dataEndIndex < ganttStartIndex && ganttStartIndex < ganttEndIndex) {
    const before = noteContent.slice(0, startIndex).replace(/\s+$/, "");
    const after = noteContent.slice(ganttEndIndex + GANTT_END_MARKER.length).replace(/^\s+/, "");
    return `${before}

${artifactsBlock}

${after}`.trimEnd() + "\n";
  }
  const oldStart = noteContent.indexOf(GANTT_START_MARKER);
  const oldEnd = noteContent.indexOf(GANTT_END_MARKER);
  if (oldStart !== -1 && oldEnd !== -1 && oldStart < oldEnd) {
    const before = noteContent.slice(0, oldStart).replace(/\s+$/, "");
    const after = noteContent.slice(oldEnd + GANTT_END_MARKER.length).replace(/^\s+/, "");
    return `${before}

${artifactsBlock}

${after}`.trimEnd() + "\n";
  }
  return null;
}
function insertAfterHeading(noteContent, headingText, block) {
  const escaped = headingText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").trim();
  if (!escaped) {
    return `${noteContent.replace(/\s*$/, "")}

${block}
`;
  }
  const regex = new RegExp(`^\\s{0,3}#{1,6}\\s+${escaped}\\s*$`, "m");
  const match = noteContent.match(regex);
  if (!match || match.index === void 0) {
    return `${noteContent.replace(/\s*$/, "")}

${block}
`;
  }
  const headingEnd = noteContent.indexOf("\n", match.index);
  const insertPos = headingEnd === -1 ? noteContent.length : headingEnd + 1;
  return `${noteContent.slice(0, insertPos)}
${block}
${noteContent.slice(insertPos)}`.trimEnd() + "\n";
}
function upsertGanttArtifacts(noteContent, mermaidCode, tasks, chartTitle = DEFAULT_CHART_TITLE, options = { mode: "bottom", useCustomTitle: true }) {
  const effectiveTitle = options.useCustomTitle === false ? DEFAULT_CHART_TITLE : chartTitle;
  const artifactsBlock = buildArtifactsBlock(mermaidCode, tasks, effectiveTitle);
  const replaced = replaceExistingArtifacts(noteContent, artifactsBlock);
  if (replaced) {
    return replaced;
  }
  if (options.mode === "cursor" && typeof options.cursorOffset === "number") {
    const offset = Math.max(0, Math.min(options.cursorOffset, noteContent.length));
    return `${noteContent.slice(0, offset)}
${artifactsBlock}
${noteContent.slice(offset)}`.trimEnd() + "\n";
  }
  if (options.mode === "heading") {
    return insertAfterHeading(noteContent, options.headingText ?? "", artifactsBlock);
  }
  return `${noteContent.replace(/\s*$/, "")}

${artifactsBlock}
`.trimStart();
}

// main.ts
var VIEW_TYPE_GANTT_BUILDER = "gantt-builder-view";
var DEFAULT_SETTINGS = {
  excludeWeekends: true,
  openMode: "modal",
  insertMode: "bottom",
  targetHeading: "Gantt Chart"
};
var createEmptyTask = () => ({
  internalId: crypto.randomUUID(),
  name: "",
  project: "Current Note",
  section: "",
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
    this.app = app;
    this.file = file;
    this.rootEl = rootEl;
    this.config = { excludeWeekends: settings.excludeWeekends };
    this.insertMode = settings.insertMode;
    this.targetHeading = settings.targetHeading;
    this.onSettingsChange = onSettingsChange;
    this.previewComponent = new import_obsidian.Component();
    this.previewComponent.load();
    const toolbarEl = this.rootEl.createDiv("gantt-builder-toolbar");
    new import_obsidian.Setting(toolbarEl).setName("\u6392\u9664\u5468\u672B").setDesc("\u542F\u7528\u540E\u6309\u5DE5\u4F5C\u65E5\u8BA1\u7B97\u65F6\u957F").addToggle(
      (toggle) => toggle.setValue(this.config.excludeWeekends).onChange(async (value) => {
        this.config.excludeWeekends = value;
        await this.onSettingsChange({ excludeWeekends: value });
        await this.refreshPreview();
      })
    );
    const insertSetting = new import_obsidian.Setting(toolbarEl).setName("\u7518\u7279\u56FE\u5199\u5165\u4F4D\u7F6E").setDesc("\u9009\u62E9\u5199\u5165\u5230\u7B14\u8BB0\u4E2D\u7684\u4F4D\u7F6E");
    insertSetting.addDropdown(
      (dropdown) => dropdown.addOption("cursor", "\u5149\u6807\u6240\u5728\u4F4D\u7F6E").addOption("bottom", "\u5E95\u90E8").addOption("heading", "\u7279\u5B9A\u6807\u9898\u4E0B\u65B9").setValue(this.insertMode).onChange(async (value) => {
        this.insertMode = value;
        await this.onSettingsChange({ insertMode: this.insertMode });
        this.updateTitleInputAvailability();
        this.toggleHeadingInputVisibility();
        await this.refreshPreview();
      })
    );
    const headingWrapEl = toolbarEl.createDiv("gantt-builder-heading-wrap");
    headingWrapEl.createEl("label", { text: "\u76EE\u6807\u6807\u9898\uFF08\u4EC5\u201C\u7279\u5B9A\u6807\u9898\u4E0B\u65B9\u201D\uFF09" });
    this.targetHeadingInputEl = headingWrapEl.createEl("input", {
      type: "text",
      value: this.targetHeading,
      placeholder: "\u4F8B\u5982\uFF1A\u8BA1\u5212"
    });
    this.targetHeadingInputEl.onchange = async () => {
      this.targetHeading = this.targetHeadingInputEl.value.trim();
      await this.onSettingsChange({ targetHeading: this.targetHeading });
    };
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
    titleWrapEl.createEl("small", { text: "\u63D0\u793A\uFF1A\u5199\u5165\u4F4D\u7F6E\u4E3A\u201C\u7279\u5B9A\u6807\u9898\u4E0B\u65B9\u201D\u65F6\uFF0C\u6807\u9898\u56FA\u5B9A\u4E3A\u9ED8\u8BA4\u503C\u3002" });
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
    const saveButton = topButtonsEl.createEl("button", { text: "\u5199\u5165/\u66F4\u65B0\u7518\u7279\u56FE", cls: "mod-cta" });
    saveButton.onclick = async () => {
      await this.saveArtifactsToNote();
    };
    const taskHeaderEl = this.rootEl.createDiv("gantt-builder-task-header");
    taskHeaderEl.createEl("h3", { text: "\u4EFB\u52A1\u5217\u8868" });
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
    this.toggleHeadingInputVisibility();
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
  toggleHeadingInputVisibility() {
    const shouldShow = this.insertMode === "heading";
    this.targetHeadingInputEl.parentElement?.toggleClass("is-hidden", !shouldShow);
  }
  updateTitleInputAvailability() {
    const disabled = this.insertMode === "heading";
    this.titleInputEl.disabled = disabled;
  }
  getEffectiveChartTitle() {
    return this.insertMode === "heading" ? DEFAULT_CHART_TITLE : this.chartTitle;
  }
  async reloadTasks() {
    const content = await this.app.vault.read(this.file);
    const persisted = loadPersistedGanttData(content);
    if (persisted && persisted.tasks.length > 0) {
      this.tasks = persisted.tasks;
      this.chartTitle = persisted.chartTitle || DEFAULT_CHART_TITLE;
      this.titleInputEl.value = this.chartTitle;
      return;
    }
    this.tasks = parseTasksFromNote(content);
    this.chartTitle = DEFAULT_CHART_TITLE;
    this.titleInputEl.value = this.chartTitle;
    if (!this.tasks.length) {
      this.tasks = [createEmptyTask()];
    }
  }
  generateRandomTaskId() {
    return `task-${Math.random().toString(36).slice(2, 8)}`;
  }
  getDependencyOptions(currentTask) {
    const options = this.tasks.filter((task) => task.internalId !== currentTask.internalId && task.id.trim().length > 0).map((task) => ({
      value: task.id.trim(),
      label: `${task.id.trim()} \xB7 ${task.name || "\u672A\u547D\u540D\u4EFB\u52A1"}`
    }));
    if (currentTask.dependency && !options.some((item) => item.value === currentTask.dependency)) {
      options.unshift({
        value: currentTask.dependency,
        label: `${currentTask.dependency} \xB7 (\u5F53\u524D\u4F9D\u8D56)`
      });
    }
    return options;
  }
  renderTaskTable() {
    this.tableWrapEl.empty();
    const table = this.tableWrapEl.createEl("table", { cls: "gantt-builder-table" });
    const head = table.createTHead();
    const headerRow = head.insertRow();
    ["\u5206\u7EC4", "\u72B6\u6001", "\u4EFB\u52A1", "\u5F00\u59CB", "\u622A\u6B62", "ID", "\u4F9D\u8D56", "\u64CD\u4F5C"].forEach((title) => {
      headerRow.createEl("th", { text: title });
    });
    const body = table.createTBody();
    for (const task of this.tasks) {
      const row = body.insertRow();
      this.bindTextInputCell(row, task.section, "\u5982\uFF1A\u6267\u884C\u9636\u6BB5", async (value) => {
        task.section = value;
        await this.refreshPreview();
      });
      const statusCell = row.insertCell();
      statusCell.addClass("gantt-builder-status");
      const doneLabel = statusCell.createEl("label");
      const doneToggle = doneLabel.createEl("input", { attr: { type: "checkbox" } });
      doneToggle.checked = task.completed;
      doneToggle.onchange = async () => {
        task.completed = doneToggle.checked;
        await this.refreshPreview();
      };
      doneLabel.appendText("\u5B8C\u6210");
      const milestoneLabel = statusCell.createEl("label");
      const milestoneToggle = milestoneLabel.createEl("input", { attr: { type: "checkbox" } });
      milestoneToggle.checked = task.isMilestone;
      milestoneToggle.onchange = async () => {
        task.isMilestone = milestoneToggle.checked;
        await this.refreshPreview();
      };
      milestoneLabel.appendText("\u91CC\u7A0B\u7891");
      const criticalLabel = statusCell.createEl("label");
      const criticalToggle = criticalLabel.createEl("input", { attr: { type: "checkbox" } });
      criticalToggle.checked = task.isHighPriority;
      criticalToggle.onchange = async () => {
        task.isHighPriority = criticalToggle.checked;
        await this.refreshPreview();
      };
      criticalLabel.appendText("\u5173\u952E");
      this.bindTextInputCell(row, task.name, "\u4EFB\u52A1\u540D\u79F0", async (value) => {
        task.name = value;
        await this.refreshPreview();
      });
      this.bindDateInputCell(row, task.startDate, async (value) => {
        task.startDate = value;
        await this.refreshPreview();
      });
      this.bindDateInputCell(row, task.dueDate, async (value) => {
        task.dueDate = value;
        await this.refreshPreview();
      });
      const idCell = row.insertCell();
      idCell.addClass("gantt-builder-id-cell");
      const idInput = idCell.createEl("input", { type: "text", value: task.id, placeholder: "\u53EF\u9009" });
      idInput.onchange = async () => {
        task.id = idInput.value.trim();
        this.renderTaskTable();
        await this.refreshPreview();
      };
      const randomButton = idCell.createEl("button", {
        text: "\u{1F3B2}",
        attr: { title: "\u81EA\u52A8\u751F\u6210\u968F\u673A ID", "aria-label": "\u81EA\u52A8\u751F\u6210\u968F\u673A ID" }
      });
      randomButton.onclick = async () => {
        task.id = this.generateRandomTaskId();
        this.renderTaskTable();
        await this.refreshPreview();
      };
      const dependencyCell = row.insertCell();
      const dependencySelect = dependencyCell.createEl("select");
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
      const actionCell = row.insertCell();
      const removeButton = actionCell.createEl("button", { text: "\u5220\u9664", cls: "mod-warning" });
      removeButton.onclick = async () => {
        this.tasks = this.tasks.filter((item) => item.internalId !== task.internalId);
        if (!this.tasks.length) {
          this.tasks.push(createEmptyTask());
        }
        this.renderTaskTable();
        await this.refreshPreview();
      };
    }
  }
  bindTextInputCell(row, value, placeholder, onChange) {
    const cell = row.insertCell();
    const input = cell.createEl("input", { type: "text", value, placeholder });
    input.onchange = async () => onChange(input.value.trim());
  }
  bindDateInputCell(row, value, onChange) {
    const cell = row.insertCell();
    const input = cell.createEl("input", { type: "date", value });
    input.onchange = async () => onChange(input.value.trim());
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
  async refreshPreview() {
    const mermaidCode = generateMermaidCode(this.tasks, this.config, this.getEffectiveChartTitle());
    this.codeTextEl.value = toMermaidBlock(mermaidCode);
    this.previewPaneEl.empty();
    await import_obsidian.MarkdownRenderer.render(
      this.app,
      `${toMermaidBlock(mermaidCode)}
`,
      this.previewPaneEl,
      this.file.path,
      this.previewComponent
    );
  }
  async saveArtifactsToNote() {
    const current = await this.app.vault.read(this.file);
    const effectiveTitle = this.getEffectiveChartTitle();
    const mermaidCode = generateMermaidCode(this.tasks, this.config, effectiveTitle);
    const cursorOffset = this.getCursorOffsetForCurrentFile();
    if (this.insertMode === "cursor" && cursorOffset === void 0) {
      new import_obsidian.Notice("\u672A\u627E\u5230\u5F53\u524D\u7B14\u8BB0\u5149\u6807\u4F4D\u7F6E\uFF0C\u5DF2\u56DE\u9000\u5230\u5E95\u90E8\u5199\u5165\u3002");
    }
    const next = upsertGanttArtifacts(current, mermaidCode, this.tasks, effectiveTitle, {
      mode: this.insertMode === "cursor" && cursorOffset === void 0 ? "bottom" : this.insertMode,
      headingText: this.targetHeading,
      cursorOffset,
      useCustomTitle: this.insertMode !== "heading"
    });
    await this.app.vault.modify(this.file, next);
    new import_obsidian.Notice("\u5DF2\u5199\u5165\u7518\u7279\u56FE\u4E0E\u53EF\u7F16\u8F91\u4EFB\u52A1\u6570\u636E");
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
        targetHeading: this.plugin.settings.targetHeading
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
      new import_obsidian.Notice("\u672A\u627E\u5230\u76EE\u6807\u7B14\u8BB0");
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
        targetHeading: this.plugin.settings.targetHeading
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
    this.addRibbonIcon("calendar-clock", "\u6253\u5F00\u5F53\u524D\u7B14\u8BB0 Gantt Builder", () => {
      void this.openBuilderForActiveNote();
    });
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
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }
  async saveSettings() {
    await this.saveData(this.settings);
  }
  async openBuilderForActiveNote() {
    const markdownView = this.app.workspace.getActiveViewOfType(import_obsidian.MarkdownView);
    const file = markdownView?.file;
    if (!file) {
      new import_obsidian.Notice("\u8BF7\u5148\u6253\u5F00\u4E00\u6761 Markdown \u7B14\u8BB0");
      return;
    }
    if (this.settings.openMode === "modal") {
      new GanttBuilderModal(this.app, this, file).open();
      return;
    }
    const leaf = this.settings.openMode === "sidebar" ? this.app.workspace.getRightLeaf(false) : this.app.workspace.getLeaf("tab");
    if (!leaf) {
      new import_obsidian.Notice("\u65E0\u6CD5\u521B\u5EFA\u76EE\u6807\u89C6\u56FE\uFF0C\u8BF7\u91CD\u8BD5");
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
    new import_obsidian.Setting(containerEl).setName("\u9ED8\u8BA4\u5199\u5165\u4F4D\u7F6E").setDesc("\u9ED8\u8BA4\u5199\u5165\u7518\u7279\u56FE\u5230\u7B14\u8BB0\u7684\u65B9\u5F0F").addDropdown(
      (dropdown) => dropdown.addOption("cursor", "\u5149\u6807\u6240\u5728\u4F4D\u7F6E").addOption("bottom", "\u5E95\u90E8").addOption("heading", "\u7279\u5B9A\u6807\u9898\u4E0B\u65B9").setValue(this.plugin.settings.insertMode).onChange(async (value) => {
        this.plugin.settings.insertMode = value;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName("\u9ED8\u8BA4\u76EE\u6807\u6807\u9898").setDesc("\u5F53\u5199\u5165\u65B9\u5F0F\u4E3A\u201C\u7279\u5B9A\u6807\u9898\u4E0B\u65B9\u201D\u65F6\u4F7F\u7528").addText(
      (text) => text.setValue(this.plugin.settings.targetHeading).onChange(async (value) => {
        this.plugin.settings.targetHeading = value.trim();
        await this.plugin.saveSettings();
      })
    );
  }
};
