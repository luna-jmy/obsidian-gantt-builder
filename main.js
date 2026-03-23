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
var startDateRegex = new RegExp(`(?:\u{1F6EB}|\u{1F680}|\\[start::\\s*)(${DATE_PATTERN})\\]?`);
var dueDateRegex = new RegExp(`(?:\u{1F4C5}|\u23F3|\\[due::\\s*)(${DATE_PATTERN})\\]?`);
var idRegex = /(?:🆔|\[id::\s*)([a-zA-Z0-9_-]+)\]?/;
var dependencyRegex = /(?:⛓️?|🔗|\[depends::\s*)([a-zA-Z0-9_-]+)\]?/;
var ownerRegex = /\[owner::\s*([^\]]+)\]/;
var milestoneRegex = /#milestone|🚩/i;
var criticalRegex = /#crit|#critical|🔥/i;
var normalizeDate = (date) => {
  const trimmed = date.trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : "";
};
var cleanName = (name) => name.replace(startDateRegex, "").replace(dueDateRegex, "").replace(idRegex, "").replace(dependencyRegex, "").replace(ownerRegex, "").replace(milestoneRegex, "").replace(criticalRegex, "").replace(/\s+/g, " ").trim();
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
    const parsedTask = {
      internalId: crypto.randomUUID(),
      name: cleanName(raw),
      project: currentProject,
      section: currentSection,
      completed: taskMatch[1].toLowerCase() === "x",
      startDate: normalizeDate(raw.match(startDateRegex)?.[1] ?? ""),
      dueDate: normalizeDate(raw.match(dueDateRegex)?.[1] ?? ""),
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
function sanitizeName(name) {
  return name.replace(/[:#]/g, "").trim();
}
function generateMermaidCode(tasks, config) {
  if (!tasks.length) {
    return "gantt\n    title Empty Gantt\n    dateFormat YYYY-MM-DD";
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
    "    title Note Task Timeline",
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
function upsertGanttBlock(noteContent, mermaidCode) {
  const startMarker = "%% gantt-builder:start %%";
  const endMarker = "%% gantt-builder:end %%";
  const block = `${startMarker}
${toMermaidBlock(mermaidCode)}
${endMarker}`;
  const startIndex = noteContent.indexOf(startMarker);
  const endIndex = noteContent.indexOf(endMarker);
  if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
    const before = noteContent.slice(0, startIndex).replace(/\s+$/, "");
    const after = noteContent.slice(endIndex + endMarker.length).replace(/^\s+/, "");
    return `${before}

${block}

${after}`.trimEnd();
  }
  const trimmed = noteContent.trimEnd();
  if (!trimmed) {
    return `${block}
`;
  }
  return `${trimmed}

## Gantt Chart

${block}
`;
}

// main.ts
var DEFAULT_SETTINGS = {
  excludeWeekends: true
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
var GanttBuilderModal = class extends import_obsidian.Modal {
  constructor(app, plugin, file, config) {
    super(app);
    this.tasks = [];
    this.previewGeneration = 0;
    this.plugin = plugin;
    this.file = file;
    this.config = config;
    this.modalEl.addClass("gantt-builder-modal");
    this.tableContainer = this.contentEl.createDiv("gantt-builder-table-wrap");
    this.previewContainer = this.contentEl.createDiv("gantt-builder-preview");
    this.codeContainer = this.contentEl.createEl("textarea", {
      cls: "gantt-builder-code",
      attr: { readonly: "true" }
    });
    this.previewComponent = new import_obsidian.Component();
    this.previewComponent.load();
  }
  async onOpen() {
    this.titleEl.setText(`Gantt Builder \xB7 ${this.file.basename}`);
    await this.reloadFromNote();
    this.renderToolbar();
    this.renderTaskTable();
    await this.refreshPreview();
  }
  onClose() {
    this.previewComponent.unload();
  }
  renderToolbar() {
    const toolbar = this.contentEl.createDiv("gantt-builder-toolbar");
    new import_obsidian.Setting(toolbar).setName("\u6392\u9664\u5468\u672B").setDesc("\u542F\u7528\u540E\u4EE5\u5DE5\u4F5C\u65E5\u8BA1\u7B97\u6301\u7EED\u65F6\u95F4").addToggle(
      (toggle) => toggle.setValue(this.config.excludeWeekends).onChange(async (value) => {
        this.config.excludeWeekends = value;
        await this.refreshPreview();
      })
    );
    const buttonGroup = toolbar.createDiv("gantt-builder-button-row");
    const addTaskButton = buttonGroup.createEl("button", { text: "\u65B0\u589E\u4EFB\u52A1", cls: "mod-cta" });
    addTaskButton.onclick = async () => {
      this.tasks.push(createEmptyTask());
      this.renderTaskTable();
      await this.refreshPreview();
    };
    const reloadButton = buttonGroup.createEl("button", { text: "\u4ECE\u7B14\u8BB0\u91CD\u8F7D" });
    reloadButton.onclick = async () => {
      await this.reloadFromNote();
      this.renderTaskTable();
      await this.refreshPreview();
      new import_obsidian.Notice("\u5DF2\u4ECE\u5F53\u524D\u7B14\u8BB0\u91CD\u65B0\u52A0\u8F7D\u4EFB\u52A1");
    };
    const copyButton = buttonGroup.createEl("button", { text: "\u590D\u5236 Mermaid" });
    copyButton.onclick = async () => {
      const code = generateMermaidCode(this.tasks, this.config);
      await navigator.clipboard.writeText(toMermaidBlock(code));
      new import_obsidian.Notice("Mermaid \u4EE3\u7801\u5DF2\u590D\u5236");
    };
    const saveButton = buttonGroup.createEl("button", { text: "\u5199\u5165/\u66F4\u65B0\u7518\u7279\u56FE", cls: "mod-cta" });
    saveButton.onclick = async () => {
      await this.saveGanttBlockToNote();
    };
  }
  renderTaskTable() {
    this.tableContainer.empty();
    const table = this.tableContainer.createEl("table", { cls: "gantt-builder-table" });
    const head = table.createTHead();
    const headerRow = head.insertRow();
    ["\u4EFB\u52A1", "\u5F00\u59CB", "\u622A\u6B62", "ID", "\u4F9D\u8D56", "\u5206\u7EC4", "\u72B6\u6001", "\u64CD\u4F5C"].forEach((label) => {
      headerRow.createEl("th", { text: label });
    });
    const body = table.createTBody();
    this.tasks.forEach((task) => {
      const row = body.insertRow();
      this.bindInputCell(row, task.name, "\u4EFB\u52A1\u540D\u79F0", async (value) => {
        task.name = value;
        await this.refreshPreview();
      });
      this.bindInputCell(row, task.startDate, "YYYY-MM-DD", async (value) => {
        task.startDate = value;
        await this.refreshPreview();
      });
      this.bindInputCell(row, task.dueDate, "YYYY-MM-DD", async (value) => {
        task.dueDate = value;
        await this.refreshPreview();
      });
      this.bindInputCell(row, task.id, "\u53EF\u9009", async (value) => {
        task.id = value;
        await this.refreshPreview();
      });
      this.bindInputCell(row, task.dependency, "\u4EFB\u52A1 ID", async (value) => {
        task.dependency = value;
        await this.refreshPreview();
      });
      this.bindInputCell(row, task.section, "\u4F8B\u5982\uFF1A\u8BBE\u8BA1\u9636\u6BB5", async (value) => {
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
      const actionCell = row.insertCell();
      const removeButton = actionCell.createEl("button", { text: "\u5220\u9664", cls: "mod-warning" });
      removeButton.onclick = async () => {
        this.tasks = this.tasks.filter((item) => item.internalId !== task.internalId);
        this.renderTaskTable();
        await this.refreshPreview();
      };
    });
  }
  bindInputCell(row, value, placeholder, onChange) {
    const cell = row.insertCell();
    const input = cell.createEl("input", { type: "text", value, placeholder });
    input.onchange = async () => onChange(input.value.trim());
  }
  async reloadFromNote() {
    const content = await this.app.vault.read(this.file);
    this.tasks = parseTasksFromNote(content);
    if (!this.tasks.length) {
      this.tasks.push(createEmptyTask());
    }
  }
  async saveGanttBlockToNote() {
    const rawContent = await this.app.vault.read(this.file);
    const mermaidCode = generateMermaidCode(this.tasks, this.config);
    const nextContent = upsertGanttBlock(rawContent, mermaidCode);
    await this.app.vault.modify(this.file, nextContent);
    new import_obsidian.Notice("\u7518\u7279\u56FE\u4EE3\u7801\u5757\u5DF2\u5199\u5165\u5F53\u524D\u7B14\u8BB0");
  }
  async refreshPreview() {
    const mermaidCode = generateMermaidCode(this.tasks, this.config);
    this.codeContainer.value = toMermaidBlock(mermaidCode);
    const token = ++this.previewGeneration;
    this.previewContainer.empty();
    const markdown = `${toMermaidBlock(mermaidCode)}
`;
    await import_obsidian.MarkdownRenderer.render(this.app, markdown, this.previewContainer, this.file.path, this.previewComponent);
    if (token !== this.previewGeneration) {
      return;
    }
  }
};
var ObsidianGanttBuilderPlugin = class extends import_obsidian.Plugin {
  constructor() {
    super(...arguments);
    this.settings = DEFAULT_SETTINGS;
  }
  async onload() {
    await this.loadSettings();
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
    const modal = new GanttBuilderModal(this.app, this, file, {
      excludeWeekends: this.settings.excludeWeekends
    });
    modal.open();
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
    new import_obsidian.Setting(containerEl).setName("\u9ED8\u8BA4\u6392\u9664\u5468\u672B").setDesc("\u65B0\u5F00\u6784\u5EFA\u5668\u7A97\u53E3\u65F6\u9ED8\u8BA4\u542F\u7528\u8BE5\u9009\u9879").addToggle(
      (toggle) => toggle.setValue(this.plugin.settings.excludeWeekends).onChange(async (value) => {
        this.plugin.settings.excludeWeekends = value;
        await this.plugin.saveSettings();
      })
    );
  }
};
