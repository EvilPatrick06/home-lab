"""Corpus-driven accuracy + confusion-matrix eval for the Tier-2 keyword router.

The existing test_0_routing_accuracy.py has per-case example assertions but no
aggregate accuracy number and no confusion matrix — so a newly-added keyword
that is a substring of another agent's utterances can silently steal routes
without failing a test unless someone already pinned that exact pair.

This harness loads a labeled corpus (fixtures/router_corpus.json), routes every
utterance through the real AgentRouter Tier-2 keyword path, computes an overall
accuracy, builds a confusion matrix, and:
  - FAILS if accuracy drops below ACCURACY_FLOOR (catches a keyword collision
    regression across the whole corpus, not just pinned pairs),
  - prints the top confused (expected -> got) agent pairs on failure so the
    offending keyword collision is immediately visible.

Adding a keyword that steals routes now reddens this eval; extend the corpus
when you add an agent / tricky generic phrase.
"""
import json
import os
from collections import Counter, defaultdict

import pytest

from agents.router import AgentRouter

ACCURACY_FLOOR = 0.90

_FIXTURE = os.path.join(os.path.dirname(__file__), "fixtures", "router_corpus.json")


def _load_corpus():
    with open(_FIXTURE, encoding="utf-8") as f:
        return json.load(f)["cases"]


@pytest.fixture
def router():
    # No LLM function: Tier-3 disabled, so we measure the deterministic
    # prefix + keyword path (the surface the corpus is written against).
    return AgentRouter(llm_func=None, settings=None)


def _evaluate(router, cases):
    """Route every case; return (accuracy, confusion, misroutes)."""
    confusion = defaultdict(Counter)   # expected -> Counter(got)
    misroutes = []
    correct = 0
    for c in cases:
        got = router.route(c["utterance"])
        expected = c["expected"]
        confusion[expected][got] += 1
        if got == expected:
            correct += 1
        else:
            misroutes.append((expected, got, c["utterance"]))
    accuracy = correct / len(cases) if cases else 1.0
    return accuracy, confusion, misroutes


class TestRouterAccuracyEval:
    def test_corpus_is_non_trivial(self):
        cases = _load_corpus()
        # Guard the guard: a corpus that shrank to nothing would pass vacuously.
        assert len(cases) >= 25
        assert len({c["expected"] for c in cases}) >= 8  # covers multiple agents

    def test_accuracy_above_floor(self, router):
        cases = _load_corpus()
        accuracy, confusion, misroutes = _evaluate(router, cases)

        if accuracy < ACCURACY_FLOOR:
            lines = [f"Router accuracy {accuracy:.1%} < floor {ACCURACY_FLOOR:.0%}",
                     "Top confused (expected -> got) pairs:"]
            pair_counts = Counter((e, g) for e, g, _ in misroutes)
            for (exp, got), n in pair_counts.most_common(10):
                lines.append(f"  {exp} -> {got}  (x{n})")
            lines.append("Misrouted utterances:")
            for exp, got, utt in misroutes[:15]:
                lines.append(f"  [{exp} -> {got}] {utt}")
            pytest.fail("\n".join(lines))

    def test_no_agent_is_a_total_black_hole(self, router):
        """Every agent that appears as an expected label must win at least one
        of its own cases — catches a keyword deletion that strands an agent."""
        cases = _load_corpus()
        _, confusion, _ = _evaluate(router, cases)
        stranded = [exp for exp in confusion if confusion[exp][exp] == 0]
        assert not stranded, f"agents receiving none of their own routes: {stranded}"

    def test_confusion_matrix_is_diagonal_heavy(self, router):
        """Sanity: the diagonal (correct) should dominate the whole matrix."""
        cases = _load_corpus()
        _, confusion, _ = _evaluate(router, cases)
        diagonal = sum(confusion[e][e] for e in confusion)
        total = sum(sum(row.values()) for row in confusion.values())
        assert diagonal / total >= ACCURACY_FLOOR
