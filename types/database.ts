export type QuestionType = "multiple_choice" | "true_false" | "image" | "audio";
export type SessionStatus = "lobby" | "active" | "finished";
export type SessionState =
  | "lobby"
  | "ronde_intro"
  | "question_open"
  | "answer_reveal"
  | "leaderboard"
  | "finale"
  | "endscreen"
  | "paused"
  | "resuming";

export interface Quiz {
  id: string;
  title: string;
  description: string | null;
  created_at: string;
}

export interface Question {
  id: string;
  quiz_id: string;
  round: number;
  order: number;
  type: QuestionType;
  question_text: string;
  media_url: string | null;
  options: string[] | null;
  correct_answer: string;
  explanation: string | null;
  time_limit_seconds: number;
  base_points: number;
  is_double_points: boolean;
}

export interface Session {
  id: string;
  quiz_id: string;
  code: string;
  status: SessionStatus;
  current_question_id: string | null;
  state: SessionState;
  started_at: string | null;
  question_order?: string[];
}

export interface Player {
  id: string;
  session_id: string;
  name: string;
  score: number;
  joined_at: string;
  last_seen_at: string;
}

export interface Answer {
  id: string;
  session_id: string;
  player_id: string;
  question_id: string;
  answer: string;
  is_correct: boolean;
  response_time_ms: number;
  points_awarded: number;
  submitted_at: string;
}

export type Database = {
  public: {
    Tables: {
      quiz: { Row: Quiz; Insert: Omit<Quiz, "id" | "created_at">; Update: Partial<Quiz> };
      question: { Row: Question; Insert: Omit<Question, "id">; Update: Partial<Question> };
      session: { Row: Session; Insert: Omit<Session, "id">; Update: Partial<Session> };
      player: { Row: Player; Insert: Omit<Player, "id" | "joined_at">; Update: Partial<Player> };
      answer: { Row: Answer; Insert: Omit<Answer, "id" | "submitted_at">; Update: Partial<Answer> };
    };
  };
};
