export interface Chat {
  id: string;
  user_id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: string;
  chat_id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
}

export interface ChatDetail {
  chat: Chat;
  messages: Message[];
}

export interface MessageResponse {
  user_message: Message;
  assistant_message: Message;
}

export interface Question {
  id: string;
  subject: "Physics" | "Chemistry" | "Mathematics";
  topic: string;
  difficulty: "Easy" | "Medium" | "Hard" | "JEE Advanced";
  question: string;
  options: string[];
  answer: number;
}

export interface SubjectScore {
  subject: Question["subject"];
  percent: number;
  color: string;
}