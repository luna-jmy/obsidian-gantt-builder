import { GanttConfig, Task } from "../types";

const DATE_PATTERN = "\\d{4}-\\d{2}-\\d{2}";
const startDateRegex = new RegExp(`(?:\\u{1F6EB}\\uFE0F?\\s*|\\[start::\\s*)(${DATE_PATTERN})\\]?`, "u");
const scheduledDateRegex = new RegExp(`(?:\\u{23F3}\\uFE0F?\\s*|\\[scheduled::\\s*)(${DATE_PATTERN})\\]?`, "u");
const dueDateRegex = new RegExp(`(?:\\u{1F4C5}\\uFE0F?\\s*|\\[due::\\s*)(${DATE_PATTERN})\\]?`, "u");
const doneDateRegex = new RegExp(`(?:\\u{2705}\\uFE0F?|\\[completion::\\s*)(${DATE_PATTERN})\\]?`, "u");
const createdDateRegex = new RegExp(`(?:\\u{2795}\\uFE0F?|\\[created::\\s*)(${DATE_PATTERN})\\]?`, "u");
const cancelledDateRegex = new RegExp(`(?:\\u{274C}\\uFE0F?|\\[cancelled::\\s*)(${DATE_PATTERN})\\]?`, "u");
const idRegex = new RegExp(`(?:\\u{1F194}\\uFE0F?\\s*|\\[id::\\s*)([a-zA-Z0-9_-]+)\\]?`, "u");
const dependencyRegex = new RegExp(`(?:\\u{26D4}\\uFE0F?\\s*|\\[(?:dependsOn|depends on|depends)::\\s*)([a-zA-Z0-9_-]+)\\]?`, "iu");
const ownerRegex = /\[owner::\s*([^\]]+)\]/;
const milestoneRegex = new RegExp(`#milestone|\\u{1F6A9}\\uFE0F?`, "iu");
const criticalRegex = new RegExp(`#crit|#critical|\\u{1F53A}\\uFE0F?`, "iu");

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

const sanitizeName = (name: string): string => name.replace(/[:#]/g, "").trim();
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

    const task: Task = {
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
      isHighPriority: criticalRegex.test(raw),
    };

    tasks.push(task);
  }

  return tasks;
}

const RESERVED_ATTRS = new Set(["crit", "milestone", "done", "active"]);

function parseTaskLineFromMermaid(line: string, section: string, index: number): Task | null {
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

  return tasks.length ? { chartTitle, tasks } : null;
}

const calculateWorkingDays = (startDate: string, endDate: string): number => {
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

function calculateDuration(task: Task, excludeWeekends: boolean): string {
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
  const diff = Math.floor(Math.abs(end.getTime() - start.getTime()) / 86400000) + 1;
  return `${Math.max(1, diff)}d`;
}

function calculateDependencyDuration(currentTaskDueDate: string, dependencyTask: Task | undefined, excludeWeekends: boolean): string {
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
    const depEnd = new Date(dependencyEndDate);
    const nextStart = new Date(depEnd);
    nextStart.setDate(nextStart.getDate() + 1);
    while (nextStart.getDay() === 0 || nextStart.getDay() === 6) {
      nextStart.setDate(nextStart.getDate() + 1);
    }
    return `${calculateWorkingDays(formatDate(nextStart), currentTaskDueDate)}d`;
  }

  const currentDue = new Date(currentTaskDueDate);
  const depEnd = new Date(dependencyEndDate);
  const diff = Math.ceil((currentDue.getTime() - depEnd.getTime()) / 86400000);
  return `${Math.max(1, diff)}d`;
}

export function generateMermaidCode(tasks: Task[], config: GanttConfig, chartTitle = DEFAULT_CHART_TITLE): string {
  const safeTitle = sanitizeName(chartTitle) || DEFAULT_CHART_TITLE;
  const lines: string[] = ["gantt", `    title ${safeTitle}`, "    dateFormat YYYY-MM-DD", "    axisFormat %m/%d", "    todayMarker on"];
  if (config.excludeWeekends) {
    lines.push("    excludes weekends");
  }
  lines.push("");

  if (!tasks.length) {
    return lines.join("\n");
  }

  const sections = new Map<string, Task[]>();
  for (const task of tasks) {
    const sectionName = task.section || "Tasks";
    if (!sections.has(sectionName)) {
      sections.set(sectionName, []);
    }
    sections.get(sectionName)?.push(task);
  }

  const globalTaskMap = new Map<string, Task>();
  for (const task of tasks) {
    if (task.id) {
      globalTaskMap.set(task.id, task);
    }
  }

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
        if (task.dueDate) {
          attrs.push(calculateDependencyDuration(task.dueDate, globalTaskMap.get(task.dependency), config.excludeWeekends));
        } else {
          attrs.push("1d");
        }
      } else if (task.isMilestone) {
        attrs.push(task.dueDate || task.startDate || formatDate(new Date()));
        attrs.push("0d");
      } else if (task.startDate && task.dueDate) {
        attrs.push(task.startDate);
        attrs.push(calculateDuration(task, config.excludeWeekends));
      } else if (task.dueDate) {
        attrs.push(task.dueDate);
        attrs.push("1d");
      } else {
        attrs.push(formatDate(new Date()));
        attrs.push("1d");
      }

      lines.push(`    ${sanitizeName(task.name) || "Untitled Task"} :${attrs.join(", ")}`);
    }
    lines.push("");
  });

  return lines.join("\n").trimEnd();
}

export const toMermaidBlock = (mermaidCode: string): string => `\`\`\`mermaid\n${mermaidCode}\n\`\`\``;

export function loadPersistedGanttData(noteContent: string): PersistedGanttData | null {
  const ganttData = parseTasksFromGanttBlock(noteContent);
  const defaultTitle = ganttData?.chartTitle ?? DEFAULT_CHART_TITLE;

  const startIndex = noteContent.indexOf(DATA_START_MARKER);
  const endIndex = noteContent.indexOf(DATA_END_MARKER);
  if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
    const scopedContent = noteContent.slice(startIndex + DATA_START_MARKER.length, endIndex);
    return {
      chartTitle: defaultTitle,
      tasks: parseTasksFromNote(scopedContent),
    };
  }

  if (ganttData) {
    return ganttData;
  }

  return null;
}

function buildGanttBlock(mermaidCode: string): string {
  return [GANTT_START_MARKER, toMermaidBlock(mermaidCode), GANTT_END_MARKER].join("\n");
}

function replaceExistingGantt(noteContent: string, ganttBlock: string): string | null {
  const startIndex = noteContent.indexOf(GANTT_START_MARKER);
  const endIndex = noteContent.indexOf(GANTT_END_MARKER);
  if (startIndex === -1 || endIndex === -1 || endIndex <= startIndex) {
    return null;
  }
  const before = noteContent.slice(0, startIndex).replace(/\s+$/, "");
  const after = noteContent.slice(endIndex + GANTT_END_MARKER.length).replace(/^\s+/, "");
  return `${before}\n\n${ganttBlock}\n\n${after}`.trimEnd() + "\n";
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
  _tasks: Task[],
  _chartTitle = DEFAULT_CHART_TITLE,
  options: InsertOptions = { mode: "bottom", useCustomTitle: true },
): string {
  const ganttBlock = buildGanttBlock(mermaidCode);

  const replaced = replaceExistingGantt(noteContent, ganttBlock);
  if (replaced) {
    return replaced;
  }

  if (options.mode === "cursor" && typeof options.cursorOffset === "number") {
    const offset = Math.max(0, Math.min(options.cursorOffset, noteContent.length));
    return `${noteContent.slice(0, offset)}\n${ganttBlock}\n${noteContent.slice(offset)}`.trimEnd() + "\n";
  }

  if (options.mode === "heading") {
    return insertAfterHeading(noteContent, options.headingText ?? "", ganttBlock);
  }

  return `${noteContent.replace(/\s*$/, "")}\n\n${ganttBlock}\n`.trimStart();
}
