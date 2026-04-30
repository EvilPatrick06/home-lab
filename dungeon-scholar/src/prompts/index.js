import { AWS_PROMPT, AWS_PROMPT_META } from './aws.js';
import { CISCO_PROMPT, CISCO_PROMPT_META } from './cisco.js';
import { CMMC_PROMPT, CMMC_PROMPT_META } from './cmmc.js';
import { COMPTIA_PROMPT, COMPTIA_PROMPT_META } from './comptia.js';
import { ECCOUNCIL_PROMPT, ECCOUNCIL_PROMPT_META } from './eccouncil.js';
import { GIAC_PROMPT, GIAC_PROMPT_META } from './giac.js';

export const ORG_PROMPTS = [
  { ...AWS_PROMPT_META, prompt: AWS_PROMPT },
  { ...CISCO_PROMPT_META, prompt: CISCO_PROMPT },
  { ...CMMC_PROMPT_META, prompt: CMMC_PROMPT },
  { ...COMPTIA_PROMPT_META, prompt: COMPTIA_PROMPT },
  { ...ECCOUNCIL_PROMPT_META, prompt: ECCOUNCIL_PROMPT },
  { ...GIAC_PROMPT_META, prompt: GIAC_PROMPT },
];
