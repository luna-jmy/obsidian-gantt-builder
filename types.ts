export interface Task {
  internalId: string;
  name: string;
  project: string;
  section: string;
  completed: boolean;
  startDate: string;
  dueDate: string;
  owner: string;
  id: string;
  dependency: string;
  isMilestone: boolean;
  isHighPriority: boolean;
}

export interface GanttConfig {
  excludeWeekends: boolean;
}
