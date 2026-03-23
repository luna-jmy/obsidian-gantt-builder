import { GanttConfig, Task } from "../types";

const DATE_PATTERN = "\\d{4}-\\d{2}-\\d{2}";
const startDateRegex = new RegExp(`(?:🛫|🚀|\\[start::\\s*)(${DATE_PATTERN})\\]?`);
const dueDateRegex = new RegExp(`(?:📅|⏳|\\[due::\\s*)(${DATE_PATTERN})\\]?`);
const idRegex = /(?:🆔|\[id::\s*)([a-zA-Z0-9_-]+)\]?/;
const dependencyRegex = /(?:⛓️?|🔗|\[depends::\s*)([a-zA-Z0-9_-]+)\]?/;
const ownerRegex = /\[owner::\s*([^\]]+)\]/;
const milestoneRegex = /#milestone|🚩/i;
const criticalRegex = /#crit|#critical|🔥/i;

const normalizeDate = (date: string): string => {
  const trimmed = date.trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : "";
};

const cleanName = (name: string): string =>
  name
    .replace(startDateRegex, "")
    .replace(dueDateRegex, "")
    .replace(idRegex, "")
    .replace(dependencyRegex, "")
    .replace(ownerRegex, "")
    .replace(milestoneRegex, "")
    .replace(criticalRegex, "")
    .replace(/\s+/g, " ")
    .trim();

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
    const parsedTask: Task = {
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
      isHighPriority: criticalRegex.test(raw),
    };

    if (!parsedTask.name) {
      parsedTask.name = "Untitled Task";
    }

    tasks.push(parsedTask);
  }

  return tasks;
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

function sanitizeName(name: string): string {
  return name.replace(/[:#]/g, "").trim();
}

export function generateMermaidCode(tasks: Task[], config: GanttConfig): string {
  if (!tasks.length) {
    return "gantt\n    title Empty Gantt\n    dateFormat YYYY-MM-DD";
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
    "    title Note Task Timeline",
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

export function upsertGanttBlock(noteContent: string, mermaidCode: string): string {
  const startMarker = "%% gantt-builder:start %%";
  const endMarker = "%% gantt-builder:end %%";
  const block = `${startMarker}\n${toMermaidBlock(mermaidCode)}\n${endMarker}`;

  const startIndex = noteContent.indexOf(startMarker);
  const endIndex = noteContent.indexOf(endMarker);

  if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
    const before = noteContent.slice(0, startIndex).replace(/\s+$/, "");
    const after = noteContent.slice(endIndex + endMarker.length).replace(/^\s+/, "");
    return `${before}\n\n${block}\n\n${after}`.trimEnd();
  }

  const trimmed = noteContent.trimEnd();
  if (!trimmed) {
    return `${block}\n`;
  }

  return `${trimmed}\n\n## Gantt Chart\n\n${block}\n`;
}
