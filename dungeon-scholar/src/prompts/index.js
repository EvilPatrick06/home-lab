import { AWS_PROMPT, AWS_PROMPT_META } from './aws.js';
import { COMPTIA_PROMPT, COMPTIA_PROMPT_META } from './comptia.js';

export const ORG_PROMPTS = [
  { ...AWS_PROMPT_META, prompt: AWS_PROMPT },
  { ...COMPTIA_PROMPT_META, prompt: COMPTIA_PROMPT },
];
