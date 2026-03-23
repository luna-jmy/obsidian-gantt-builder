import { GanttConfig, Task } from "../types";

const DATE_PATTERN = "\\d{4}-\\d{2}-\\d{2}";
const startDateRegex = new RegExp(`(?:🛫|\\[start::\\s*)(${DATE_PATTERN})\\]?`);
const scheduledDateRegex = new RegExp(`(?:⏳|\\[scheduled::\\s*)(${DATE_PATTERN})\\]?`);
const dueDateRegex = new RegExp(`(?:📅|\\[due::\\s*)(${DATE_PATTERN})\\]?`);
const doneDateRegex = new RegExp(`(?:✅|\\[completion::\\s*)(${DATE_PATTERN})\\]?`);
const createdDateRegex = new RegExp(`(?:➕|\\[created::\\s*)(${DATE_PATTERN})\\]?`);
const cancelledDateRegex = new RegExp(`(?:❌|\\[cancelled::\\s*)(${DATE_PATTERN})\\]?`);
const idRegex = /(?:🆔|\[id::\s*)([a-zA-Z0-9_-]+)\]?/;
const dependencyRegex = /(?:⛔|\[(?:dependsOn|depends on|depends)::\s*)([a-zA-Z0-9_-]+)\]?/i;
const ownerRegex = /\[owner::\s*([^\]]+)\]/;
const milestoneRegex = /#milestone|🚩/i;
const criticalRegex = /#crit|#critical|🔺/i;

const DATA_START_MARKER = "%% gantt-builder:data:start %%";
const DATA_END_MARKER = "%% gantt-builder:data:end %%";
const GANTT_START_MARKER = "%% gantt-builder:start %%";
const GANTT_END_MARKER = "%% gantt-builder:end %%";

export const DEFAULT_CHART_TITLE = "Gantt Chart";
export type InsertMode = "cursor" | "bottom" | "heading";

export interface PersistedGanttData {
  chartTitle: string;
  tasks: Task[];
}

export interface InsertOptions {
  mode: InsertMode;
  headingText?: string;
  cursorOffset?: number;
  useCustomTitle?: boolean;
}

const normalizeDate = (date: string): string => {
  const trimmed = date.trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : "";
};

const cleanName = (name: string): string =>
  name
    .replace(startDateRegex, "")
    .replace(scheduledDateRegex, "")
    .replace(dueDateRegex, "")
    .replace(doneDateRegex, "")
    .replace(createdDateRegex, "")
    .replace(cancelledDateRegex, "")
    .replace(idRegex, "")
    .replace(dependencyRegex, "")
    .replace(ownerRegex, "")
    .replace(milestoneRegex, "")
    .replace(criticalRegex, "")
    .replace(/\s+/g, " ")
    .trim();

function sanitizeName(name: string): string {
  return name.replace(/[:#]/g, "").trim();
}

const formatDate = (date: Date): string => date.toISOString().slice(0, 10);

const addDays = (dateStr: string, days: number): string => {
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  date.setDate(date.getDate() + days);
  return formatDate(date);
};

export function parseTasksFromNote(markdown: string): Task[] {
  const tasks: Task[] = [];
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
    const parsedTask: Task = {
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
      isHighPriority: criticalRegex.test(raw),
    };

    if (!parsedTask.name) {
      parsedTask.name = "Untitled Task";
    }
    tasks.push(parsedTask);
  }

  return tasks;
}

const RESERVED_ATTRS = new Set(["crit", "milestone", "done", "active", "today"]);

function parseTaskLineFromMermaid(line: string, section: string, index: number): Task | null {
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
    isHighPriority,
  };
}

function parseTasksFromGanttBlock(noteContent: string): PersistedGanttData | null {
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
  const tasks: Task[] = [];
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

function calculateWorkingDays(startDate: string, endDate: string): number {
  if (!startDate || !endDate) {
    return 1;
  }

  const start = new Date(startDate);
  const end = new Date(endDate);
  const direction = start <= end ? 1 : -1;
  let current = new Date(start);
  let workingDays = 0;

  while ((direction === 1 && current <= end) || (direction === -1 && current >= end)) {
    const day = current.getDay();
    if (day !== 0 && day !== 6) {
      workingDays += 1;
    }
    current.setDate(current.getDate() + direction);
  }

  return Math.max(1, workingDays);
}

function calculateDuration(task: Task, excludeWeekends: boolean): string {
  if (task.isMilestone) {
    return "0d";
  }

  if (task.startDate && task.dueDate) {
    if (excludeWeekends) {
      return `${calculateWorkingDays(task.startDate, task.dueDate)}d`;
    }

    const start = new Date(task.startDate);
    const end = new Date(task.dueDate);
    const diff = Math.floor(Math.abs(end.getTime() - start.getTime()) / 86400000) + 1;
    return `${Math.max(1, diff)}d`;
  }

  return "1d";
}

export function generateMermaidCode(tasks: Task[], config: GanttConfig, chartTitle = DEFAULT_CHART_TITLE): string {
  const safeTitle = sanitizeName(chartTitle) || DEFAULT_CHART_TITLE;
  if (!tasks.length) {
    return `gantt\n    title ${safeTitle}\n    dateFormat YYYY-MM-DD`;
  }

  const sections = new Map<string, Task[]>();
  for (const task of tasks) {
    const sectionName = task.section || "Tasks";
    if (!sections.has(sectionName)) {
      sections.set(sectionName, []);
    }
    sections.get(sectionName)?.push(task);
  }

  const lines: string[] = [
    "gantt",
    `    title ${safeTitle}`,
    "    dateFormat YYYY-MM-DD",
    "    axisFormat %m/%d",
    "    todayMarker on",
  ];

  if (config.excludeWeekends) {
    lines.push("    excludes weekends");
  }

  lines.push("");

  sections.forEach((sectionTasks, sectionName) => {
    lines.push(`    section ${sanitizeName(sectionName) || "Tasks"}`);
    for (const task of sectionTasks) {
      const attrs: string[] = [];
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

export function toMermaidBlock(mermaidCode: string): string {
  return `\`\`\`mermaid\n${mermaidCode}\n\`\`\``;
}

export function loadPersistedGanttData(noteContent: string): PersistedGanttData | null {
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
    const normalizeTasks = (rawTasks: unknown): Task[] => {
      if (!Array.isArray(rawTasks)) {
        return [];
      }
      return rawTasks
        .filter((item) => typeof item === "object" && item !== null)
        .map((item) => {
          const raw = item as Partial<Task>;
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
            isHighPriority: Boolean(raw.isHighPriority),
          };
        });
    };

    if (Array.isArray(parsed)) {
      return {
        chartTitle: DEFAULT_CHART_TITLE,
        tasks: normalizeTasks(parsed),
      };
    }

    if (typeof parsed !== "object" || parsed === null) {
      return null;
    }

    const data = parsed as Partial<PersistedGanttData>;
    return {
      chartTitle: typeof data.chartTitle === "string" && data.chartTitle.trim() ? data.chartTitle.trim() : DEFAULT_CHART_TITLE,
      tasks: normalizeTasks(data.tasks),
    };
  } catch {
    return parseTasksFromGanttBlock(noteContent);
  }
}

function buildArtifactsBlock(mermaidCode: string, tasks: Task[], chartTitle: string): string {
  const payload: PersistedGanttData = {
    chartTitle: chartTitle.trim() || DEFAULT_CHART_TITLE,
    tasks,
  };
  const dataBlock = `\`\`\`json\n${JSON.stringify(payload, null, 2)}\n\`\`\``;
  const mermaidBlock = toMermaidBlock(mermaidCode);

  return [
    DATA_START_MARKER,
    dataBlock,
    DATA_END_MARKER,
    "",
    GANTT_START_MARKER,
    mermaidBlock,
    GANTT_END_MARKER,
  ].join("\n");
}

function replaceExistingArtifacts(noteContent: string, artifactsBlock: string): string | null {
  const startIndex = noteContent.indexOf(DATA_START_MARKER);
  const dataEndIndex = noteContent.indexOf(DATA_END_MARKER);
  const ganttStartIndex = noteContent.indexOf(GANTT_START_MARKER);
  const ganttEndIndex = noteContent.indexOf(GANTT_END_MARKER);

  if (
    startIndex !== -1 &&
    dataEndIndex !== -1 &&
    ganttStartIndex !== -1 &&
    ganttEndIndex !== -1 &&
    startIndex < dataEndIndex &&
    dataEndIndex < ganttStartIndex &&
    ganttStartIndex < ganttEndIndex
  ) {
    const before = noteContent.slice(0, startIndex).replace(/\s+$/, "");
    const after = noteContent.slice(ganttEndIndex + GANTT_END_MARKER.length).replace(/^\s+/, "");
    return `${before}\n\n${artifactsBlock}\n\n${after}`.trimEnd() + "\n";
  }

  const oldStart = noteContent.indexOf(GANTT_START_MARKER);
  const oldEnd = noteContent.indexOf(GANTT_END_MARKER);
  if (oldStart !== -1 && oldEnd !== -1 && oldStart < oldEnd) {
    const before = noteContent.slice(0, oldStart).replace(/\s+$/, "");
    const after = noteContent.slice(oldEnd + GANTT_END_MARKER.length).replace(/^\s+/, "");
    return `${before}\n\n${artifactsBlock}\n\n${after}`.trimEnd() + "\n";
  }

  return null;
}

function insertAfterHeading(noteContent: string, headingText: string, block: string): string {
  const escaped = headingText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").trim();
  if (!escaped) {
    return `${noteContent.replace(/\s*$/, "")}\n\n${block}\n`;
  }

  const regex = new RegExp(`^\\s{0,3}#{1,6}\\s+${escaped}\\s*$`, "m");
  const match = noteContent.match(regex);
  if (!match || match.index === undefined) {
    return `${noteContent.replace(/\s*$/, "")}\n\n${block}\n`;
  }

  const headingEnd = noteContent.indexOf("\n", match.index);
  const insertPos = headingEnd === -1 ? noteContent.length : headingEnd + 1;
  return `${noteContent.slice(0, insertPos)}\n${block}\n${noteContent.slice(insertPos)}`.trimEnd() + "\n";
}

export function upsertGanttArtifacts(
  noteContent: string,
  mermaidCode: string,
  tasks: Task[],
  chartTitle = DEFAULT_CHART_TITLE,
  options: InsertOptions = { mode: "bottom", useCustomTitle: true },
): string {
  const effectiveTitle = options.useCustomTitle === false ? DEFAULT_CHART_TITLE : chartTitle;
  const artifactsBlock = buildArtifactsBlock(mermaidCode, tasks, effectiveTitle);

  const replaced = replaceExistingArtifacts(noteContent, artifactsBlock);
  if (replaced) {
    return replaced;
  }

  if (options.mode === "cursor" && typeof options.cursorOffset === "number") {
    const offset = Math.max(0, Math.min(options.cursorOffset, noteContent.length));
    return `${noteContent.slice(0, offset)}\n${artifactsBlock}\n${noteContent.slice(offset)}`.trimEnd() + "\n";
  }

  if (options.mode === "heading") {
    return insertAfterHeading(noteContent, options.headingText ?? "", artifactsBlock);
  }

  return `${noteContent.replace(/\s*$/, "")}\n\n${artifactsBlock}\n`.trimStart();
}
