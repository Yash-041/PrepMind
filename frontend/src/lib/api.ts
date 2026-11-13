import { getAccessToken, clearSession, saveSession, type SessionUser } from "./session";
import type { ExamAnswerUpdate, ExamAttempt, ExamBankStatus, ExamHistoryItem, ExamResult, DailyResult, DailySet, DailyStreak, Message, ProgressReport } from "./types";

// Empty by default: requests go to /api/... and Vite proxies them to the backend.
const API_BASE = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/+$/, "");

export class ApiError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function errorMessage(detail: unknown, status: number): { message: string; code?: string } {
  if (typeof detail === "string") return { message: detail };
  // FastAPI validation errors: [{ msg: "..." }, ...]
  if (Array.isArray(detail)) {
    return { message: detail.map((item: { msg?: string }) => item.msg?.replace(/^Value error, /, "") ?? "Invalid input").join(". ") };
  }
  if (detail && typeof detail === "object") {
    const { message, code } = detail as { message?: string; code?: string };
    return { message: message ?? `Request failed (${status})`, code };
  }
  return { message: `Request failed (${status})` };
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getAccessToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  // An expired or revoked session on an authenticated call: send the user back to login.
  if (response.status === 401 && token) {
    clearSession();
    if (!window.location.pathname.startsWith("/login")) window.location.assign("/login");
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const { message, code } = errorMessage(data.detail, response.status);
    throw new ApiError(message, response.status, code);
  }
  return data as T;
}

export type StreamHandlers = {
  onUserMessage?: (message: Message) => void;
  onStatus?: (text: string) => void;
  onToken?: (text: string) => void;
  onDone?: (result: { conversation_id: string; title: string; subject: string | null; assistant_message: Message }) => void;
};

/**
 * Send a chat message and receive the answer as Server-Sent Events
 * (user_message -> status -> token... -> done). Pass an AbortSignal to stop generating.
 */
export async function streamChatMessage(chatId: string, content: string, handlers: StreamHandlers, signal?: AbortSignal): Promise<void> {
  const token = getAccessToken();
  const response = await fetch(`${API_BASE}/api/chats/${chatId}/messages/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ content }),
    signal,
  });
  if (response.status === 401 && token) {
    clearSession();
    window.location.assign("/login");
  }
  if (!response.ok || !response.body) {
    const data = await response.json().catch(() => ({}));
    const { message, code } = errorMessage(data.detail, response.status);
    throw new ApiError(message, response.status, code);
  }

  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    // SSE events are separated by a blank line.
    let boundary: number;
    while ((boundary = buffer.indexOf("\n\n")) !== -1) {
      const raw = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      const event = /^event: (.*)$/m.exec(raw)?.[1];
      const dataLine = /^data: (.*)$/m.exec(raw)?.[1];
      if (!event || !dataLine) continue;
      const data = JSON.parse(dataLine);
      if (event === "user_message") handlers.onUserMessage?.(data);
      else if (event === "status") handlers.onStatus?.(data.text);
      else if (event === "token") handlers.onToken?.(data.text);
      else if (event === "done") handlers.onDone?.(data);
      else if (event === "error") throw new ApiError(data.message, 500);
    }
  }
}

/** GET an /api route, e.g. apiGet("/chats"). */
export const apiGet = <T>(path: string) => request<T>(`/api${path}`);

/** POST JSON to an /api route, e.g. apiPost("/chats", {}). */
export const apiPost = <T>(path: string, body: unknown) =>
  request<T>(`/api${path}`, { method: "POST", body: JSON.stringify(body) });

export const api = {
  // Authentication
  signup: (payload: {
    full_name: string;
    email: string;
    target_exam: string;
    student_class: string;
    password: string;
    confirm_password: string;
  }) =>
    request<{ message: string; email: string }>("/api/auth/signup", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  verifyEmail: (token: string) =>
    request<SessionUser>("/api/auth/verify-email", {
      method: "POST",
      body: JSON.stringify({ token }),
    }),

  resendVerification: (email: string) =>
    request<{ message: string }>("/api/auth/resend-verification", {
      method: "POST",
      body: JSON.stringify({ email }),
    }),

  forgotPassword: (email: string) =>
    request<{ message: string }>("/api/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify({ email }),
    }),

  validateResetToken: (token: string) =>
    request<{ email: string }>("/api/auth/reset-password/validate", {
      method: "POST",
      body: JSON.stringify({ token }),
    }),

  resetPassword: (token: string, new_password: string) =>
    request<{ message: string; email: string }>("/api/auth/reset-password", {
      method: "POST",
      body: JSON.stringify({ token, new_password }),
    }),

  login: async (payload: { email: string; password: string }) => {
    const res = await request<{ access_token: string; user: SessionUser }>(
      "/api/auth/login",
      { method: "POST", body: JSON.stringify(payload) }
    );
    saveSession(res.access_token, res.user);
    return res;
  },

  googleLogin: async (id_token: string) => {
    const res = await request<{ access_token: string; user: SessionUser }>(
      "/api/auth/google",
      { method: "POST", body: JSON.stringify({ id_token }) }
    );
    saveSession(res.access_token, res.user);
    return res;
  },

  me: () => request<SessionUser>("/api/auth/me"),

  updateMe: (payload: { full_name?: string; target_exam?: string; student_class?: string }) =>
    request<SessionUser>("/api/auth/me", {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),

  changePassword: (payload: { current_password?: string; new_password: string }) =>
    request<{ message: string }>("/api/auth/change-password", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  // RAG Tutor Chats (listing, creating and loading chats use apiGet/apiPost in Home and AppShell)
  deleteChat: (chatId: string) =>
    request<void>(`/api/chats/${chatId}`, { method: "DELETE" }),

  // Daily 20 Practice
  getTodayPractice: (targetExam?: string) =>
    request<DailySet>(
      `/api/daily-practice/today${targetExam ? `?target_exam=${encodeURIComponent(targetExam)}` : ""}`
    ),
  submitDailyPractice: (
    setId: string,
    answers: { question_id: string; selected_option: string | null }[]
  ) =>
    request<DailyResult>(`/api/daily-practice/${setId}/submit`, {
      method: "POST",
      body: JSON.stringify({ answers }),
    }),
  getDailyResult: (setId: string) =>
    request<DailyResult>(`/api/daily-practice/${setId}/result`),
  getDailyStreak: () => request<DailyStreak>("/api/daily-practice/streak"),

  // Exam Simulator
  getExamBankStatus: () => request<ExamBankStatus>("/api/exams/bank-status"),
  /** Starts preparing a paper, or returns the one already being prepared or taken. */
  startExamAttempt: (templateCode = "JEE_MAIN_FULL") =>
    request<ExamAttempt>("/api/exams/attempts", {
      method: "POST",
      body: JSON.stringify({ template_code: templateCode }),
    }),
  getExamAttempt: (attemptId: string) =>
    request<ExamAttempt>(`/api/exams/attempts/${attemptId}`),
  saveExamAnswers: (attemptId: string, answers: ExamAnswerUpdate[]) =>
    request<{ status: string }>(`/api/exams/attempts/${attemptId}/answers`, {
      method: "PUT",
      body: JSON.stringify({ answers }),
    }),
  submitExamAttempt: (attemptId: string) =>
    request<ExamResult>(`/api/exams/attempts/${attemptId}/submit`, {
      method: "POST",
    }),
  discardExamAttempt: (attemptId: string) =>
    request<void>(`/api/exams/attempts/${attemptId}`, { method: "DELETE" }),
  getExamResult: (attemptId: string) =>
    request<ExamResult>(`/api/exams/attempts/${attemptId}/result`),
  getExamHistory: () => request<ExamHistoryItem[]>("/api/exams/history"),

  // Progress & Weak Topics
  getProgressOverview: () => request<any>("/api/progress/overview"),
  getProgressReport: () => request<ProgressReport>("/api/progress/report"),
};
