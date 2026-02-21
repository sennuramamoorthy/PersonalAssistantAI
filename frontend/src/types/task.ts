export interface Task {
  id: string;
  title: string;
  description: string;
  priority: "urgent" | "high" | "normal" | "low";
  status: "pending" | "in_progress" | "completed";
  due_date: string | null;
  source_email_id: string | null;
  source_email_provider: "google" | "microsoft" | null;
  source_email_subject: string;
  source_email_from: string;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface TasksResponse {
  tasks: Task[];
  total: number;
}

export interface TaskCounts {
  pending: number;
  in_progress: number;
  completed: number;
  total: number;
}

export interface TaskSuggestionItem {
  title: string;
  description: string;
  priority: "urgent" | "high" | "normal" | "low";
  suggested_due_date: string | null;
}

export interface TaskSuggestion {
  email_id: string;
  email_provider: string;
  email_subject: string;
  email_from: string;
  email_date: string;
  tasks: TaskSuggestionItem[];
}

export interface ScanEmailsForTasksResponse {
  suggestions: TaskSuggestion[];
  emails_scanned: number;
  tasks_found: number;
  skipped_already_scanned: number;
}
