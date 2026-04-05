// types/api.ts

export interface Concept {
  id: string;
  label: string;
  children?: Concept[];
  related?: string[];
}

export interface Facet {
  id: string;
  label: string;
  concepts: Concept[];
}

export interface Topic {
  slug: string;
  name: string;
  description?: string;
  concepts?: string[];
}

// Базовые поля, общие для всех типов вопросов
export interface BaseQuestion {
  id: string;
  topic_slug: string;
  bloom_level: number;
  anchor: string;
  context_path: string;
  context_hash: string;
  stem: string;
  justification?: string | null;
  created_at: string;
}

// Payload для обычного тестового вопроса (MCQ)
export interface MCQQuestion extends BaseQuestion {
  q_type: "MCQ";
  payload: {
    options: Record<string, string>;
    correct_key: string;
    image_url?: string | null;
  };
}

// Payload для вопроса на соответствие (MATCHING)
export interface MatchingQuestion extends BaseQuestion {
  q_type: "MATCHING";
  payload: {
    pairs: {
      left: string;
      right: string;
    }[];
    distractors: string[];
  };
}

// Размеченное объединение: TypeScript сам поймет, какой payload доступен, опираясь на q_type
export type Question = MCQQuestion | MatchingQuestion;