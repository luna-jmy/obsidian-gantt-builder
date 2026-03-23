import { getLanguage } from "obsidian";

type Language = "zh" | "en";

const resolveLanguage = (): Language => {
  try {
    const appLanguage = getLanguage()?.toLowerCase?.();
    if (appLanguage?.startsWith("zh")) {
      return "zh";
    }
    if (appLanguage) {
      return "en";
    }
  } catch {
    // ignore and fallback
  }

  if (typeof navigator !== "undefined") {
    const browserLanguage = navigator.language.toLowerCase();
    if (browserLanguage.startsWith("zh")) {
      return "zh";
    }
  }

  return "en";
};

const dictionary = {
  zh: {
    defaultTargetHeading: "## 项目分解",
    chartTitleLabel: "甘特图标题",
    chartTitleHint: "仅影响 Mermaid 甘特图里的 title，可留空。",
    reloadFromNote: "从笔记重载",
    reloadSuccess: "已从当前笔记重载任务",
    copyToClipboard: "复制到剪贴板",
    mermaidCopied: "Mermaid 代码已复制到剪贴板",
    exportSvg: "导出 SVG",
    exportPng: "导出 PNG",
    saveTasks: "写入/更新任务",
    saveGantt: "写入/更新甘特图",
    currentNote: "当前笔记：{name}",
    taskListTitle: "任务列表（支持拖拽排序）",
    addTask: "新增任务",
    preview: "预览",
    mermaidCode: "Mermaid 代码",
    excludeWeekends: "排除周末",
    excludeWeekendsDesc: "启用后按工作日计算时长",
    writePosition: "写入位置",
    writePositionDesc: "同时作用于甘特图和任务写入",
    optionCursor: "光标所在位置",
    optionBottom: "底部",
    optionHeading: "特定标题下方",
    unnamedTask: "未命名任务",
    currentDependency: "(当前依赖)",
    headerAction: "操作",
    headerGroup: "分组",
    headerTask: "任务",
    headerDate: "日期",
    headerIdDependency: "ID/依赖",
    addInCurrentGroup: "在当前分组新增任务",
    deleteTask: "删除任务",
    groupPlaceholder: "分组，如：执行阶段",
    taskNamePlaceholder: "任务名称",
    done: "完成",
    milestone: "里程碑",
    critical: "关键",
    from: "从",
    to: "至",
    dateConflict: "日期冲突",
    optional: "可选",
    randomIdTitle: "自动生成随机 ID",
    dependency: "依赖",
    noDependency: "无依赖",
    noExportableChart: "未找到可导出的甘特图，请先点击预览。",
    svgExported: "SVG 已导出：{path}",
    pngExported: "PNG 已导出：{path}",
    failedLoadSvgForPng: "无法加载 SVG 导出 PNG",
    createCanvasError: "无法创建 Canvas",
    invalidTaskHeading: "任务默认目标标题格式无效，请使用例如：## Project Plan",
    cursorFallback: "未找到光标位置，已回退到底部写入。",
    tasksWritten: "任务已写入/更新到 data 范围。",
    invalidGanttHeading: "甘特图默认目标标题格式无效，请使用例如：## Project Plan",
    ganttWritten: "甘特图已写入/更新。",
    noteNotFound: "未找到目标笔记。",
    openHintNoFile: "请从命令或功能区在某条笔记中打开 Gantt Builder。",
    ribbonTitle: "打开当前笔记 Gantt Builder",
    commandName: "打开当前笔记任务甘特构建器",
    openMarkdownFirst: "请先打开一条 Markdown 笔记。",
    createViewFailed: "无法创建目标视图，请重试。",
    settingDefaultExcludeWeekends: "默认排除周末",
    settingDefaultExcludeWeekendsDesc: "新开构建器时默认启用",
    settingOpenMode: "打开方式",
    settingOpenModeDesc: "选择打开构建器的默认位置",
    sidebar: "侧边栏",
    modal: "弹框",
    newTab: "新标签页",
    settingDefaultInsertMode: "默认写入位置",
    settingDefaultInsertModeDesc: "同时作用于甘特图与任务写入",
    settingGanttDefaultHeading: "甘特图默认目标标题",
    settingTaskDefaultHeading: "任务默认目标标题",
    settingHeadingDesc: "必须包含标题标识符，例如：## Project Plan",
    headingFormatError: "标题格式错误：请使用例如 ## Project Plan",
    ungrouped: "未分组",
  },
  en: {
    defaultTargetHeading: "## Project Plan",
    chartTitleLabel: "Gantt Title",
    chartTitleHint: "Only affects Mermaid gantt title. Leave empty for no title.",
    reloadFromNote: "Reload From Note",
    reloadSuccess: "Tasks reloaded from current note.",
    copyToClipboard: "Copy to Clipboard",
    mermaidCopied: "Mermaid code copied to clipboard.",
    exportSvg: "Export SVG",
    exportPng: "Export PNG",
    saveTasks: "Write/Update Tasks",
    saveGantt: "Write/Update Gantt",
    currentNote: "Current Note: {name}",
    taskListTitle: "Task List (Drag to Reorder)",
    addTask: "Add Task",
    preview: "Preview",
    mermaidCode: "Mermaid Code",
    excludeWeekends: "Exclude Weekends",
    excludeWeekendsDesc: "If enabled, durations are calculated by working days.",
    writePosition: "Write Position",
    writePositionDesc: "Applies to both Gantt and task writing.",
    optionCursor: "At Cursor",
    optionBottom: "At Bottom",
    optionHeading: "Below Specific Heading",
    unnamedTask: "Untitled Task",
    currentDependency: "(Current Dependency)",
    headerAction: "Action",
    headerGroup: "Group",
    headerTask: "Task",
    headerDate: "Date",
    headerIdDependency: "ID/Dependency",
    addInCurrentGroup: "Add task in current group",
    deleteTask: "Delete task",
    groupPlaceholder: "Group, e.g. Execution",
    taskNamePlaceholder: "Task name",
    done: "Done",
    milestone: "Milestone",
    critical: "Critical",
    from: "From",
    to: "To",
    dateConflict: "Date Conflict",
    optional: "Optional",
    randomIdTitle: "Generate random ID",
    dependency: "Dependency",
    noDependency: "No Dependency",
    noExportableChart: "No exportable chart found. Please render preview first.",
    svgExported: "SVG exported: {path}",
    pngExported: "PNG exported: {path}",
    failedLoadSvgForPng: "Failed to load SVG for PNG export",
    createCanvasError: "Failed to create Canvas",
    invalidTaskHeading: "Invalid default task heading. Use format like: ## Project Plan",
    cursorFallback: "Cursor not found. Fallback to write at bottom.",
    tasksWritten: "Tasks written/updated to data scope.",
    invalidGanttHeading: "Invalid default gantt heading. Use format like: ## Project Plan",
    ganttWritten: "Gantt written/updated.",
    noteNotFound: "Target note not found.",
    openHintNoFile: "Open Gantt Builder from a specific note via command or ribbon.",
    ribbonTitle: "Open Gantt Builder For Current Note",
    commandName: "Open Gantt Builder For Current Note",
    openMarkdownFirst: "Please open a Markdown note first.",
    createViewFailed: "Unable to create target view. Please retry.",
    settingDefaultExcludeWeekends: "Default Exclude Weekends",
    settingDefaultExcludeWeekendsDesc: "Enabled by default when opening builder.",
    settingOpenMode: "Open Mode",
    settingOpenModeDesc: "Default location to open builder.",
    sidebar: "Sidebar",
    modal: "Modal",
    newTab: "New Tab",
    settingDefaultInsertMode: "Default Write Position",
    settingDefaultInsertModeDesc: "Applies to both Gantt and task writing.",
    settingGanttDefaultHeading: "Default Gantt Heading",
    settingTaskDefaultHeading: "Default Task Heading",
    settingHeadingDesc: "Must include heading markers, e.g. ## Project Plan",
    headingFormatError: "Invalid heading format. Use e.g. ## Project Plan",
    ungrouped: "Ungrouped",
  },
} as const;

type MessageKey = keyof typeof dictionary.zh;

export const t = (key: MessageKey, vars?: Record<string, string>): string => {
  const template = dictionary[resolveLanguage()][key];
  if (!vars) {
    return template;
  }
  return template.replace(/\{(\w+)\}/g, (_, name: string) => vars[name] ?? `{${name}}`);
};
