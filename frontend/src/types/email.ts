export interface Email {
  id: string;
  thread_id: string;
  provider: "google" | "microsoft";
  from: string;
  to: string;
  subject: string;
  snippet: string;
  body: string;
  date: string;
  is_unread: boolean;
  is_starred: boolean;
  labels: string[];
}

export interface InboxResponse {
  emails: Email[];
  total: number;
  unread: number;
  page: number;
  page_size: number;
  providers_connected: string[];
  errors?: string[];
}

export interface EmailCategorization {
  sender_type: string;
  priority: string;
  category: string;
  summary: string;
  requires_response: boolean;
  institution: string;
}

export interface DraftResponse {
  draft: string;
}

export interface SendEmailRequest {
  provider: "google" | "microsoft";
  to: string;
  subject: string;
  body: string;
  reply_to_id?: string;
}

export interface SendEmailResponse {
  status: string;
  result: Record<string, unknown>;
}
