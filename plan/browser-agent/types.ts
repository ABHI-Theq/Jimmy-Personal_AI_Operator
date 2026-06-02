export interface BrowserPlan {
  goal: string;
  steps: BrowserStep[];
  reasoning: string;
}

export interface BrowserStep {
  id: number;
  action: "navigate" | "click" | "type" | "extract" | "wait" | "observe" | "scroll";
  description: string;
  selector?: string;
  value?: string;
  waitFor?: string;
  extractSchema?: Record<string, string>;
}

export interface ExecutionResult {
  success: boolean;
  data?: unknown;
  error?: string;
  message: string;
  stepNumber: number;
  action: string;
}

export interface IterationResult {
  iteration: number;
  plan: BrowserPlan;
  execution: ExecutionResult[];
  evaluation: EvaluationResult;
  shouldContinue: boolean;
}

export interface EvaluationResult {
  satisfied: boolean;
  score: number; // 0-100
  feedback: string;
  completeness: number; // 0-100
  accuracy: number; // 0-100
  issues: string[];
}

export interface BrowserAgentConfig {
  maxIterations: number;
  timeout: number;
  model: string;
  apiKey: string;
  evaluationThreshold: number; // 0-100, default 80
}

export interface BrowserAgentResult {
  success: boolean;
  query: string;
  finalData: unknown;
  iterations: IterationResult[];
  totalIterations: number;
  completedAt: string;
  error?: string;
}
