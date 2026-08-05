"""Industry-benchmark table for the email analytics dashboard.

The audit (#10 / fix-list #29) flagged the previous benchmarks — two
hardcoded constants — as dishonest: they were exposed via the API as if
they were real data and were used to colour deltas. Authors building a
dashboard around "we're +2.1pt vs industry" need real numbers.

The default table here is sourced from Mailchimp's published 2024
"Email marketing benchmarks by industry" report. It's the most cited
public dataset for transactional + marketing email rates and is updated
yearly. We seed industry medians (open + click) per category and also
expose an `unsub_rate` median (from the same report's "industry
unsubscribe rate" column) so the unsub tile can render an honest
comparison too.

Per-organization overrides:
  organization.metadata['email_industry_benchmark_slug'] picks an
  industry by slug. Falls back to 'all_industries' (the median across
  every category) so unconfigured orgs see a sensible default rather
  than a category that doesn't fit them.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class IndustryBenchmark:
    slug: str
    label: str
    open_rate: float
    click_rate: float
    unsub_rate: float


# Source: Mailchimp Email Marketing Benchmarks 2024
# https://mailchimp.com/resources/email-marketing-benchmarks/
# All rates are percentages (e.g. open_rate=42.6 means 42.6%).
_BENCHMARKS: dict[str, IndustryBenchmark] = {
    b.slug: b
    for b in (
        IndustryBenchmark("all_industries", "All industries", 35.6, 2.6, 0.20),
        IndustryBenchmark("agriculture", "Agriculture & food services", 36.7, 2.6, 0.27),
        IndustryBenchmark("architecture", "Architecture & construction", 38.4, 2.5, 0.23),
        IndustryBenchmark("arts", "Arts & artists", 33.5, 2.7, 0.22),
        IndustryBenchmark("beauty", "Beauty & personal care", 33.4, 2.0, 0.23),
        IndustryBenchmark("business", "Business & finance", 38.6, 2.4, 0.20),
        IndustryBenchmark("computers", "Computers & electronics", 31.9, 2.0, 0.22),
        IndustryBenchmark("construction", "Construction", 33.2, 2.0, 0.27),
        IndustryBenchmark("consulting", "Consulting", 36.2, 2.4, 0.20),
        IndustryBenchmark("creative", "Creative services & agency", 36.0, 2.4, 0.27),
        IndustryBenchmark("ecommerce", "E-commerce", 34.7, 2.6, 0.18),
        IndustryBenchmark("education", "Education & training", 39.4, 3.4, 0.20),
        IndustryBenchmark("entertainment", "Entertainment & events", 35.1, 2.4, 0.18),
        IndustryBenchmark("gambling", "Gambling", 33.6, 3.0, 0.20),
        IndustryBenchmark("government", "Government", 40.5, 3.7, 0.13),
        IndustryBenchmark("health", "Health & fitness", 36.6, 3.0, 0.31),
        IndustryBenchmark("hobbies", "Hobbies", 41.4, 4.8, 0.21),
        IndustryBenchmark("home_garden", "Home & garden", 40.8, 3.5, 0.30),
        IndustryBenchmark("insurance", "Insurance", 41.5, 2.8, 0.18),
        IndustryBenchmark("legal", "Legal", 38.5, 3.0, 0.16),
        IndustryBenchmark("manufacturing", "Manufacturing", 33.7, 2.0, 0.27),
        IndustryBenchmark("marketing", "Marketing & advertising", 30.5, 2.0, 0.27),
        IndustryBenchmark("media", "Media & publishing", 31.3, 4.6, 0.16),
        IndustryBenchmark("medical", "Medical, dental & healthcare", 39.0, 2.5, 0.32),
        IndustryBenchmark("music", "Music & musicians", 35.2, 2.6, 0.22),
        IndustryBenchmark("non_profit", "Non-profit", 40.1, 2.6, 0.19),
        IndustryBenchmark("pharmaceuticals", "Pharmaceuticals", 37.4, 2.6, 0.16),
        IndustryBenchmark("photo_video", "Photography & video", 39.3, 2.8, 0.30),
        IndustryBenchmark("politics", "Politics", 35.4, 2.6, 0.27),
        IndustryBenchmark("professional_services", "Professional services", 38.2, 2.7, 0.20),
        IndustryBenchmark("public_relations", "Public relations", 32.5, 1.7, 0.16),
        IndustryBenchmark("real_estate", "Real estate", 36.3, 2.5, 0.21),
        IndustryBenchmark("recruitment", "Recruitment & staffing", 34.4, 1.8, 0.30),
        IndustryBenchmark("religion", "Religion", 41.7, 3.7, 0.16),
        IndustryBenchmark("restaurant", "Restaurants & food", 38.5, 2.4, 0.20),
        IndustryBenchmark("retail", "Retail", 34.1, 2.1, 0.19),
        IndustryBenchmark("software", "Software & web app", 33.0, 2.2, 0.32),
        IndustryBenchmark("sports", "Sports", 33.8, 2.7, 0.21),
        IndustryBenchmark("travel", "Travel & transportation", 34.8, 2.0, 0.18),
        IndustryBenchmark("vitamin", "Vitamin supplements", 31.5, 2.4, 0.27),
        IndustryBenchmark("wholesale", "Wholesale", 36.6, 2.7, 0.27),
    )
}

_DEFAULT_SLUG = "all_industries"


def get_industry_benchmark(slug: str | None) -> IndustryBenchmark:
    """Resolve a benchmark by slug, falling back to the cross-industry
    median when the slug is missing or unknown.
    """
    if slug:
        match = _BENCHMARKS.get(slug)
        if match is not None:
            return match
    return _BENCHMARKS[_DEFAULT_SLUG]


def list_industry_benchmarks() -> list[IndustryBenchmark]:
    """Sorted list of all benchmarks for the org-settings dropdown."""
    items = list(_BENCHMARKS.values())
    items.sort(key=lambda b: (b.slug != _DEFAULT_SLUG, b.label))
    return items
