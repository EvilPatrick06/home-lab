import { describe, it, expect } from 'vitest';
import { ORG_PROMPTS } from './index.js';

describe('ORG_PROMPTS', () => {
  it('is an array', () => {
    expect(Array.isArray(ORG_PROMPTS)).toBe(true);
  });

  it('every entry has the required metadata shape', () => {
    for (const p of ORG_PROMPTS) {
      expect(typeof p.id).toBe('string');
      expect(p.id).toMatch(/^[a-z0-9_]+$/);
      expect(typeof p.name).toBe('string');
      expect(typeof p.emoji).toBe('string');
      expect(typeof p.subtitle).toBe('string');
      expect(typeof p.examTargetPlaceholder).toBe('string');
      expect(Array.isArray(p.commonExams)).toBe(true);
      expect(typeof p.prompt).toBe('string');
    }
  });

  it('every id is unique', () => {
    const ids = ORG_PROMPTS.map(p => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every prompt contains the EXAM TARGET line', () => {
    for (const p of ORG_PROMPTS) {
      expect(p.prompt).toMatch(/EXAM TARGET:/);
    }
  });

  it('every prompt contains the shared schema marker', () => {
    for (const p of ORG_PROMPTS) {
      expect(p.prompt).toMatch(/=== JSON SCHEMA ===/);
    }
  });

  it('every prompt mentions the Domain knowledge-base requirement', () => {
    for (const p of ORG_PROMPTS) {
      expect(p.prompt).toMatch(/=== Domain/);
    }
  });

  it('every prompt mentions the fantasy-leak rule', () => {
    for (const p of ORG_PROMPTS) {
      expect(p.prompt).toMatch(/fantasy/i);
    }
  });

  it('every prompt contains both a good and a bad exemplar', () => {
    for (const p of ORG_PROMPTS) {
      expect(p.prompt).toMatch(/✅ GOOD/);
      expect(p.prompt).toMatch(/❌ BAD|❌ FANTASY LEAK|❌ NEVER/);
    }
  });
});

describe('CompTIA prompt', () => {
  it('is registered in ORG_PROMPTS', () => {
    const c = ORG_PROMPTS.find(p => p.id === 'comptia');
    expect(c).toBeDefined();
    expect(c.name).toBe('CompTIA');
    expect(c.commonExams).toContain('Security+ SY0-701');
  });

  it('CompTIA prompt mentions PBQ and BEST/MOST qualifiers', () => {
    const c = ORG_PROMPTS.find(p => p.id === 'comptia');
    expect(c.prompt).toMatch(/PBQ|performance-based/i);
    expect(c.prompt).toMatch(/BEST|MOST|FIRST/);
  });
});

describe('AWS prompt', () => {
  it('is registered with id="aws" and lists Security Specialty', () => {
    const a = ORG_PROMPTS.find(p => p.id === 'aws');
    expect(a).toBeDefined();
    expect(a.commonExams.some(e => e.includes('SCS'))).toBe(true);
  });

  it('mentions IAM, KMS, and Well-Architected', () => {
    const a = ORG_PROMPTS.find(p => p.id === 'aws');
    expect(a.prompt).toMatch(/IAM/);
    expect(a.prompt).toMatch(/KMS/);
    expect(a.prompt).toMatch(/Well-Architected/i);
  });
});

describe('Cisco prompt', () => {
  it('is registered with id="cisco" and lists CCNA', () => {
    const c = ORG_PROMPTS.find(p => p.id === 'cisco');
    expect(c).toBeDefined();
    expect(c.commonExams.some(e => e.includes('CCNA'))).toBe(true);
  });

  it('mentions IOS and CLI commands', () => {
    const c = ORG_PROMPTS.find(p => p.id === 'cisco');
    expect(c.prompt).toMatch(/IOS/);
    expect(c.prompt).toMatch(/show |configure terminal|CLI/);
  });
});

describe('CMMC prompt', () => {
  it('is registered with id="cmmc" and references NIST 800-171', () => {
    const c = ORG_PROMPTS.find(p => p.id === 'cmmc');
    expect(c).toBeDefined();
    expect(c.prompt).toMatch(/800-171/);
  });

  it('mentions Levels 1-3 and control assessment', () => {
    const c = ORG_PROMPTS.find(p => p.id === 'cmmc');
    expect(c.prompt).toMatch(/Level [123]/);
    expect(c.prompt).toMatch(/practice|control/i);
  });
});

describe('EC-Council prompt', () => {
  it('is registered with id="eccouncil" and lists CEH', () => {
    const e = ORG_PROMPTS.find(p => p.id === 'eccouncil');
    expect(e).toBeDefined();
    expect(e.commonExams.some(x => x.includes('CEH'))).toBe(true);
  });
  it('mentions kill chain and tools like nmap or Metasploit', () => {
    const e = ORG_PROMPTS.find(p => p.id === 'eccouncil');
    expect(e.prompt).toMatch(/kill[- ]chain|cyber kill chain/i);
    expect(e.prompt).toMatch(/nmap|Metasploit/i);
  });
});

describe('GIAC prompt', () => {
  it('is registered with id="giac" and lists GSEC + GCIH', () => {
    const g = ORG_PROMPTS.find(p => p.id === 'giac');
    expect(g).toBeDefined();
    expect(g.commonExams).toContain('GSEC');
    expect(g.commonExams).toContain('GCIH');
  });
  it('mentions open-book and tool output', () => {
    const g = ORG_PROMPTS.find(p => p.id === 'giac');
    expect(g.prompt).toMatch(/open[- ]book/i);
    expect(g.prompt).toMatch(/Wireshark|Volatility|Sysmon/);
  });
});

describe('Google prompt', () => {
  it('is registered with id="google" and lists Cloud Security Engineer', () => {
    const g = ORG_PROMPTS.find(p => p.id === 'google');
    expect(g).toBeDefined();
    expect(g.commonExams.some(e => e.includes('Cloud Security'))).toBe(true);
  });
  it('mentions GCP services like IAM, VPC SC, KMS', () => {
    const g = ORG_PROMPTS.find(p => p.id === 'google');
    expect(g.prompt).toMatch(/VPC SC|VPC Service Controls/);
    expect(g.prompt).toMatch(/Cloud KMS|Cloud IAM/);
  });
});

describe('ISACA prompt', () => {
  it('is registered with id="isaca" and lists CISA + CISM', () => {
    const i = ORG_PROMPTS.find(p => p.id === 'isaca');
    expect(i).toBeDefined();
    expect(i.commonExams).toContain('CISA');
    expect(i.commonExams).toContain('CISM');
  });
  it('mentions audit and risk', () => {
    const i = ORG_PROMPTS.find(p => p.id === 'isaca');
    expect(i.prompt).toMatch(/audit/i);
    expect(i.prompt).toMatch(/risk/i);
  });
});

describe('(ISC)² prompt', () => {
  it('is registered with id="isc2" and lists CISSP', () => {
    const i = ORG_PROMPTS.find(p => p.id === 'isc2');
    expect(i).toBeDefined();
    expect(i.commonExams).toContain('CISSP');
  });
  it('mentions manager mindset and 8 domains', () => {
    const i = ORG_PROMPTS.find(p => p.id === 'isc2');
    expect(i.prompt).toMatch(/manager.{0,30}mindset|think like a manager/i);
    expect(i.prompt).toMatch(/8 domains|eight domains/i);
  });
});

describe('Microsoft prompt', () => {
  it('is registered with id="microsoft" and lists SC-200 + AZ-500', () => {
    const m = ORG_PROMPTS.find(p => p.id === 'microsoft');
    expect(m).toBeDefined();
    expect(m.commonExams).toContain('SC-200');
    expect(m.commonExams).toContain('AZ-500');
  });
  it('mentions KQL and Conditional Access', () => {
    const m = ORG_PROMPTS.find(p => p.id === 'microsoft');
    expect(m.prompt).toMatch(/KQL|Kusto/);
    expect(m.prompt).toMatch(/Conditional Access/);
  });
});
