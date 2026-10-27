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

# Each answer is what docs/services-billing.md says the server does (27 October 2026): a card and 7 free days
# on the web, one trial per person, each person's week counted from their plan's start and never carried
# over, the app's line from 80% of it, upgrades at once less the unused time and downgrades at renewal,
# extra credits used after the week for 12 months, connections on every plan and the trial.
PRICING_QA = [
    ("How does the free trial work?", "Choose a plan and add a card. The first 7 days are free, with 10,000,000 credits to use. Then the plan's monthly price begins, or at once if you start it early. Cancel before then and you pay nothing. There is one free trial per person."),
    ("What is usage?", "The work your agents do for you, counted in credits. Each plan includes credits for the week, which start again every seven days from the day your plan began and don't carry over. Pro includes 3.5 times Standard's, and Max 9 times."),
    ("What happens if I use it all?", "Your agents wait until your week starts again. The app tells you as you get close. You can move to a bigger plan, which starts at once with a fresh week, or buy extra credits on the web."),
    ("Can I change or cancel my plan?", "Yes, at any time, from Settings in the app or from your billing page. A bigger plan starts at once, and you pay its price less what's left of your current one. A smaller plan starts when your current one renews. Cancel during the free trial and you are never charged."),
    ("What are extra credits?", "Credits for when your week runs out: 3,000,000 for $10, bought on the web on any paid plan. They're used only after your plan's weekly credits, and last 12 months."),
    ("Do the computers, apps or teams cost extra?", "No. Each agent's computer in the cloud, every app you connect and every team you add from the Marketplace come with every plan, the free trial too. Their work counts toward your plan's usage."),
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
    page = frame("Pricing", "Simeon's plans: Standard at $30, Pro at $100 and Max at $200 a month. Every plan starts with a 7-day free trial.",
                 "/pricing", body, hero_css + home_css + PRICING_CSS, current="pricing")
    root = os.path.join(out, "pricing")
    shutil.rmtree(root, ignore_errors=True)
    os.makedirs(root)
    open(f"{root}/index.html", "w", encoding="utf-8").write(version_style(page, out))
    print(f"pricing page written to {os.path.abspath(root)}")


if __name__ == "__main__":
    build()
