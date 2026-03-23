import {
  App,
  Component,
  MarkdownRenderer,
  MarkdownView,
  Modal,
  Notice,
  Plugin,
  PluginSettingTab,
  Setting,
  TFile,
} from "obsidian";
import { GanttConfig, Task } from "./types";
import { generateMermaidCode, parseTasksFromNote, toMermaidBlock, upsertGanttBlock } from "./utils/ganttHelper";

interface GanttBuilderSettings {
  excludeWeekends: boolean;
}

const DEFAULT_SETTINGS: GanttBuilderSettings = {
  excludeWeekends: true,
};

const createEmptyTask = (): Task => ({
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
  isHighPriority: false,
});

class GanttBuilderModal extends Modal {
  private readonly plugin: ObsidianGanttBuilderPlugin;
  private readonly file: TFile;
  private tasks: Task[] = [];
  private config: GanttConfig;
  private readonly previewContainer: HTMLDivElement;
  private readonly codeContainer: HTMLTextAreaElement;
  private readonly tableContainer: HTMLDivElement;
  private readonly previewComponent: Component;
  private previewGeneration = 0;

  constructor(app: App, plugin: ObsidianGanttBuilderPlugin, file: TFile, config: GanttConfig) {
    super(app);
    this.plugin = plugin;
    this.file = file;
    this.config = config;
    this.modalEl.addClass("gantt-builder-modal");

    this.tableContainer = this.contentEl.createDiv("gantt-builder-table-wrap");
    this.previewContainer = this.contentEl.createDiv("gantt-builder-preview");
    this.codeContainer = this.contentEl.createEl("textarea", {
      cls: "gantt-builder-code",
      attr: { readonly: "true" },
    });
    this.previewComponent = new Component();
    this.previewComponent.load();
  }

  async onOpen(): Promise<void> {
    this.titleEl.setText(`Gantt Builder · ${this.file.basename}`);
    await this.reloadFromNote();
    this.renderToolbar();
    this.renderTaskTable();
    await this.refreshPreview();
  }

  onClose(): void {
    this.previewComponent.unload();
  }

  private renderToolbar(): void {
    const toolbar = this.contentEl.createDiv("gantt-builder-toolbar");

    new Setting(toolbar)
      .setName("排除周末")
      .setDesc("启用后以工作日计算持续时间")
      .addToggle((toggle) =>
        toggle.setValue(this.config.excludeWeekends).onChange(async (value) => {
          this.config.excludeWeekends = value;
          await this.refreshPreview();
        }),
      );

    const buttonGroup = toolbar.createDiv("gantt-builder-button-row");

    const addTaskButton = buttonGroup.createEl("button", { text: "新增任务", cls: "mod-cta" });
    addTaskButton.onclick = async () => {
      this.tasks.push(createEmptyTask());
      this.renderTaskTable();
      await this.refreshPreview();
    };

    const reloadButton = buttonGroup.createEl("button", { text: "从笔记重载" });
    reloadButton.onclick = async () => {
      await this.reloadFromNote();
      this.renderTaskTable();
      await this.refreshPreview();
      new Notice("已从当前笔记重新加载任务");
    };

    const copyButton = buttonGroup.createEl("button", { text: "复制 Mermaid" });
    copyButton.onclick = async () => {
      const code = generateMermaidCode(this.tasks, this.config);
      await navigator.clipboard.writeText(toMermaidBlock(code));
      new Notice("Mermaid 代码已复制");
    };

    const saveButton = buttonGroup.createEl("button", { text: "写入/更新甘特图", cls: "mod-cta" });
    saveButton.onclick = async () => {
      await this.saveGanttBlockToNote();
    };
  }

  private renderTaskTable(): void {
    this.tableContainer.empty();

    const table = this.tableContainer.createEl("table", { cls: "gantt-builder-table" });
    const head = table.createTHead();
    const headerRow = head.insertRow();
    ["任务", "开始", "截止", "ID", "依赖", "分组", "状态", "操作"].forEach((label) => {
      headerRow.createEl("th", { text: label });
    });

    const body = table.createTBody();
    this.tasks.forEach((task) => {
      const row = body.insertRow();
      this.bindInputCell(row, task.name, "任务名称", async (value) => {
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
      this.bindInputCell(row, task.id, "可选", async (value) => {
        task.id = value;
        await this.refreshPreview();
      });
      this.bindInputCell(row, task.dependency, "任务 ID", async (value) => {
        task.dependency = value;
        await this.refreshPreview();
      });
      this.bindInputCell(row, task.section, "例如：设计阶段", async (value) => {
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
      doneLabel.appendText("完成");

      const milestoneLabel = statusCell.createEl("label");
      const milestoneToggle = milestoneLabel.createEl("input", { attr: { type: "checkbox" } });
      milestoneToggle.checked = task.isMilestone;
      milestoneToggle.onchange = async () => {
        task.isMilestone = milestoneToggle.checked;
        await this.refreshPreview();
      };
      milestoneLabel.appendText("里程碑");

      const criticalLabel = statusCell.createEl("label");
      const criticalToggle = criticalLabel.createEl("input", { attr: { type: "checkbox" } });
      criticalToggle.checked = task.isHighPriority;
      criticalToggle.onchange = async () => {
        task.isHighPriority = criticalToggle.checked;
        await this.refreshPreview();
      };
      criticalLabel.appendText("关键");

      const actionCell = row.insertCell();
      const removeButton = actionCell.createEl("button", { text: "删除", cls: "mod-warning" });
      removeButton.onclick = async () => {
        this.tasks = this.tasks.filter((item) => item.internalId !== task.internalId);
        this.renderTaskTable();
        await this.refreshPreview();
      };
    });
  }

  private bindInputCell(
    row: HTMLTableRowElement,
    value: string,
    placeholder: string,
    onChange: (value: string) => Promise<void>,
  ): void {
    const cell = row.insertCell();
    const input = cell.createEl("input", { type: "text", value, placeholder });
    input.onchange = async () => onChange(input.value.trim());
  }

  private async reloadFromNote(): Promise<void> {
    const content = await this.app.vault.read(this.file);
    this.tasks = parseTasksFromNote(content);
    if (!this.tasks.length) {
      this.tasks.push(createEmptyTask());
    }
  }

  private async saveGanttBlockToNote(): Promise<void> {
    const rawContent = await this.app.vault.read(this.file);
    const mermaidCode = generateMermaidCode(this.tasks, this.config);
    const nextContent = upsertGanttBlock(rawContent, mermaidCode);
    await this.app.vault.modify(this.file, nextContent);
    new Notice("甘特图代码块已写入当前笔记");
  }

  private async refreshPreview(): Promise<void> {
    const mermaidCode = generateMermaidCode(this.tasks, this.config);
    this.codeContainer.value = toMermaidBlock(mermaidCode);

    const token = ++this.previewGeneration;
    this.previewContainer.empty();
    const markdown = `${toMermaidBlock(mermaidCode)}\n`;
    await MarkdownRenderer.render(this.app, markdown, this.previewContainer, this.file.path, this.previewComponent);
    if (token !== this.previewGeneration) {
      return;
    }
  }
}

export default class ObsidianGanttBuilderPlugin extends Plugin {
  settings: GanttBuilderSettings = DEFAULT_SETTINGS;

  async onload(): Promise<void> {
    await this.loadSettings();

    this.addRibbonIcon("calendar-clock", "打开当前笔记 Gantt Builder", () => {
      void this.openBuilderForActiveNote();
    });

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

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  private async openBuilderForActiveNote(): Promise<void> {
    const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
    const file = markdownView?.file;
    if (!file) {
      new Notice("请先打开一条 Markdown 笔记");
      return;
    }

    const modal = new GanttBuilderModal(this.app, this, file, {
      excludeWeekends: this.settings.excludeWeekends,
    });
    modal.open();
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
      .setDesc("新开构建器窗口时默认启用该选项")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.excludeWeekends).onChange(async (value) => {
          this.plugin.settings.excludeWeekends = value;
          await this.plugin.saveSettings();
        }),
      );
  }
}
