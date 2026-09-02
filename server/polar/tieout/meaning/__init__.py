"""The meaning layer — what a row *is*, from the accountants' own dictionary.

Registered in `docs/pierce/taxonomy-coverage.md` before this package
existed. The engine reads the shape of every formula and nothing of
what its row means; the accounting standard-setters publish a
machine-readable dictionary of every line in a set of accounts, with
the sign it should carry, whether it is a balance or a movement, and
its names. This package loads that dictionary and names a row label
with a concept when it honestly can — or says it cannot.
"""

from .vocabulary import Concept, Match, Vocabulary, normalise, vocabulary

__all__ = ["Concept", "Match", "Vocabulary", "normalise", "vocabulary"]
