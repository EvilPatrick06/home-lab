import { AWS_PROMPT, AWS_PROMPT_META } from './aws.js';
import { CISCO_PROMPT, CISCO_PROMPT_META } from './cisco.js';
import { COMPTIA_PROMPT, COMPTIA_PROMPT_META } from './comptia.js';

export const ORG_PROMPTS = [
  { ...AWS_PROMPT_META, prompt: AWS_PROMPT },
  { ...CISCO_PROMPT_META, prompt: CISCO_PROMPT },
  { ...COMPTIA_PROMPT_META, prompt: COMPTIA_PROMPT },
];
