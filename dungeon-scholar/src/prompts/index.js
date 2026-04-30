import { AWS_PROMPT, AWS_PROMPT_META } from './aws.js';
import { CISCO_PROMPT, CISCO_PROMPT_META } from './cisco.js';
import { CMMC_PROMPT, CMMC_PROMPT_META } from './cmmc.js';
import { COMPTIA_PROMPT, COMPTIA_PROMPT_META } from './comptia.js';
import { ECCOUNCIL_PROMPT, ECCOUNCIL_PROMPT_META } from './eccouncil.js';
import { GENERIC_PROMPT, GENERIC_PROMPT_META } from './generic.js';
import { GIAC_PROMPT, GIAC_PROMPT_META } from './giac.js';
import { GOOGLE_PROMPT, GOOGLE_PROMPT_META } from './google.js';
import { ISACA_PROMPT, ISACA_PROMPT_META } from './isaca.js';
import { ISC2_PROMPT, ISC2_PROMPT_META } from './isc2.js';
import { MICROSOFT_PROMPT, MICROSOFT_PROMPT_META } from './microsoft.js';

export const ORG_PROMPTS = [
  { ...AWS_PROMPT_META, prompt: AWS_PROMPT },
  { ...CISCO_PROMPT_META, prompt: CISCO_PROMPT },
  { ...CMMC_PROMPT_META, prompt: CMMC_PROMPT },
  { ...COMPTIA_PROMPT_META, prompt: COMPTIA_PROMPT },
  { ...ECCOUNCIL_PROMPT_META, prompt: ECCOUNCIL_PROMPT },
  { ...GIAC_PROMPT_META, prompt: GIAC_PROMPT },
  { ...GOOGLE_PROMPT_META, prompt: GOOGLE_PROMPT },
  { ...ISACA_PROMPT_META, prompt: ISACA_PROMPT },
  { ...ISC2_PROMPT_META, prompt: ISC2_PROMPT },
  { ...MICROSOFT_PROMPT_META, prompt: MICROSOFT_PROMPT },
  { ...GENERIC_PROMPT_META, prompt: GENERIC_PROMPT },
];
