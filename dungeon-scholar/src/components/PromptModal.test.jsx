import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import PromptModal from './PromptModal.jsx';

describe('PromptModal — Step 1 org picker', () => {
  it('renders 11 org buttons and a close button', () => {
    render(<PromptModal onClose={() => {}} />);
    expect(screen.getByRole('button', { name: /CompTIA/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Cisco/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /CMMC/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /AWS/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Microsoft/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Generic/i })).toBeInTheDocument();
  });

  it('calls onClose when X button is clicked', () => {
    const onClose = vi.fn();
    render(<PromptModal onClose={onClose} />);
    fireEvent.click(screen.getByLabelText(/close/i));
    expect(onClose).toHaveBeenCalledOnce();
  });
});

describe('PromptModal — Step 2 prompt viewer', () => {
  it('clicking an org button transitions to Step 2 with the correct prompt visible', () => {
    render(<PromptModal onClose={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /CompTIA/i }));
    expect(screen.getByText(/EXAM TARGET:/)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Security\+ SY0-701/i)).toBeInTheDocument();
  });

  it('back arrow returns to Step 1 and clears the input', () => {
    render(<PromptModal onClose={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /CompTIA/i }));
    const input = screen.getByPlaceholderText(/Security\+ SY0-701/i);
    fireEvent.change(input, { target: { value: 'Security+ SY0-701' } });
    expect(input.value).toBe('Security+ SY0-701');

    fireEvent.click(screen.getByLabelText(/back/i));
    fireEvent.click(screen.getByRole('button', { name: /CompTIA/i }));
    expect(screen.getByPlaceholderText(/Security\+ SY0-701/i).value).toBe('');
  });

  it('typing in the exam-target input updates the prompt preview', () => {
    render(<PromptModal onClose={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /CompTIA/i }));
    const input = screen.getByPlaceholderText(/Security\+ SY0-701/i);
    fireEvent.change(input, { target: { value: 'Security+ SY0-701' } });
    const prompt = screen.getByTestId('prompt-preview');
    expect(prompt.textContent).toMatch(/EXAM TARGET: Security\+ SY0-701/);
  });
});

describe('PromptModal — copy behavior', () => {
  beforeEach(() => {
    document.execCommand = vi.fn(() => true);
    // happy-dom defines navigator.clipboard as a getter-only property;
    // Object.assign cannot override it — use defineProperty instead.
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn(() => Promise.resolve()) },
      configurable: true,
      writable: true,
    });
  });

  it('clicking copy with empty exam-target writes the prompt with the leave-blank placeholder', () => {
    const execSpy = vi.spyOn(document, 'execCommand');
    render(<PromptModal onClose={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /CompTIA/i }));
    fireEvent.click(screen.getByRole('button', { name: /Copy the Spell/i }));
    expect(execSpy).toHaveBeenCalledWith('copy');
    expect(screen.getByTestId('prompt-preview').textContent).toMatch(/EXAM TARGET: <leave blank/);
  });

  it('clicking copy with a filled exam-target writes the substituted prompt', () => {
    render(<PromptModal onClose={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /CompTIA/i }));
    fireEvent.change(screen.getByPlaceholderText(/Security\+ SY0-701/i), {
      target: { value: 'CySA+ CS0-003' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Copy the Spell/i }));
    expect(screen.getByTestId('prompt-preview').textContent).toMatch(/EXAM TARGET: CySA\+ CS0-003/);
  });
});
