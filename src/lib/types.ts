export type Course = {
  id: string;
  name: string;
  code: string;
  color: string;
  semester: string;
  created_at: string;
  document_count?: number;
  topic_count?: number;
  assignment_count?: number;
};
export type Document = {
  id: string;
  course_id: string;
  name: string;
  extension: string;
  size: number;
  status: string;
  error: string;
  page_count: number;
  preview_path: string;
  created_at: string;
  course_name?: string;
  chunk_count?: number;
};
export type Chunk = {
  id: string;
  document_id: string;
  course_id: string;
  page: number;
  content: string;
  embedding: string | null;
  embedding_model: string;
  document_name?: string;
};
export type Question = {
  id: string;
  topic_id: string;
  difficulty: number;
  prompt: string;
  options: string[];
  answer?: string;
  explanation?: string;
  rubric?: string;
  status: string;
  source_page: number;
};
export type Attempt = {
  id: string;
  question_id: string;
  topic_id: string;
  answer: string;
  score: number;
  feedback: string;
  hinted: number;
  created_at: string;
  difficulty: number;
};
export type Mastery = {
  score: number | null;
  count: number;
  status: 'unassessed' | 'review' | 'developing' | 'provisional' | 'secure';
  label: string;
  due: boolean;
  nextReview: string | null;
};
export type Topic = {
  id: string;
  course_id: string;
  document_id: string;
  title: string;
  description: string;
  source_page: number;
  status: string;
  created_at: string;
  course_name?: string;
  question_count?: number;
  approved_count?: number;
  mastery?: Mastery;
};
export type Assignment = {
  id: string;
  course_id: string;
  title: string;
  due_at: string;
  timezone: string;
  hours: number;
  weight: number;
  completed: number;
  notes: string;
  revision: number;
  created_at: string;
  course_name?: string;
  color?: string;
};
export type Citation = {
  id: string;
  documentId: string;
  documentName: string;
  page: number;
  text: string;
};
export type Message = {
  id: string;
  course_id: string;
  role: 'user' | 'assistant';
  content: string;
  mode: string;
  citations: Citation[];
  created_at: string;
};
export type Notice = {
  id: string;
  assignment_id: string;
  title: string;
  body: string;
  read: number;
  created_at: string;
  email_status: string;
};
export type Job = {
  id: string;
  kind: string;
  target_id: string;
  status: string;
  error: string;
  created_at: string;
};
export type Settings = {
  timezone: string;
  dailyHours: number;
  aiConfigured: boolean;
  model: string;
  embeddingModel: string;
  emailConfigured: boolean;
  workerLastSeen: string | null;
  aiDailyLimit: number;
  aiUsed: number;
};
export type Snapshot = {
  courses: Course[];
  documents: Document[];
  topics: Topic[];
  assignments: Assignment[];
  notices: Notice[];
  jobs: Job[];
  settings: Settings;
};
