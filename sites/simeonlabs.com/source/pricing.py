"""Builds the website's Pricing page (/pricing).

The founder, 23 October 2026: "add an actual pricing page taken from main, with
a logical q and a and cta". It opens as the other pages do (the home page's
opening: a plain headline on the left, Download for macOS and Request a demo
under it, Download for iOS on a phone), then the home page's plans, read from
source/page.html so the prices are written once (teams.from_home); then
questions on paying, each one what the server really does
(docs/services-billing.md); then the home page's closing call.

It rewrites public/pricing/ from scratch; build.py calls it after
connectors.py, and it runs alone too, needing nothing but Python:

    python3 pricing.py
"""
import os, re, shutil

import teams
from teams import frame
from versioning import version_style

OUT = teams.OUT

# Each answer is what docs/services-billing.md says the server does: a card and 30 free days on the web, one
# trial per person, the week's credits reset on Monday and never carried over, the app's line from 80% of
# them, Stripe's portal to change or cancel, connections on every plan and the trial.
PRICING_QA = [
    ("How does the free month work?", "Choose a plan and add a card. The first 30 days are free, then the plan's monthly price begins. Cancel before then and you pay nothing. There is one free month per person."),
    ("What is usage?", "The work your agents do for you. Each plan includes an amount for the week, which resets every Monday and doesn't carry over. Pro includes 3.5 times Standard's, and Max 12 times."),
    ("What happens if I use it all?", "Your agents wait until Monday, when it resets. The app tells you as you get close, and you can move to a bigger plan at any time."),
    ("Can I change or cancel my plan?", "Yes, at any time, from Settings in the app or from your billing page. Cancel during the free month and you are never charged."),
    ("Do the computers, apps or teams cost extra?", "No. Each agent's computer in the cloud, every app you connect and every team you add from the Marketplace come with every plan, the free month too. Their work counts toward your plan's usage."),
    ("How do I pay?", "By card, through Stripe, in US dollars, billed monthly."),
    ("What do I need?", "A Mac with Apple silicon on macOS 15 or later."),
]

PRICING_CSS = """
/* Pricing: the plans right under the headline, closer than a section's usual room. */
.hero+.trust{padding-top:clamp(40px,3.2*var(--vw,1vw),64px)}
"""


def build(out=OUT):
    teams.copy_site_css(out)
    hero_css, ctas = teams.home_hero()
    plans, close, home_css = teams.from_home()
    # The page's headline names it, so the plans lose the home page's "Pricing" title over them.
    plans, found = re.subn(r'\s*<div class="trust-top">\s*<h2>Pricing</h2>\s*</div>', "", plans, count=1)
    assert found == 1, "pricing.py: the home page's pricing has no Pricing title to take off"
    body = f"""<section class="hero" aria-label="Pricing">
  <div class="wrap">
    <h1>Pricing and plans</h1>
    {ctas}
  </div>
</section>

{plans}

{teams.questions(PRICING_QA)}

{close}"""
    page = frame("Pricing", "Simeon's plans: Standard at $30, Pro at $100 and Max at $200 a month. Every plan starts with a free month.",
                 "/pricing", body, hero_css + home_css + PRICING_CSS, current="pricing")
    root = os.path.join(out, "pricing")
    shutil.rmtree(root, ignore_errors=True)
    os.makedirs(root)
    open(f"{root}/index.html", "w", encoding="utf-8").write(version_style(page, out))
    print(f"pricing page written to {os.path.abspath(root)}")


if __name__ == "__main__":
    build()
