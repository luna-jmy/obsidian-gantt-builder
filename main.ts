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
import { t } from "./i18n";

const VIEW_TYPE_GANTT_BUILDER = "gantt-builder-view";
type OpenMode = "modal" | "new-tab" | "sidebar";

interface GanttBuilderSettings {
  excludeWeekends: boolean;
  openMode: OpenMode;
  insertMode: InsertMode;
}

interface GanttViewState extends Record<string, unknown> {
  filePath: string;
}

interface DependencyOption {
  value: string;
  label: string;
}

const DEFAULT_SETTINGS: GanttBuilderSettings = {
  excludeWeekends: true,
  openMode: "modal",
  insertMode: "bottom",
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

class TaskDetailsModal extends Modal {
  private readonly task: Task;
  private readonly dependencyOptions: DependencyOption[];
  private readonly onTaskChange: () => Promise<void>;

  constructor(app: App, task: Task, dependencyOptions: DependencyOption[], onTaskChange: () => Promise<void>) {
    super(app);
    this.task = task;
    this.dependencyOptions = dependencyOptions;
    this.onTaskChange = onTaskChange;
    this.modalEl.addClass("gantt-builder-details-modal");
  }

  onOpen(): void {
    this.titleEl.setText(this.task.name || t("unnamedTask"));
    this.contentEl.empty();

    const cardEl = this.contentEl.createDiv("gantt-builder-details-card");

    const statusEl = cardEl.createDiv("gantt-builder-details-status");
    this.createFlagToggle(statusEl, t("done"), this.task.completed, async (value) => {
      this.task.completed = value;
      await this.onTaskChange();
    });
    this.createFlagToggle(statusEl, t("milestone"), this.task.isMilestone, async (value) => {
      this.task.isMilestone = value;
      await this.onTaskChange();
    });
    this.createFlagToggle(statusEl, t("critical"), this.task.isHighPriority, async (value) => {
      this.task.isHighPriority = value;
      await this.onTaskChange();
    });

    const dateGridEl = cardEl.createDiv("gantt-builder-details-grid");
    const startInput = this.createDateField(dateGridEl, t("from"), this.task.startDate);
    const dueInput = this.createDateField(dateGridEl, t("to"), this.task.dueDate);
    const conflictEl = cardEl.createDiv("gantt-builder-date-conflict");

    const updateConflict = () => {
      const hasConflict = Boolean(this.task.startDate && this.task.dueDate && new Date(this.task.startDate) > new Date(this.task.dueDate));
      conflictEl.setText(hasConflict ? t("dateConflict") : "");
    };
    updateConflict();

    startInput.onchange = async () => {
      this.task.startDate = startInput.value.trim();
      updateConflict();
      await this.onTaskChange();
    };
    dueInput.onchange = async () => {
      this.task.dueDate = dueInput.value.trim();
      updateConflict();
      await this.onTaskChange();
    };

    const idRowEl = cardEl.createDiv("gantt-builder-details-id-row");
    const idWrapEl = idRowEl.createDiv("gantt-builder-details-field");
    idWrapEl.createEl("label", { text: "ID" });
    const idInput = idWrapEl.createEl("input", { type: "text", value: this.task.id, placeholder: t("optional") });
    idInput.onchange = async () => {
      this.task.id = idInput.value.trim();
      await this.onTaskChange();
    };
    const randomButton = idRowEl.createEl("button", {
      text: "🎲",
      attr: { title: t("randomIdTitle"), "aria-label": t("randomIdTitle") },
    });
    randomButton.onclick = async () => {
      this.task.id = `task-${Math.random().toString(36).slice(2, 8)}`;
      idInput.value = this.task.id;
      await this.onTaskChange();
    };

    const dependencyFieldEl = cardEl.createDiv("gantt-builder-details-field");
    dependencyFieldEl.createEl("label", { text: t("dependency") });
    const dependencySelect = dependencyFieldEl.createEl("select");
    dependencySelect.createEl("option", { value: "", text: t("noDependency") });
    for (const option of this.dependencyOptions) {
      dependencySelect.createEl("option", { value: option.value, text: option.label });
    }
    dependencySelect.value = this.task.dependency || "";
    dependencySelect.onchange = async () => {
      this.task.dependency = dependencySelect.value;
      await this.onTaskChange();
    };
  }

  private createFlagToggle(parentEl: HTMLElement, labelText: string, checked: boolean, onChange: (value: boolean) => Promise<void>): void {
    const labelEl = parentEl.createEl("label");
    const inputEl = labelEl.createEl("input", { attr: { type: "checkbox" } });
    inputEl.checked = checked;
    inputEl.onchange = async () => {
      await onChange(inputEl.checked);
    };
    labelEl.appendText(labelText);
  }

  private createDateField(parentEl: HTMLElement, labelText: string, value: string): HTMLInputElement {
    const fieldEl = parentEl.createDiv("gantt-builder-details-field");
    fieldEl.createEl("label", { text: labelText });
    return fieldEl.createEl("input", { type: "date", value });
  }
}

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
    settings: Pick<GanttBuilderSettings, "excludeWeekends" | "insertMode">,
    onSettingsChange: (
      update: Partial<Pick<GanttBuilderSettings, "excludeWeekends" | "insertMode">>,
    ) => Promise<void>,
  ) {
    this.app = app;
    this.file = file;
    this.rootEl = rootEl;
    this.config = { excludeWeekends: settings.excludeWeekends };
    this.insertMode = settings.insertMode;
    this.onSettingsChange = onSettingsChange;
    this.previewComponent = new Component();
    this.previewComponent.load();

    const toolbarEl = this.rootEl.createDiv("gantt-builder-toolbar");
    const topButtonsEl = toolbarEl.createDiv("gantt-builder-button-row");

    const reloadButton = topButtonsEl.createEl("button", { text: t("reloadFromNote") });
    reloadButton.onclick = async () => {
      await this.reloadTasks();
      this.renderTaskTable();
      await this.refreshPreview();
      new Notice(t("reloadSuccess"));
    };

    const copyButton = topButtonsEl.createEl("button", { text: t("copyToClipboard") });
    copyButton.onclick = async () => {
      const code = generateMermaidCode(this.tasks, this.config, this.getEffectiveChartTitle());
      await navigator.clipboard.writeText(toMermaidBlock(code));
      new Notice(t("mermaidCopied"));
    };

    const exportSvgButton = topButtonsEl.createEl("button", { text: t("exportSvg") });
    exportSvgButton.onclick = async () => {
      await this.exportSvg();
    };

    const exportPngButton = topButtonsEl.createEl("button", { text: t("exportPng") });
    exportPngButton.onclick = async () => {
      await this.exportPng();
    };

    const saveTasksButton = topButtonsEl.createEl("button", { text: t("saveTasks") });
    saveTasksButton.onclick = async () => {
      await this.saveTasksToNote();
    };

    const saveGanttButton = topButtonsEl.createEl("button", { text: t("saveGantt"), cls: "mod-cta" });
    saveGanttButton.onclick = async () => {
      await this.saveGanttToNote();
    };

    this.rootEl.createDiv("gantt-builder-note-title").setText(t("currentNote", { name: this.file.basename }));

    const taskHeaderEl = this.rootEl.createDiv("gantt-builder-task-header");
    taskHeaderEl.createEl("h3", { text: t("taskListTitle") });
    const addTaskButton = taskHeaderEl.createEl("button", { text: t("addTask"), cls: "mod-cta" });
    addTaskButton.onclick = async () => {
      this.tasks.push(createEmptyTask());
      this.renderTaskTable();
      await this.refreshPreview();
    };

    this.tableWrapEl = this.rootEl.createDiv("gantt-builder-table-wrap");

    const viewerWrapEl = this.rootEl.createDiv("gantt-builder-viewer");
    const tabsEl = viewerWrapEl.createDiv("gantt-builder-tabs");
    const previewTabButton = tabsEl.createEl("button", { text: t("preview"), cls: "is-active" });
    const codeTabButton = tabsEl.createEl("button", { text: t("mermaidCode") });
    previewTabButton.onclick = () => this.switchTab("preview", previewTabButton, codeTabButton);
    codeTabButton.onclick = () => this.switchTab("code", previewTabButton, codeTabButton);

    const previewOptionsEl = tabsEl.createDiv("gantt-builder-preview-options");
    const titleWrapEl = previewOptionsEl.createDiv("gantt-builder-title-wrap");
    titleWrapEl.createEl("label", { text: t("chartTitleLabel"), attr: { title: t("chartTitleHint") } });
    this.titleInputEl = titleWrapEl.createEl("input", {
      type: "text",
      placeholder: t("optional"),
      value: this.chartTitle,
      attr: { title: t("chartTitleHint") },
    });
    this.titleInputEl.onchange = async () => {
      this.chartTitle = this.titleInputEl.value.trim();
      this.titleInputEl.value = this.chartTitle;
      await this.refreshPreview();
    };

    const excludeWeekendsLabel = previewOptionsEl.createEl("label", { attr: { title: t("excludeWeekendsDesc") } });
    const excludeWeekendsToggle = excludeWeekendsLabel.createEl("input", { attr: { type: "checkbox" } });
    excludeWeekendsToggle.checked = this.config.excludeWeekends;
    excludeWeekendsToggle.onchange = async () => {
      this.config.excludeWeekends = excludeWeekendsToggle.checked;
      await this.onSettingsChange({ excludeWeekends: this.config.excludeWeekends });
      await this.refreshPreview();
    };
    excludeWeekendsLabel.appendText(t("excludeWeekends"));

    this.previewPaneEl = viewerWrapEl.createDiv("gantt-builder-preview");
    this.codePaneEl = viewerWrapEl.createDiv("gantt-builder-code-pane");
    this.codePaneEl.addClass("is-hidden");
    this.codeTextEl = this.codePaneEl.createEl("textarea", {
      cls: "gantt-builder-code",
      attr: { readonly: "true" },
    });
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
    this.titleInputEl.disabled = false;
  }

  private getEffectiveChartTitle(): string {
    return this.chartTitle;
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
      .map((task) => ({ value: task.id.trim(), label: `${task.id.trim()} · ${task.name || t("unnamedTask")}` }));

    if (currentTask.dependency && !options.some((item) => item.value === currentTask.dependency)) {
      options.unshift({ value: currentTask.dependency, label: `${currentTask.dependency} · ${t("currentDependency")}` });
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
    [t("headerAction"), t("headerGroup"), t("headerTask")].forEach((title) => headerRow.createEl("th", { text: title }));

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
      row.addEventListener("drop", () => {
        row.classList.remove("gantt-builder-row-drop");
        if (!this.draggingTaskId) {
          return;
        }
        this.moveTask(this.draggingTaskId, task.internalId);
        this.draggingTaskId = null;
        this.renderTaskTable();
        void this.refreshPreview();
      });

      const actionCell = row.insertCell();
      const actionStack = actionCell.createDiv("gantt-builder-action-stack");
      const addButton = actionStack.createEl("button", { text: "+", attr: { title: t("addInCurrentGroup") } });
      const editButton = actionStack.createEl("button", { text: "✎", attr: { title: t("editTaskDetails"), "aria-label": t("editTaskDetails") } });
      const removeButton = actionStack.createEl("button", { text: "-", cls: "mod-warning", attr: { title: t("deleteTask") } });
      addButton.onclick = async () => {
        const index = this.tasks.findIndex((item) => item.internalId === task.internalId);
        this.tasks.splice(index + 1, 0, createEmptyTask(task.section));
        this.renderTaskTable();
        await this.refreshPreview();
      };
      editButton.onclick = () => this.openTaskDetailsModal(task);
      removeButton.onclick = async () => {
        this.tasks = this.tasks.filter((item) => item.internalId !== task.internalId);
        if (!this.tasks.length) {
          this.tasks.push(createEmptyTask());
        }
        this.renderTaskTable();
        await this.refreshPreview();
      };

      const sectionCell = row.insertCell();
      const sectionInput = sectionCell.createEl("input", {
        type: "text",
        cls: "gantt-builder-group-input",
        placeholder: t("groupPlaceholder"),
      });
      sectionInput.value = task.section;
      sectionInput.onchange = async () => {
        task.section = sectionInput.value.trim();
        await this.refreshPreview();
      };

      const taskCell = row.insertCell();
      const taskMainCell = taskCell.createDiv("gantt-builder-task-main-cell");
      const taskInput = taskMainCell.createEl("textarea", {
        cls: "gantt-builder-task-input",
        attr: { rows: "1", placeholder: t("taskNamePlaceholder") },
      });
      taskInput.value = task.name;
      taskInput.onchange = async () => {
        task.name = taskInput.value.trim();
        await this.refreshPreview();
      };
      if (this.hasDateConflict(task)) {
        row.classList.add("gantt-builder-row-conflict");
      }
    }
  }

  private openTaskDetailsModal(task: Task): void {
    new TaskDetailsModal(this.app, task, this.getDependencyOptions(task), async () => {
      this.renderTaskTable();
      await this.refreshPreview();
    }).open();
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
      new Notice(t("noExportableChart"));
      return;
    }
    const cloned = svgElement.cloneNode(true) as SVGSVGElement;
    cloned.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    const content = `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(cloned)}`;
    const bytes = new TextEncoder().encode(content);
    const savedPath = await this.saveBinaryToVault(`${this.file.basename}-gantt-${Date.now()}.svg`, bytes);
    new Notice(t("svgExported", { path: savedPath }));
  }

  private async exportPng(): Promise<void> {
    const svgElement = this.getRenderedSvgElement();
    if (!svgElement) {
      new Notice(t("noExportableChart"));
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
        img.onerror = () => reject(new Error(t("failedLoadSvgForPng")));
        img.src = url;
      });

      const canvas = document.createElement("canvas");
      canvas.width = width * 2;
      canvas.height = height * 2;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        throw new Error(t("createCanvasError"));
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
      new Notice(t("pngExported", { path: savedPath }));
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
    const content = await this.app.vault.read(this.file);
    const cursorOffset = this.getCursorOffsetForCurrentFile();
    const mode = this.insertMode === "cursor" && cursorOffset === undefined ? "bottom" : this.insertMode;
    if (this.insertMode === "cursor" && cursorOffset === undefined) {
      new Notice(t("cursorFallback"));
    }
    const next = upsertTaskScope(content, this.tasks, {
      mode,
      cursorOffset,
    });
    await this.app.vault.modify(this.file, next);
    new Notice(t("tasksWritten"));
  }

  private async saveGanttToNote(): Promise<void> {
    const content = await this.app.vault.read(this.file);
    const effectiveTitle = this.getEffectiveChartTitle();
    const mermaidCode = generateMermaidCode(this.tasks, this.config, effectiveTitle);
    const cursorOffset = this.getCursorOffsetForCurrentFile();
    const mode = this.insertMode === "cursor" && cursorOffset === undefined ? "bottom" : this.insertMode;
    if (this.insertMode === "cursor" && cursorOffset === undefined) {
      new Notice(t("cursorFallback"));
    }
    const next = upsertGanttArtifacts(content, mermaidCode, this.tasks, effectiveTitle, {
      mode,
      cursorOffset,
      useCustomTitle: true,
    });
    await this.app.vault.modify(this.file, next);
    new Notice(t("ganttWritten"));
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
    this.titleEl.setText(`${t("builderTabTitle")} · ${this.file.basename}`);
    this.editor = new GanttBuilderEditor(
      this.app,
      this.file,
      this.contentEl,
      {
        excludeWeekends: this.plugin.settings.excludeWeekends,
        insertMode: this.plugin.settings.insertMode,
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
  private renderVersion = 0;

  constructor(leaf: WorkspaceLeaf, plugin: ObsidianGanttBuilderPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return VIEW_TYPE_GANTT_BUILDER;
  }

  getDisplayText(): string {
    return this.file ? `${t("builderTabTitle")} · ${this.file.basename}` : t("builderTabTitle");
  }

  getIcon(): string {
    return "calendar-clock";
  }

  async setState(state: GanttViewState): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(state.filePath);
    if (!(file instanceof TFile)) {
      new Notice(t("noteNotFound"));
      return;
    }
    await this.setFile(file);
  }

  getState(): GanttViewState {
    return { filePath: this.file?.path ?? "" };
  }

  async onOpen(): Promise<void> {
    this.registerEvent(
      this.app.workspace.on("file-open", (file) => {
        if (file instanceof TFile) {
          void this.setFile(file);
        }
      }),
    );

    const activeFile = this.app.workspace.getActiveFile();
    if (activeFile instanceof TFile) {
      await this.setFile(activeFile);
      return;
    }
    await this.renderEditor();
  }

  onClose(): Promise<void> {
    this.renderVersion += 1;
    this.editor?.destroy();
    this.editor = null;
    return Promise.resolve();
  }

  private async setFile(file: TFile): Promise<void> {
    if (this.file?.path === file.path) {
      return;
    }
    this.file = file;
    await this.renderEditor();
  }

  private async renderEditor(): Promise<void> {
    const renderVersion = ++this.renderVersion;
    const container = this.containerEl.children[1] as HTMLElement | undefined;
    if (!container) {
      return;
    }
    container.empty();
    if (!this.file) {
      container.createEl("div", { text: t("openHintNoFile") });
      return;
    }

    this.editor?.destroy();
    const editor = new GanttBuilderEditor(
      this.app,
      this.file,
      container,
      {
        excludeWeekends: this.plugin.settings.excludeWeekends,
        insertMode: this.plugin.settings.insertMode,
      },
      async (update) => {
        Object.assign(this.plugin.settings, update);
        await this.plugin.saveSettings();
      },
    );
    this.editor = editor;
    await editor.initialize();
    if (renderVersion !== this.renderVersion) {
      if (this.editor === editor) {
        this.editor = null;
      }
      editor.destroy();
      return;
    }
    this.leaf.setEphemeralState({ title: `${t("builderTabTitle")} · ${this.file.basename}` });
  }
}

export default class ObsidianGanttBuilderPlugin extends Plugin {
  settings: GanttBuilderSettings = DEFAULT_SETTINGS;

  async onload(): Promise<void> {
    await this.loadSettings();
    this.registerView(VIEW_TYPE_GANTT_BUILDER, (leaf) => new GanttBuilderWorkspaceView(leaf, this));

    this.addRibbonIcon("calendar-clock", t("ribbonTitle"), () => void this.openBuilderForActiveNote());

    this.addCommand({
      id: "open-note-gantt-builder",
      name: t("commandName"),
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

  async loadSettings(): Promise<void> {
    const legacyData = (await this.loadData()) as Omit<Partial<GanttBuilderSettings>, "insertMode"> & { insertMode?: string };
    const loaded = Object.assign({}, DEFAULT_SETTINGS, legacyData) as GanttBuilderSettings;
    if (legacyData.insertMode === "heading") {
      loaded.insertMode = DEFAULT_SETTINGS.insertMode;
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
      new Notice(t("openMarkdownFirst"));
      return;
    }

    if (this.settings.openMode === "modal") {
      new GanttBuilderModal(this.app, this, file).open();
      return;
    }

    const leaf = this.settings.openMode === "sidebar" ? this.app.workspace.getRightLeaf(false) : this.app.workspace.getLeaf("tab");
    if (!leaf) {
      new Notice(t("createViewFailed"));
      return;
    }

    await leaf.setViewState({
      type: VIEW_TYPE_GANTT_BUILDER,
      active: true,
      state: { filePath: file.path } satisfies GanttViewState,
    });
    await this.app.workspace.revealLeaf(leaf);
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
      .setName(t("settingDefaultExcludeWeekends"))
      .setDesc(t("settingDefaultExcludeWeekendsDesc"))
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.excludeWeekends).onChange(async (value) => {
          this.plugin.settings.excludeWeekends = value;
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName(t("settingOpenMode"))
      .setDesc(t("settingOpenModeDesc"))
      .addDropdown((dropdown) =>
        dropdown
          .addOption("new-tab", t("newTab"))
          .addOption("sidebar", t("sidebar"))
          .addOption("modal", t("modal"))
          .setValue(this.plugin.settings.openMode)
          .onChange(async (value) => {
            this.plugin.settings.openMode = value as OpenMode;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName(t("settingDefaultInsertMode"))
      .setDesc(t("settingDefaultInsertModeDesc"))
      .addDropdown((dropdown) =>
        dropdown
          .addOption("cursor", t("optionCursor"))
          .addOption("bottom", t("optionBottom"))
          .setValue(this.plugin.settings.insertMode)
          .onChange(async (value) => {
            this.plugin.settings.insertMode = value as InsertMode;
            await this.plugin.saveSettings();
          }),
      );
  }
}
