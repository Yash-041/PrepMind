export interface Chat {
  id: string;
  title: string;
  subject: string | null;
  created_at: string;
  updated_at: string;
}

export interface Source {
  ref: number;
  source_file: string;
  doc_type: string;
  subject: string;
  chapter: string;
  page_number: number | null;
  excerpt: string;
  similarity: number;
}

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
  is_fallback?: boolean;
  model?: string | null;
  created_at: string;
}

export interface ChatDetail extends Chat {
  messages: Message[];
}

export interface MessageResponse {
  conversation_id: string;
  title: string;
  subject: string | null;
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
// ---- Exam Simulator ----
export type ExamSubject = "Physics" | "Chemistry" | "Mathematics";
export type ExamQuestionType = "mcq" | "numerical";
export type ExamStatus = "preparing" | "in_progress" | "submitted" | "failed";

export interface ExamQuestion {
  id: string;
  order_index: number;
  subject: ExamSubject;
  question_type: ExamQuestionType;
  question_text: string;
  options: string[];
  marks: number;
  negative_marks: number;
  selected_option: string | null;
  marked_for_review: boolean;
  time_spent_seconds: number;
}

export type ExamDifficultyLevel = "foundation" | "jee_main" | "advanced";
export type Difficulty = "Easy" | "Medium" | "Hard";

export interface ExamDifficulty {
  level: ExamDifficultyLevel;
  label: string;
  mix: Record<Difficulty, number>;
  promote_at: number | null;
  demote_below: number | null;
}

export interface ExamAttempt {
  id: string;
  title: string;
  exam_type: string;
  status: ExamStatus;
  duration_minutes: number;
  prep_ready: number;
  prep_total: number;
  prep_error: string | null;
  difficulty: ExamDifficulty;
  remaining_seconds: number;
  questions: ExamQuestion[];
}

export interface ExamTemplate {
  code: string;
  name: string;
  description: string;
  duration_minutes: number;
  total_questions: number;
  subject_distribution: Record<string, { mcq: number; numerical: number }>;
  default_marks: number;
  default_negative_marks: number;
}

export interface ExamBankStatus {
  template: ExamTemplate;
  difficulty: ExamDifficulty;
  subjects: { subject: ExamSubject; needed: { mcq: number; numerical: number }; available: { mcq: number; numerical: number }; to_generate: number }[];
  to_generate: number;
  estimated_minutes: number;
}

export interface ExamHistoryItem {
  id: string;
  title: string;
  status: ExamStatus;
  total_score: number | null;
  max_score: number;
  accuracy: number;
  correct_count: number;
  incorrect_count: number;
  unanswered_count: number;
  started_at: string;
  submitted_at: string | null;
}

export interface ExamReviewQuestion {
  id: string;
  order_index: number;
  subject: ExamSubject;
  topic: string;
  difficulty: string;
  question_type: ExamQuestionType;
  question_text: string;
  options: string[];
  selected_option: string | null;
  correct_answer: string;
  is_correct: boolean;
  marks_awarded: number;
  time_spent_seconds: number;
  explanation: string;
  source_ref: string | null;
}

export interface ExamWeakTopic {
  subject: ExamSubject;
  topic: string;
  correct: number;
  incorrect: number;
  unanswered: number;
  overall_accuracy: number | null;
  weak_severity: "high" | "medium" | "low" | "none";
}

export interface ExamResult {
  attempt_id: string;
  title: string;
  total_score: number;
  max_score: number;
  correct_count: number;
  incorrect_count: number;
  unanswered_count: number;
  accuracy: number;
  time_spent_seconds: number;
  subject_breakdown: Record<string, { score: number; max_score: number; correct: number; incorrect: number; unanswered: number }>;
  weak_topics: ExamWeakTopic[];
  difficulty: ExamDifficulty;
  difficulty_breakdown: Record<string, { total: number; correct: number }>;
  next_difficulty: ExamDifficulty;
  submitted_at: string;
  questions: ExamReviewQuestion[];
}

export interface ExamAnswerUpdate {
  attempt_question_id: string;
  selected_option: string | null;
  marked_for_review: boolean;
  time_spent_seconds: number;
}

export type WeakSeverity = "none" | "low" | "medium" | "high";

export interface TopicProgress {
  subject: string;
  topic: string;
  attempted: number;
  correct: number;
  accuracy: number;
  weak_severity: WeakSeverity;
  last_attempted_at: string;
}

export interface SubjectProgress {
  subject: string;
  attempted: number;
  correct: number;
  accuracy: number;
  topics_count: number;
  weak_count: number;
}

export interface ProgressActivity {
  kind: "daily" | "exam";
  id: string;
  title: string;
  submitted_at: string;
  score: number;
  max_score: number;
  accuracy: number;
  correct: number;
  total: number;
}

export interface ProgressReport {
  stats: {
    questions_attempted: number;
    questions_correct: number;
    accuracy: number;
    daily_sets_completed: number;
    exams_completed: number;
    exam_minutes: number;
    current_streak: number;
  };
  subjects: SubjectProgress[];
  weak_topics: TopicProgress[];
  strong_topics: TopicProgress[];
  recent_activity: ProgressActivity[];
}

export interface DailyQuestion {
  id: string;
  order_index: number;
  subject: string;
  topic: string;
  difficulty: string;
  question_text: string;
  options: string[];
  marks: number;
  negative_marks: number;
  is_pyq: boolean;
  question_type: string;
}

export interface DailySet {
  id: string;
  set_date: string;
  target_exam: string;
  is_submitted: boolean;
  total_questions: number;
  questions: DailyQuestion[];
}

export interface DailyReviewQuestion {
  question_id: string;
  order_index: number;
  subject: string;
  topic: string;
  question_text: string;
  options: string[];
  selected_option: string | null;
  correct_answer: string;
  is_correct: boolean;
  marks_awarded: number;
  explanation: string;
}

export interface DailyResult {
  set_id: string;
  set_date: string;
  target_exam: string;
  score: number;
  max_score: number;
  correct_count: number;
  incorrect_count: number;
  unanswered_count: number;
  accuracy: number;
  submitted_at: string;
  counted_for_streak: boolean;
  questions: DailyReviewQuestion[];
}

export interface DailyStreak {
  current_streak: number;
  longest_streak: number;
  total_days_solved: number;
  solved_today: boolean;
  today: string;
  next_reset_at: string;
  calendar: { date: string; solved: boolean; accuracy: number | null }[];
}
