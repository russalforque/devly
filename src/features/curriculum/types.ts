export interface Question {
  prompt: string
  options: string[]
  answer: number
  explanation: string
}

export interface Lesson {
  id: string
  trackId: string
  title: string
  subtitle: string
  minutes: number
  difficulty: 'Intermediate' | 'Advanced'
  objective: string
  prerequisites: string[]
  concept: string[]
  scenario: string
  code: string
  language: string
  mistakes: string[]
  exercise: string
  questions: Question[]
  summary: string
  next: string
  source: { label: string; url: string }
}

export interface Track {
  id: string
  name: string
  symbol: string
  color: string
  category: string
  description: string
  topics: string[]
  roadmap: string[]
  prerequisites: string
}
