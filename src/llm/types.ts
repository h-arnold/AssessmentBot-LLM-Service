import type { ModelParams } from '@google/generative-ai';
import { z } from 'zod';

/**
 * Type representing a single assessment criterion with score and reasoning.
 *
 * Each assessment criterion consists of a numerical score (0-5) and
 * a textual explanation for that score. This provides both quantitative
 * and qualitative feedback for assessment results.
 */
export type AssessmentCriterion = z.infer<typeof AssessmentCriterionSchema>;

/**
 * Zod schema for validating a single assessment criterion.
 *
 * Defines the structure and validation rules for individual assessment
 * criteria used in LLM-generated assessments.
 * @property {number} score - Integer between 0 and 5 representing the
 *   assessment score.
 * @property {string} reasoning - Non-empty string explaining the rationale for
 *   the score.
 */
export const AssessmentCriterionSchema = z.object({
  score: z.number().int().min(0).max(5),
  reasoning: z.string().min(1),
});

/**
 * Zod schema for validating complete LLM assessment responses.
 *
 * This schema ensures that LLM responses conform to the expected structure
 * with exactly three assessment criteria: completeness, accuracy, and SPAG
 * (Spelling, Punctuation, and Grammar).
 * @property {AssessmentCriterion} completeness - Assessment of how complete
 *   the response is.
 * @property {AssessmentCriterion} accuracy - Assessment of the factual accuracy
 *   of the response.
 * @property {AssessmentCriterion} spag - Assessment of spelling, punctuation,
 *   and grammar quality.
 */
export const LlmResponseSchema = z.object({
  completeness: AssessmentCriterionSchema,
  accuracy: AssessmentCriterionSchema,
  spag: AssessmentCriterionSchema,
});

export type GeminiModelParameters = ModelParams & {
  thinking?: { budget: number };
  systemInstruction?: string;
};

/**
 * Type representing a complete LLM assessment response.
 *
 * This type is inferred from the LlmResponseSchema and represents
 * the expected structure of assessment results returned by the LLM.
 * It contains three assessment criteria with scores and reasoning.
 */
export type LlmResponse = z.infer<typeof LlmResponseSchema>;
