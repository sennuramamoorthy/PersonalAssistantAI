export interface Conversation {
  id: string;
  title: string;
  is_archived: boolean;
  message_count: number;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
}

export interface ChatDeltaEvent {
  type: "delta";
  content: string;
}

export interface ChatDoneEvent {
  type: "done";
  message_id: string;
}

export interface ChatErrorEvent {
  type: "error";
  content: string;
}

export type ChatStreamEvent = ChatDeltaEvent | ChatDoneEvent | ChatErrorEvent;
