import {
  App,
  Component,
  ItemView,
  MarkdownRenderer,
  MarkdownView,
  Modal,
  Notice,
  Plugin,
  PluginSettingTab,
  Setting,
  TFile,
  WorkspaceLeaf,
} from "obsidian";
import { GanttConfig, Task } from "./types";
import {
  DEFAULT_CHART_TITLE,
  generateMermaidCode,
  InsertMode,
  loadPersistedGanttData,
  parseTasksFromNote,
  toMermaidBlock,
  upsertGanttArtifacts,
  upsertTaskScope,
} from "./utils/ganttHelper";

const VIEW_TYPE_GANTT_BUILDER = "gantt-builder-view";
type OpenMode = "modal" | "new-tab" | "sidebar";

interface GanttBuilderSettings {
  excludeWeekends: boolean;
  openMode: OpenMode;
  insertMode: InsertMode;
  ganttTargetHeading: string;
  taskTargetHeading: string;
}

interface GanttViewState extends Record<string, unknown> {
  filePath: string;
}

const DEFAULT_SETTINGS: GanttBuilderSettings = {
  excludeWeekends: true,
  openMode: "modal",
  insertMode: "bottom",
  ganttTargetHeading: "## 项目分解",
  taskTargetHeading: "## 项目分解",
};

const createEmptyTask = (section = ""): Task => ({
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
  isHighPriority: false,
});

class GanttBuilderEditor {
  private readonly app: App;
  private readonly file: TFile;
  private readonly rootEl: HTMLElement;
  private readonly previewComponent: Component;
  private readonly onSettingsChange: (
    update: Partial<Pick<GanttBuilderSettings, "excludeWeekends" | "insertMode">>,
  ) => Promise<void>;

  private config: GanttConfig;
  private tasks: Task[] = [];
  private chartTitle = DEFAULT_CHART_TITLE;
  private insertMode: InsertMode;
  private readonly ganttTargetHeading: string;
  private readonly taskTargetHeading: string;
  private draggingTaskId: string | null = null;

  private readonly tableWrapEl: HTMLDivElement;
  private readonly previewPaneEl: HTMLDivElement;
  private readonly codePaneEl: HTMLDivElement;
  private readonly codeTextEl: HTMLTextAreaElement;
  private readonly titleInputEl: HTMLInputElement;

  constructor(
    app: App,
    file: TFile,
    rootEl: HTMLElement,
    settings: Pick<GanttBuilderSettings, "excludeWeekends" | "insertMode" | "ganttTargetHeading" | "taskTargetHeading">,
    onSettingsChange: (
      update: Partial<Pick<GanttBuilderSettings, "excludeWeekends" | "insertMode">>,
    ) => Promise<void>,
  ) {
    this.app = app;
    this.file = file;
    this.rootEl = rootEl;
    this.config = { excludeWeekends: settings.excludeWeekends };
    this.insertMode = settings.insertMode;
    this.ganttTargetHeading = settings.ganttTargetHeading;
    this.taskTargetHeading = settings.taskTargetHeading;
    this.onSettingsChange = onSettingsChange;
    this.previewComponent = new Component();
    this.previewComponent.load();

    const toolbarEl = this.rootEl.createDiv("gantt-builder-toolbar");

    const titleWrapEl = toolbarEl.createDiv("gantt-builder-title-wrap");
    titleWrapEl.createEl("label", { text: "甘特图标题" });
    this.titleInputEl = titleWrapEl.createEl("input", {
      type: "text",
      placeholder: DEFAULT_CHART_TITLE,
      value: this.chartTitle,
    });
    this.titleInputEl.onchange = async () => {
      this.chartTitle = this.titleInputEl.value.trim() || DEFAULT_CHART_TITLE;
      this.titleInputEl.value = this.chartTitle;
      await this.refreshPreview();
    };
    titleWrapEl.createEl("small", { text: "当写入位置为“特定标题下方”时，标题固定为默认值。" });

    const topButtonsEl = toolbarEl.createDiv("gantt-builder-button-row");

    const reloadButton = topButtonsEl.createEl("button", { text: "从笔记重载" });
    reloadButton.onclick = async () => {
      await this.reloadTasks();
      this.renderTaskTable();
      await this.refreshPreview();
      new Notice("已从当前笔记重载任务");
    };

    const copyButton = topButtonsEl.createEl("button", { text: "复制到剪贴板" });
    copyButton.onclick = async () => {
      const code = generateMermaidCode(this.tasks, this.config, this.getEffectiveChartTitle());
      await navigator.clipboard.writeText(toMermaidBlock(code));
      new Notice("Mermaid 代码已复制到剪贴板");
    };

    const exportSvgButton = topButtonsEl.createEl("button", { text: "导出 SVG" });
    exportSvgButton.onclick = async () => {
      await this.exportSvg();
    };

    const exportPngButton = topButtonsEl.createEl("button", { text: "导出 PNG" });
    exportPngButton.onclick = async () => {
      await this.exportPng();
    };

    const saveTasksButton = topButtonsEl.createEl("button", { text: "写入/更新任务" });
    saveTasksButton.onclick = async () => {
      await this.saveTasksToNote();
    };

    const saveGanttButton = topButtonsEl.createEl("button", { text: "写入/更新甘特图", cls: "mod-cta" });
    saveGanttButton.onclick = async () => {
      await this.saveGanttToNote();
    };

    this.rootEl.createDiv("gantt-builder-note-title").setText(`当前笔记：${this.file.basename}`);

    const taskHeaderEl = this.rootEl.createDiv("gantt-builder-task-header");
    taskHeaderEl.createEl("h3", { text: "任务列表（支持拖拽排序）" });
    const addTaskButton = taskHeaderEl.createEl("button", { text: "新增任务", cls: "mod-cta" });
    addTaskButton.onclick = async () => {
      this.tasks.push(createEmptyTask());
      this.renderTaskTable();
      await this.refreshPreview();
    };

    this.tableWrapEl = this.rootEl.createDiv("gantt-builder-table-wrap");

    const viewerWrapEl = this.rootEl.createDiv("gantt-builder-viewer");
    const tabsEl = viewerWrapEl.createDiv("gantt-builder-tabs");
    const previewTabButton = tabsEl.createEl("button", { text: "预览", cls: "is-active" });
    const codeTabButton = tabsEl.createEl("button", { text: "Mermaid 代码" });
    previewTabButton.onclick = () => this.switchTab("preview", previewTabButton, codeTabButton);
    codeTabButton.onclick = () => this.switchTab("code", previewTabButton, codeTabButton);

    this.previewPaneEl = viewerWrapEl.createDiv("gantt-builder-preview");
    this.codePaneEl = viewerWrapEl.createDiv("gantt-builder-code-pane");
    this.codePaneEl.addClass("is-hidden");
    this.codeTextEl = this.codePaneEl.createEl("textarea", {
      cls: "gantt-builder-code",
      attr: { readonly: "true" },
    });

    const bottomSettingsEl = this.rootEl.createDiv("gantt-builder-toolbar gantt-builder-bottom-settings");
    new Setting(bottomSettingsEl)
      .setName("排除周末")
      .setDesc("启用后按工作日计算时长")
      .addToggle((toggle) =>
        toggle.setValue(this.config.excludeWeekends).onChange(async (value) => {
          this.config.excludeWeekends = value;
          await this.onSettingsChange({ excludeWeekends: value });
          await this.refreshPreview();
        }),
      );

    new Setting(bottomSettingsEl)
      .setName("写入位置")
      .setDesc("同时作用于甘特图和任务写入")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("cursor", "光标所在位置")
          .addOption("bottom", "底部")
          .addOption("heading", "特定标题下方")
          .setValue(this.insertMode)
          .onChange(async (value) => {
            this.insertMode = value as InsertMode;
            await this.onSettingsChange({ insertMode: this.insertMode });
            this.updateTitleInputAvailability();
            await this.refreshPreview();
          }),
      );

    this.updateTitleInputAvailability();
  }

  async initialize(): Promise<void> {
    await this.reloadTasks();
    this.renderTaskTable();
    await this.refreshPreview();
  }

  destroy(): void {
    this.previewComponent.unload();
  }

  private switchTab(tab: "preview" | "code", previewButton: HTMLButtonElement, codeButton: HTMLButtonElement): void {
    const previewActive = tab === "preview";
    previewButton.toggleClass("is-active", previewActive);
    codeButton.toggleClass("is-active", !previewActive);
    this.previewPaneEl.toggleClass("is-hidden", !previewActive);
    this.codePaneEl.toggleClass("is-hidden", previewActive);
  }

  private updateTitleInputAvailability(): void {
    this.titleInputEl.disabled = this.insertMode === "heading";
  }

  private isValidHeadingPattern(heading: string): boolean {
    return /^(#{1,6})\s+\S.+$/.test(heading.trim());
  }

  private getEffectiveChartTitle(): string {
    return this.insertMode === "heading" ? DEFAULT_CHART_TITLE : this.chartTitle;
  }

  private hasDateConflict(task: Task): boolean {
    if (!task.startDate || !task.dueDate) {
      return false;
    }
    return new Date(task.startDate) > new Date(task.dueDate);
  }

  private async reloadTasks(): Promise<void> {
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

  private generateRandomTaskId(): string {
    return `task-${Math.random().toString(36).slice(2, 8)}`;
  }

  private getDependencyOptions(currentTask: Task): Array<{ value: string; label: string }> {
    const options = this.tasks
      .filter((task) => task.internalId !== currentTask.internalId && task.id.trim())
      .map((task) => ({ value: task.id.trim(), label: `${task.id.trim()} · ${task.name || "未命名任务"}` }));

    if (currentTask.dependency && !options.some((item) => item.value === currentTask.dependency)) {
      options.unshift({ value: currentTask.dependency, label: `${currentTask.dependency} · (当前依赖)` });
    }

    return options;
  }

  private moveTask(sourceId: string, targetId: string): void {
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

  private renderTaskTable(): void {
    this.tableWrapEl.empty();
    const table = this.tableWrapEl.createEl("table", { cls: "gantt-builder-table" });
    const head = table.createTHead();
    const headerRow = head.insertRow();
    ["操作", "分组", "任务", "日期", "ID/依赖"].forEach((title) => headerRow.createEl("th", { text: title }));

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
      const addButton = actionStack.createEl("button", { text: "+", attr: { title: "在当前分组新增任务" } });
      const removeButton = actionStack.createEl("button", { text: "-", cls: "mod-warning", attr: { title: "删除任务" } });
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
        attr: { rows: "2", placeholder: "分组，如：执行阶段" },
      });
      sectionInput.value = task.section;
      sectionInput.onchange = async () => {
        task.section = sectionInput.value.trim();
        await this.refreshPreview();
      };

      const taskCell = row.insertCell();
      const taskMainCell = taskCell.createDiv("gantt-builder-task-main-cell");
      const taskInput = taskMainCell.createEl("input", { type: "text", value: task.name, placeholder: "任务名称" });
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
      doneLabel.appendText("完成");

      const milestoneLabel = statusRow.createEl("label");
      const milestoneToggle = milestoneLabel.createEl("input", { attr: { type: "checkbox" } });
      milestoneToggle.checked = task.isMilestone;
      milestoneToggle.onchange = async () => {
        task.isMilestone = milestoneToggle.checked;
        await this.refreshPreview();
      };
      milestoneLabel.appendText("里程碑");

      const criticalLabel = statusRow.createEl("label");
      const criticalToggle = criticalLabel.createEl("input", { attr: { type: "checkbox" } });
      criticalToggle.checked = task.isHighPriority;
      criticalToggle.onchange = async () => {
        task.isHighPriority = criticalToggle.checked;
        await this.refreshPreview();
      };
      criticalLabel.appendText("关键");

      const dateCell = row.insertCell();
      const dateStack = dateCell.createDiv("gantt-builder-date-stack");
      const startRow = dateStack.createDiv("gantt-builder-inline-field");
      startRow.createEl("span", { cls: "gantt-builder-inline-label", text: "从" });
      const startInput = startRow.createEl("input", { type: "date", value: task.startDate });
      startInput.onchange = async () => {
        task.startDate = startInput.value.trim();
        this.renderTaskTable();
        await this.refreshPreview();
      };
      const dueRow = dateStack.createDiv("gantt-builder-inline-field");
      dueRow.createEl("span", { cls: "gantt-builder-inline-label", text: "至" });
      const dueInput = dueRow.createEl("input", { type: "date", value: task.dueDate });
      dueInput.onchange = async () => {
        task.dueDate = dueInput.value.trim();
        this.renderTaskTable();
        await this.refreshPreview();
      };
      if (this.hasDateConflict(task)) {
        row.classList.add("gantt-builder-row-conflict");
        dateStack.createDiv("gantt-builder-date-conflict").setText("日期冲突");
      }

      const relationCell = row.insertCell();
      const relationStack = relationCell.createDiv("gantt-builder-relation-stack");
      const idWrap = relationStack.createDiv("gantt-builder-id-cell gantt-builder-inline-field");
      idWrap.createEl("span", { cls: "gantt-builder-inline-label", text: "ID" });
      const idInput = idWrap.createEl("input", { type: "text", value: task.id, placeholder: "可选" });
      idInput.onchange = async () => {
        task.id = idInput.value.trim();
        this.renderTaskTable();
        await this.refreshPreview();
      };
      const randomButton = idWrap.createEl("button", {
        text: "🎲",
        attr: { title: "自动生成随机 ID", "aria-label": "自动生成随机 ID" },
      });
      randomButton.onclick = async () => {
        task.id = this.generateRandomTaskId();
        this.renderTaskTable();
        await this.refreshPreview();
      };

      const depWrap = relationStack.createDiv("gantt-builder-inline-field");
      depWrap.createEl("span", { cls: "gantt-builder-inline-label", text: "依赖" });
      const dependencySelect = depWrap.createEl("select");
      dependencySelect.addClass("gantt-builder-dependency-select");
      dependencySelect.createEl("option", { value: "", text: "无依赖" });
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

  private getCursorOffsetForCurrentFile(): number | undefined {
    const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!markdownView?.file || markdownView.file.path !== this.file.path) {
      return undefined;
    }
    const editor = markdownView.editor as {
      getCursor: () => { line: number; ch: number };
      getValue: () => string;
      posToOffset?: (pos: { line: number; ch: number }) => number;
    };
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

  private getRenderedSvgElement(): SVGSVGElement | null {
    return this.previewPaneEl.querySelector("svg");
  }

  private async saveBinaryToVault(filename: string, bytes: Uint8Array): Promise<string> {
    const attachmentFolder = ((this.app.vault as unknown as { getConfig?: (key: string) => string }).getConfig?.("attachmentFolderPath")) || "";
    const normalizedFolder = attachmentFolder.trim();
    const path = normalizedFolder ? `${normalizedFolder}/${filename}` : filename;
    await this.app.vault.createBinary(path, bytes);
    return path;
  }

  private async exportSvg(): Promise<void> {
    const svgElement = this.getRenderedSvgElement();
    if (!svgElement) {
      new Notice("未找到可导出的甘特图，请先点击预览。");
      return;
    }
    const cloned = svgElement.cloneNode(true) as SVGSVGElement;
    cloned.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    const content = `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(cloned)}`;
    const bytes = new TextEncoder().encode(content);
    const savedPath = await this.saveBinaryToVault(`${this.file.basename}-gantt-${Date.now()}.svg`, bytes);
    new Notice(`SVG 已导出：${savedPath}`);
  }

  private async exportPng(): Promise<void> {
    const svgElement = this.getRenderedSvgElement();
    if (!svgElement) {
      new Notice("未找到可导出的甘特图，请先点击预览。");
      return;
    }

    const cloned = svgElement.cloneNode(true) as SVGSVGElement;
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
      const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error("无法加载 SVG 导出 PNG"));
        img.src = url;
      });

      const canvas = document.createElement("canvas");
      canvas.width = width * 2;
      canvas.height = height * 2;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        throw new Error("无法创建 Canvas");
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
      new Notice(`PNG 已导出：${savedPath}`);
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  private async refreshPreview(): Promise<void> {
    const mermaidCode = generateMermaidCode(this.tasks, this.config, this.getEffectiveChartTitle());
    this.codeTextEl.value = toMermaidBlock(mermaidCode);
    this.previewPaneEl.empty();
    await MarkdownRenderer.render(this.app, `${toMermaidBlock(mermaidCode)}\n`, this.previewPaneEl, this.file.path, this.previewComponent);
  }

  private async saveTasksToNote(): Promise<void> {
    if (this.insertMode === "heading" && !this.isValidHeadingPattern(this.taskTargetHeading)) {
      new Notice("任务默认目标标题格式无效，请使用例如：## Project Plan");
      return;
    }
    const content = await this.app.vault.read(this.file);
    const cursorOffset = this.getCursorOffsetForCurrentFile();
    const mode = this.insertMode === "cursor" && cursorOffset === undefined ? "bottom" : this.insertMode;
    if (this.insertMode === "cursor" && cursorOffset === undefined) {
      new Notice("未找到光标位置，已回退到底部写入。");
    }
    const next = upsertTaskScope(content, this.tasks, {
      mode,
      headingText: this.taskTargetHeading,
      cursorOffset,
    });
    await this.app.vault.modify(this.file, next);
    new Notice("任务已写入/更新到 data 范围。");
  }

  private async saveGanttToNote(): Promise<void> {
    if (this.insertMode === "heading" && !this.isValidHeadingPattern(this.ganttTargetHeading)) {
      new Notice("甘特图默认目标标题格式无效，请使用例如：## Project Plan");
      return;
    }
    const content = await this.app.vault.read(this.file);
    const effectiveTitle = this.getEffectiveChartTitle();
    const mermaidCode = generateMermaidCode(this.tasks, this.config, effectiveTitle);
    const cursorOffset = this.getCursorOffsetForCurrentFile();
    const mode = this.insertMode === "cursor" && cursorOffset === undefined ? "bottom" : this.insertMode;
    if (this.insertMode === "cursor" && cursorOffset === undefined) {
      new Notice("未找到光标位置，已回退到底部写入。");
    }
    const next = upsertGanttArtifacts(content, mermaidCode, this.tasks, effectiveTitle, {
      mode,
      headingText: this.ganttTargetHeading,
      cursorOffset,
      useCustomTitle: this.insertMode !== "heading",
    });
    await this.app.vault.modify(this.file, next);
    new Notice("甘特图已写入/更新。");
  }
}

class GanttBuilderModal extends Modal {
  private readonly plugin: ObsidianGanttBuilderPlugin;
  private readonly file: TFile;
  private editor: GanttBuilderEditor | null = null;

  constructor(app: App, plugin: ObsidianGanttBuilderPlugin, file: TFile) {
    super(app);
    this.plugin = plugin;
    this.file = file;
    this.modalEl.addClass("gantt-builder-modal");
  }

  async onOpen(): Promise<void> {
    this.contentEl.empty();
    this.titleEl.setText(`Gantt Builder · ${this.file.basename}`);
    this.editor = new GanttBuilderEditor(
      this.app,
      this.file,
      this.contentEl,
      {
        excludeWeekends: this.plugin.settings.excludeWeekends,
        insertMode: this.plugin.settings.insertMode,
        ganttTargetHeading: this.plugin.settings.ganttTargetHeading,
        taskTargetHeading: this.plugin.settings.taskTargetHeading,
      },
      async (update) => {
        Object.assign(this.plugin.settings, update);
        await this.plugin.saveSettings();
      },
    );
    await this.editor.initialize();
  }

  onClose(): void {
    this.editor?.destroy();
    this.editor = null;
    this.contentEl.empty();
  }
}

class GanttBuilderWorkspaceView extends ItemView {
  private readonly plugin: ObsidianGanttBuilderPlugin;
  private file: TFile | null = null;
  private editor: GanttBuilderEditor | null = null;

  constructor(leaf: WorkspaceLeaf, plugin: ObsidianGanttBuilderPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return VIEW_TYPE_GANTT_BUILDER;
  }

  getDisplayText(): string {
    return this.file ? `Gantt Builder · ${this.file.basename}` : "Gantt Builder";
  }

  getIcon(): string {
    return "calendar-clock";
  }

  async setState(state: GanttViewState): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(state.filePath);
    if (!(file instanceof TFile)) {
      new Notice("未找到目标笔记。");
      return;
    }
    this.file = file;
    await this.renderEditor();
  }

  getState(): GanttViewState {
    return { filePath: this.file?.path ?? "" };
  }

  async onOpen(): Promise<void> {
    await this.renderEditor();
  }

  async onClose(): Promise<void> {
    this.editor?.destroy();
    this.editor = null;
  }

  private async renderEditor(): Promise<void> {
    const container = this.containerEl.children[1] as HTMLElement | undefined;
    if (!container) {
      return;
    }
    container.empty();
    if (!this.file) {
      container.createEl("div", { text: "请从命令或功能区在某条笔记中打开 Gantt Builder。" });
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
        taskTargetHeading: this.plugin.settings.taskTargetHeading,
      },
      async (update) => {
        Object.assign(this.plugin.settings, update);
        await this.plugin.saveSettings();
      },
    );
    await this.editor.initialize();
    this.leaf.setEphemeralState({ title: `Gantt Builder · ${this.file.basename}` });
  }
}

export default class ObsidianGanttBuilderPlugin extends Plugin {
  settings: GanttBuilderSettings = DEFAULT_SETTINGS;

  async onload(): Promise<void> {
    await this.loadSettings();
    this.registerView(VIEW_TYPE_GANTT_BUILDER, (leaf) => new GanttBuilderWorkspaceView(leaf, this));

    this.addRibbonIcon("calendar-clock", "打开当前笔记 Gantt Builder", () => void this.openBuilderForActiveNote());

    this.addCommand({
      id: "open-note-gantt-builder",
      name: "打开当前笔记任务甘特构建器",
      checkCallback: (checking) => {
        const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!markdownView?.file) {
          return false;
        }
        if (!checking) {
          void this.openBuilderForActiveNote();
        }
        return true;
      },
    });

    this.addSettingTab(new GanttBuilderSettingTab(this.app, this));
  }

  onunload(): void {
    this.app.workspace.detachLeavesOfType(VIEW_TYPE_GANTT_BUILDER);
  }

  async loadSettings(): Promise<void> {
    const loaded = Object.assign({}, DEFAULT_SETTINGS, await this.loadData()) as GanttBuilderSettings & { targetHeading?: string };
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

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  private async openBuilderForActiveNote(): Promise<void> {
    const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
    const file = markdownView?.file;
    if (!file) {
      new Notice("请先打开一条 Markdown 笔记。");
      return;
    }

    if (this.settings.openMode === "modal") {
      new GanttBuilderModal(this.app, this, file).open();
      return;
    }

    const leaf = this.settings.openMode === "sidebar" ? this.app.workspace.getRightLeaf(false) : this.app.workspace.getLeaf("tab");
    if (!leaf) {
      new Notice("无法创建目标视图，请重试。");
      return;
    }

    await leaf.setViewState({
      type: VIEW_TYPE_GANTT_BUILDER,
      active: true,
      state: { filePath: file.path } satisfies GanttViewState,
    });
    this.app.workspace.revealLeaf(leaf);
  }
}

class GanttBuilderSettingTab extends PluginSettingTab {
  plugin: ObsidianGanttBuilderPlugin;

  constructor(app: App, plugin: ObsidianGanttBuilderPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName("默认排除周末")
      .setDesc("新开构建器时默认启用")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.excludeWeekends).onChange(async (value) => {
          this.plugin.settings.excludeWeekends = value;
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName("打开方式")
      .setDesc("选择打开构建器的默认位置")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("new-tab", "New Tab")
          .addOption("sidebar", "侧边栏")
          .addOption("modal", "弹框")
          .setValue(this.plugin.settings.openMode)
          .onChange(async (value) => {
            this.plugin.settings.openMode = value as OpenMode;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("默认写入位置")
      .setDesc("同时作用于甘特图与任务写入")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("cursor", "光标所在位置")
          .addOption("bottom", "底部")
          .addOption("heading", "特定标题下方")
          .setValue(this.plugin.settings.insertMode)
          .onChange(async (value) => {
            this.plugin.settings.insertMode = value as InsertMode;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("甘特图默认目标标题")
      .setDesc("必须包含标题标识符，例如：## Project Plan")
      .addText((text) =>
        text.setValue(this.plugin.settings.ganttTargetHeading).onChange(async (value) => {
          const next = value.trim();
          if (next && !/^(#{1,6})\s+\S.+$/.test(next)) {
            new Notice("标题格式错误：请使用例如 ## Project Plan");
            return;
          }
          this.plugin.settings.ganttTargetHeading = next;
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName("任务默认目标标题")
      .setDesc("必须包含标题标识符，例如：## Project Plan")
      .addText((text) =>
        text.setValue(this.plugin.settings.taskTargetHeading).onChange(async (value) => {
          const next = value.trim();
          if (next && !/^(#{1,6})\s+\S.+$/.test(next)) {
            new Notice("标题格式错误：请使用例如 ## Project Plan");
            return;
          }
          this.plugin.settings.taskTargetHeading = next;
          await this.plugin.saveSettings();
        }),
      );
  }
}
