export const MAX_BODY_BYTES: number
export const MAX_OUTPUT_BYTES: number
export class ServiceError extends Error { status: number; constructor(status: number, message: string) }
export function record(value: unknown): value is Record<string, unknown>
export interface MentorRequest { message: string; context: string; level: 1 | 2 | 3 | 4; allowSolution: boolean; locale?: 'en' | 'ceb' | 'fil' }
export interface ExecutionRequest { language: 'python' | 'php' | 'csharp'; code: string; input: string }
export interface ExecutionResult { stdout: string; stderr: string; exitCode: number; truncated: boolean }
export function validateMentor(value: unknown): MentorRequest
export function validateExecution(value: unknown): ExecutionRequest
export function validateExecutionResult(value: unknown): ExecutionResult
