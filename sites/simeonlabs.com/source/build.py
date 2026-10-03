"""Builds the Simeon website (sites/simeonlabs.com/public) from the Framer export.

Every script of the Framer page is removed (its runtime, editor bar, extension
and theme snippet); fonts and images are fetched once and served beside the
page; the hero runs the app-window demo in an iframe inside the hero box,
scaled from that box's own size, so it can never leave it.

    python3 build.py <demo bundle>

The demo bundle is desktop/dist/demo, made on a Mac with
`npm run package` then `node demo/build-demo.mjs` in desktop/.
"""
import asyncio, glob, hashlib, json, os, re, shutil, subprocess, sys, tempfile, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
OUT = os.path.join(HERE, "..", "public")
if len(sys.argv) < 2 or not os.path.isfile(os.path.join(sys.argv[1], "index.html")):
    sys.exit("usage: python3 build.py <demo bundle, e.g. desktop/dist/demo>")
APP = os.path.abspath(sys.argv[1])
TMP = tempfile.mkdtemp(prefix="simeon-site-")
shutil.rmtree(OUT, ignore_errors=True)
os.makedirs(f"{OUT}/fonts"); os.makedirs(f"{OUT}/img")

html = open(f"{HERE}/framer-export.html", encoding="utf-8").read()
html = re.sub(r"<script\b[^>]*>.*?</script>", "", html, flags=re.S | re.I)
html = re.sub(r"<link\b[^>]*modulepreload[^>]*>", "", html, flags=re.I)
html = re.sub(r"<iframe\b[^>]*>.*?</iframe>", "", html, flags=re.S | re.I)
assert "<script" not in html.lower()

def fetch(url, dest):
    if not os.path.exists(dest):
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=60) as r, open(dest, "wb") as f:
            f.write(r.read())

fonts = sorted(set(re.findall(r'url\("?(https://(?:framerusercontent\.com|fonts\.gstatic\.com)/[^")]+\.woff2)"?\)', html)))
for u in fonts:
    name = hashlib.sha1(u.encode()).hexdigest()[:16] + ".woff2"
    fetch(u, f"{OUT}/fonts/{name}")
    html = html.replace(u, f"fonts/{name}")
print(len(fonts), "fonts")

images = sorted(set(re.findall(r'Simeon le site_files/([A-Za-z0-9]+\.png)', html)))
for name in images:
    # The hero picture is drawn about 1080 px wide, twice that on a retina screen.
    size = "" if name.startswith("0tXvc1") else "?scale-down-to=1024"
    fetch(f"https://framerusercontent.com/images/{name}{size}", f"{OUT}/img/{name}")
print(len(images), "images")

# Connectors: the repository's own logos and brand colours (desktop/brand/app-logos).
LOGOS = f"{REPO}/desktop/brand/app-logos"
APPS = {a["key"]: a for a in json.load(open(f"{LOGOS}/apps.json"))}
os.makedirs(f"{OUT}/logos")
def logo(key):
    a = APPS[key]
    src = f"{LOGOS}/{a['logo']}"
    name = key + os.path.splitext(a["logo"])[1]
    if a["mono"]:
        svg = open(src).read().replace("<svg ", f'<svg fill="{a["color"]}" ', 1)
        open(f"{OUT}/logos/{name}", "w").write(svg)
    else:
        shutil.copy(src, f"{OUT}/logos/{name}")
    return f"logos/{name}", a["name"], a["color"]
ROW1 = ["notion", "linkedin", "slack", "gmail", "linear", "hubspot", "google-calendar"]
ROW2 = ["salesforce", "github", "figma", "zoom", "stripe", "google-drive", "jira"]
ORBIT = ["slack", "gmail", "notion", "figma", "linear", "google-drive", "hubspot", "zoom", "linkedin", "google-calendar", "stripe", "salesforce"]
def pill(key):
    src, name, _ = logo(key)
    return f'<span class="sd-pill"><img src="{src}" alt="" width="22" height="22"><span>{name}</span></span>'
def row(keys, cls, reverse):
    items = "".join(pill(k) for k in keys)
    # Two copies, so the track can slide by half its width and loop without a seam.
    return (f'<div class="{cls} sd-marquee" data-framer-name="Row"><div class="sd-track{" sd-reverse" if reverse else ""}">'
            f'<div class="sd-set">{items}</div><div class="sd-set" aria-hidden="true">{items}</div></div></div>')
# Every name whole: the chips wrap instead of sliding past the edge of the column.
TICKER = row(ROW1, "framer-q489ce", False) + row(ROW2, "framer-1legnp", True)

# Agents talking: bubbles arrive left (Simeon) and right (Scout, Yodo), apps named inline with their logos.
def readable(hex_):
    r, g, b = (int(hex_[i:i + 2], 16) / 255 for i in (1, 3, 5))
    lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
    if lum < 0.45: return hex_
    k = 0.45 / lum
    return "#" + "".join(f"{round(c * k * 255):02x}" for c in (r, g, b))
def chip(key):
    src, name, color = logo(key)
    color = readable(color)
    return f'<span class="sd-app"><span class="sd-app-ico"><img src="{src}" alt=""></span><span style="color:{color}">{name}</span></span>'
# Faces: the app's own cloud, recoloured so none of them reads as the hero's Simeon, Scout or Yodo.
AGENT_LOOK = {"iris": ("Iris", "scout", "hue-rotate(90deg)"),
              "otto": ("Otto", "yodo", "hue-rotate(60deg)"),
              "nova": ("Nova", "yodo", "hue-rotate(300deg)")}
# A different cast and different apps from the hero: a marketing team closing out a campaign.
TALK = [
    ("iris", "left", f"Otto, how did the spring campaign do? Pull it from {chip('stripe')} and {chip('hubspot')}."),
    ("otto", "right", "$48,200 from 312 new customers. Cost per signup is down 18% since March."),
    ("iris", "left", f"Nova, can you turn that into a one-pager? The brand kit is in {chip('figma')}."),
    ("nova", "right", f"Draft is ready in {chip('google-slides')}, with the chart from Otto's {chip('google-sheets')} sheet."),
    ("iris", "left", f"Love it. I'll schedule the post for Monday on {chip('linkedin')}."),
]
os.makedirs(f"{OUT}/faces", exist_ok=True)
for face in ("simeon", "scout", "yodo"): shutil.copy(f"{HERE}/faces/{face}.png", f"{OUT}/faces/{face}.png")
def bubble(who, side, text, typing=False):
    name, face, tint = AGENT_LOOK[who]
    body = '<span class="sd-typing"><i></i><i></i><i></i></span>' if typing else text
    return (f'<div class="sd-msg sd-{side}{" sd-is-typing" if typing else ""}"><img class="sd-av" src="faces/{face}.png" alt="" style="filter:{tint} drop-shadow(0 4px 8px rgba(0,0,0,.18))">'
            f'<div class="sd-col"><span class="sd-who">{name}</span><div class="sd-bub">{body}</div></div></div>')
def face(who):
    name, f, tint = AGENT_LOOK[who]
    return f'<img class="sd-av" src="faces/{f}.png" alt="" style="filter:{tint} drop-shadow(0 4px 8px rgba(0,0,0,.18))">'
def say(who, side, html, cls=""):
    return (f'<div class="sd-msg sd-{side} {cls}">{face(who)}<div class="sd-col"><span class="sd-who">{AGENT_LOOK[who][0]}</span>'
            f'<div class="sd-bub">{html}</div></div></div>')
xero_src = logo("xero")[0]
# "Every agent works with its own computer": a calm window on Otto's machine, Xero's sign-in open,
# and one note from Otto that changes once you are in.
VM_HTML = ('<div class="sd-scene sd-vm-scene" aria-label="Otto asks you to sign in to Xero on its own computer">'
  '<div class="sd-sheet"><div class="sd-screen-prev">'
  '<span class="sd-prev-live"><i></i>Live</span>'
  f'<div class="sd-prev-win"><div class="sd-prev-form"><img src="{xero_src}" alt="Xero"><span class="sd-prev-line"></span><span class="sd-prev-line"></span><span class="sd-prev-btn"></span></div>'
  '<div class="sd-prev-ok"><span class="sd-check"></span>Signed in</div></div>'
  f'<span class="sd-prev-cap">{face("otto")}Otto\'s computer</span></div>'
  '<div class="sd-sheet-h">Otto needs you to sign in</div>'
  f'<div class="sd-sheet-b">{chip("xero")} is open on Otto\'s computer. Sign in once and Otto can close the books for March.</div>'
  '<div class="sd-sheet-btns"><span class="sd-deny">Not Now</span><span class="sd-allow">Sign In</span></div>'
  '<div class="sd-sheet-done"><span class="sd-check"></span>Signed in. Otto is closing March.</div></div>'
  '</div>')
# "Stay in control": a permission sheet, as the system would ask it.
APPROVE_HTML = ('<div class="sd-scene sd-ok-scene" aria-label="Iris asks for approval before sending the launch email">'
  f'<div class="sd-sheet"><div class="sd-sheet-face">{face("iris")}</div>'
  '<div class="sd-sheet-h">Iris would like to send an email</div>'
  f'<div class="sd-sheet-b">The spring launch email, from {chip("outlook")}, to 2,408 subscribers on Monday at 9:00.</div>'
  '<div class="sd-sheet-btns"><span class="sd-deny">Don\'t Allow</span><span class="sd-allow">Allow</span></div>'
  '<div class="sd-sheet-done"><span class="sd-check"></span>Approved. Sending Monday at 9:00.</div></div>'
  '</div>')
# The whole thread is there; the only motion is Otto typing the next reply at the bottom.
TALK_HTML = ('<div class="sd-talk" aria-label="Iris, Otto and Nova passing work between them"><div class="sd-feed">'
  + "".join(bubble(*m) for m in TALK[:3])
  + "".join(bubble(*m).replace('class="sd-msg ', 'class="sd-msg sd-late ', 1) for m in TALK[3:])
  + '</div></div>')

# The phone hero: a still of the app, drawn by the page, nothing to load, scroll or touch.
# Simeon's thread with both sides talking, the agents down the left as the window shows them.
shutil.copy(f"{REPO}/desktop/brand/file-icons/word.webp", f"{OUT}/logos/word.webp")
def mface(f, tint=""):
    return f'<img src="faces/{f}.png" alt="" style="{"filter:" + tint if tint else ""}">'
def tag(f, name, color):
    return f'<span class="sd-m-tag" style="color:{color}"><img src="faces/{f}.png" alt="">{name}</span>'
PLUS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>'
MIC = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>'
CLOCK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>'
rail = "".join(f'<span class="sd-m-av{" sd-m-on" if i == 0 else ""}">{mface(f, t)}</span>' for i, (f, t) in enumerate([
    ("simeon", ""), ("scout", ""), ("yodo", ""), ("scout", "hue-rotate(90deg)"), ("yodo", "hue-rotate(60deg)"), ("yodo", "hue-rotate(300deg)")]))
group = '<span class="sd-m-av sd-m-group">' + mface("simeon") + mface("scout") + mface("yodo") + '</span>'
MOBILE_HTML = ('<div class="sd-mob" aria-label="Simeon, a chief of staff agent, talking with you about a launch">'
  '<div class="sd-m-rail"><span class="sd-m-lights"><i></i><i></i><i></i></span>' + rail + group
  + '<span class="sd-m-fill"></span><span class="sd-m-new">' + PLUS + '</span><span class="sd-m-me">BF</span></div>'
  '<div class="sd-m-main"><div class="sd-m-head">' + mface("simeon") + '<b>Simeon</b><span class="sd-m-role">Chief of staff</span></div>'
  '<div class="sd-m-thread"><div class="sd-m-feed">'
  f'<div class="sd-m-in">Thursday is on track: 12 of 15 launch tickets are done in {chip("linear")}, and the review is Thursday at 2 pm.</div>'
  '<div class="sd-m-sys">Messages from ' + tag("scout", "Scout", "#3f7f78") + ' and ' + tag("yodo", "Yodo", "#b0603c") + '</div>'
  '<div class="sd-m-in">' + tag("scout", "Scout", "#3f7f78") + ' pulled three customer quotes and ' + tag("yodo", "Yodo", "#b0603c") + ' closed the last two tickets. The review doc is ready.</div>'
  '<div class="sd-m-file"><img src="logos/word.webp" alt="">Launch review.docx</div>'
  '<div class="sd-m-out">Looks great. Send the agenda to Dana and Marcus, and check in like this every Monday.<span class="sd-m-react">&#128077;</span></div>'
  '<div class="sd-m-sys">Created routine <span class="sd-m-clock">' + CLOCK + '</span><b>Monday launch check</b></div>'
  f'<div class="sd-m-in">Done. The agenda went out from {chip("gmail")}.</div>'
  '</div></div>'
  '<div class="sd-m-compose"><span class="sd-m-plus">' + PLUS + '</span><span class="sd-m-ph">Message Simeon</span><span class="sd-m-mic">' + MIC + '</span></div>'
  '</div></div>')

mark = open(f"{HERE}/simeon-mark.svg").read()
open(f"{OUT}/logos/simeon.svg", "w").write(mark)
orbit_items = "".join(f'<img class="sd-orb" src="{logo(k)[0]}" alt="{logo(k)[1]}" data-color="{logo(k)[2]}">' for k in ORBIT)
ORBIT_HTML = f'<div class="sd-orbit" aria-label="Simeon connects to your apps">{orbit_items}<div class="sd-tile"><img src="logos/simeon.svg" alt="Simeon"></div></div>'
open(f"{TMP}/stripped.html", "w", encoding="utf-8").write(html)

# The sections the founder asked for on 3 October 2026 ("make it like Viktor but keep our style"):
# what Simeon is for a founder, drawn in the page's own type, paintings and glass. Every claim is
# one the product makes today; no customer logos, quotes or counts.
PAINT_HERO, PAINT_GREEN, PAINT_PASTEL, PAINT_TEAL = ("img/0tXvc1jb6FDg9uTgj0fOQDEvw.png", "img/NyYo9oaKLvMl0yl5Zo5bxltZo.png",
                                                     "img/cREyxkDc4xqmbAOWrToek1PlTM.png", "img/ndcsiJlnsYoCCrA6LZUWC0vWxC0.png")
for p in (PAINT_GREEN, PAINT_PASTEL, PAINT_TEAL):
    assert p[4:] in images, p
FACES = {"simeon": ("simeon", ""), "scout": ("scout", ""), "yodo": ("yodo", ""),
         "iris": ("scout", "hue-rotate(90deg)"), "otto": ("yodo", "hue-rotate(60deg)"), "nova": ("yodo", "hue-rotate(300deg)")}
def rface(who, cls="sd-rf"):
    f, tint = FACES[who]
    return f'<img class="{cls}" src="faces/{f}.png" alt="" style="{"filter:" + tint if tint else ""}">'
def head(title, grey, cls=""):
    return f'<div class="sd-head {cls}"><h2>{title}</h2><p>{grey}</p></div>'
def mini(key):
    src, name, _ = logo(key)
    return f'<span class="sd-mini"><img src="{src}" alt="">{name}</span>'

# A typical founder's team: one job each, the apps each works in.
ROSTER = [
    ("simeon", "Chief of Staff", "Runs the team. Weekly priorities, follow-ups and the big picture, in five lines on Friday.", ["notion", "google-calendar"]),
    ("scout", "Inbox", "Sorts your email, drafts the replies and flags what needs you. Never sends without your OK.", ["gmail", "outlook"]),
    ("yodo", "Money", "Revenue, failed payments, overdue invoices and runway, every Monday morning.", ["stripe", "quickbooks"]),
    ("iris", "Growth", "Traffic, signups and what is working, with the numbers to back it.", ["hubspot", "google-sheets"]),
    ("nova", "Content", "Posts, newsletters, decks and graphics, in your voice and your brand.", ["linkedin", "canva"]),
    ("otto", "Sales", "Leads, follow-ups after every call, and a pipeline that never goes stale.", ["salesforce", "calendly"]),
]
ROSTER_HTML = ('<section class="sd-sec sd-roster-sec" data-sd="roster"><div class="sd-wrap">'
  + head("Meet your operations team", "One agent for each job that keeps a business running. Start with the roles you need, rename them, add more as you grow.")
  + f'<div class="sd-roster"><img class="sd-paint" src="{PAINT_GREEN}" alt="" loading="lazy"><div class="sd-roster-grid">'
  + "".join(f'<article class="sd-role">{rface(who)}<div class="sd-role-t"><h3>{name}</h3><p>{text}</p>'
            f'<div class="sd-role-apps">{"".join(mini(k) for k in apps)}</div></div></article>' for who, name, text, apps in ROSTER)
  + '</div></div><p class="sd-note">A typical founder\'s team. Every agent has its own computer in the cloud and talks to the others.</p></div></section>')

# How it works, in three steps, each over a crop of a painting with one piece of the app on glass.
STEPS = [
    ("1", "Pick your team", "Ask Simeon for the help you need and it adds an agent for each job: inbox, money, content, sales.",
     PAINT_HERO, "20% 60%", '<div class="sd-g sd-g-team">' + "".join(f'<span>{rface(w, "sd-gf")}{n}</span>' for w, n in (("simeon", "Chief of Staff"), ("yodo", "Money"), ("scout", "Inbox"))) + '</div>'),
    ("2", "Connect your tools", "When an agent needs an app, it shows you a card. Tap Add and sign in on the app's own page. No passwords in chat.",
     PAINT_TEAL, "70% 40%", f'<div class="sd-g sd-g-add"><span class="sd-g-ico"><img src="{logo("stripe")[0]}" alt=""></span><span class="sd-g-txt"><b>Stripe</b>Payments, invoices, customers</span><span class="sd-g-btn">Add</span></div>'),
    ("3", "Ask, then let it run", "Say what you need in plain words. Anything you do every week becomes a routine that runs on its own.",
     PAINT_PASTEL, "60% 50%", '<div class="sd-g sd-g-rt"><span class="sd-g-clock">' + CLOCK + '</span><span class="sd-g-txt"><b>Monday numbers</b>Every Monday at 9:00</span><span class="sd-g-on"></span></div>'),
]
STEPS_HTML = ('<section class="sd-sec" data-sd="steps"><div class="sd-wrap">'
  + head("How it works", "No workflows to build. You tell your team what you need, the way you would tell staff.")
  + '<ol class="sd-steps">' + "".join(f'<li class="sd-step"><div class="sd-step-pic"><img class="sd-paint" src="{src}" alt="" loading="lazy" style="object-position:{pos}">{glass}</div>'
                                       f'<span class="sd-step-n">{n}</span><h3>{title}</h3><p>{text}</p></li>' for n, title, text, src, pos, glass in STEPS) + '</ol></div></section>')

# What a founder asks, by the part of the business it frees up. Each ask has the reply an agent gives.
USES = [
    ("Founders & CEOs", [
        ("simeon", "Who did I promise something to in last week's calls?", f'Four people. Drafts are ready for each in {chip("gmail")}; the one to Dana is due tomorrow.'),
        ("simeon", "Prep me for the board call on Thursday.", f'A one-page brief is in {chip("notion")}: revenue, hiring, the two open risks, and three questions they will ask.'),
        ("simeon", "Every Friday, send me the week in five lines.", 'Routine created. Friday at 17:00: what moved, what is stuck, what needs you on Monday.'),
    ]),
    ("Money & ops", [
        ("yodo", "How did we do last month?", f'$48,200 in revenue, up 12%. Two failed payments in {chip("stripe")}, already retried. One invoice is 30 days late.'),
        ("yodo", "Chase every invoice that is more than two weeks late.", f'Three polite reminders drafted from {chip("quickbooks")}. Approve them and they go out.'),
        ("yodo", "Put this month's receipts in the books.", f'26 receipts matched and filed in {chip("xero")}. Two need a category from you.'),
    ]),
    ("Growth & marketing", [
        ("nova", "Turn the launch note into a LinkedIn post and a graphic.", f'Post drafted in your voice and a graphic made in {chip("canva")}. Ready to schedule on {chip("linkedin")}.'),
        ("iris", "Which pages brought us signups this week?", f'Pricing and the comparison page, 61% between them. The full table is in {chip("google-sheets")}.'),
        ("nova", "Write this month's newsletter from what we shipped.", f'Draft is in {chip("mailchimp")}, with the three biggest updates first. Send on Tuesday?'),
    ]),
    ("Sales & customers", [
        ("otto", "Follow up with everyone I met at the conference.", f'14 contacts added to {chip("hubspot")} and a personal note drafted for each. Approve to send.'),
        ("otto", "Which deals have gone quiet?", f'Five with no reply in 10 days. A nudge is drafted for each, with your {chip("calendly")} link to book a call.'),
        ("scout", "Answer the support emails you can, and flag the rest.", f'Answered 9 in {chip("gmail")} from your help docs. Two refund requests are waiting for you.'),
    ]),
]
ON = ' class="sd-on"'
def use_card(who, ask, reply):
    name = {"simeon": "Chief of Staff", "yodo": "Money", "nova": "Content", "iris": "Growth", "otto": "Sales", "scout": "Inbox"}[who]
    return (f'<article class="sd-use"><p class="sd-ask">{ask}</p><div class="sd-reply">{rface(who, "sd-rf-s")}'
            f'<div><span class="sd-reply-who">{name}</span><p>{reply}</p></div></div></article>')
USES_HTML = ('<section class="sd-sec" data-sd="uses"><div class="sd-wrap">'
  + head("What you can hand off", "The work that keeps a business running, done inside the tools you already pay for.")
  + '<div class="sd-tabs" role="tablist" aria-label="Kind of work">'
  + "".join(f'<button type="button" role="tab" id="sd-tab-{i}" aria-controls="sd-uses-{i}" aria-selected="{str(i == 0).lower()}"{ON if i == 0 else ""}>{label}</button>' for i, (label, _) in enumerate(USES))
  + '</div>' + "".join(f'<div class="sd-uses" role="tabpanel" id="sd-uses-{i}" aria-labelledby="sd-tab-{i}"{"" if i == 0 else " hidden"}>{"".join(use_card(*u) for u in uses)}</div>' for i, (_, uses) in enumerate(USES))
  + '</div></section>')

# Simeon next to the two things a founder tries first. Kinds of product, not named rivals.
YES, PART, NO = '<span class="sd-cy">Yes</span>', '<span class="sd-cp">Partly</span>', '<span class="sd-cn">No</span>'
COMPARE = [
    ("Does the work inside your apps", PART, YES, YES),
    ("You ask in plain words", YES, NO, YES),
    ("Works out the steps on its own", YES, NO, YES),
    ("Keeps going when your laptop is closed", PART, YES, YES),
    ("A team with roles that pass work along", NO, NO, YES),
    ("Its own computer and browser", PART, NO, YES),
    ("Asks before sending, paying or deleting", PART, NO, YES),
]
COMPARE_HTML = ('<section class="sd-sec" data-sd="compare"><div class="sd-wrap">'
  + head("Not a chatbot. Not a workflow builder.", "A chatbot answers you. An automation app runs the steps you built. Simeon is a team that does the work.")
  + '<div class="sd-cmp-scroll"><table class="sd-cmp"><thead><tr><th scope="col"><span class="sd-vh">What it does</span></th><th scope="col">AI chatbots</th><th scope="col">Automation apps</th><th scope="col" class="sd-us">Simeon</th></tr></thead><tbody>'
  + "".join(f'<tr><th scope="row">{what}</th><td>{a}</td><td>{b}</td><td class="sd-us">{c}</td></tr>' for what, a, b, c in COMPARE)
  + '</tbody></table></div>'
  + '<p class="sd-note">And next to hiring: an operations hire costs thousands a month and works forty hours a week. Your team works around the clock from $20 a month.</p></div></section>')

# Every app in the connector catalogue (desktop/source/shared/node/vendor-mcp/catalog.ts), with its
# logo where the repository has one, by name where it does not yet.
CATALOG = list(dict.fromkeys(re.findall(r'\bid: "([a-z0-9-]+)"', open(f"{REPO}/desktop/source/shared/node/vendor-mcp/catalog.ts").read())))
assert len(CATALOG) == 66, len(CATALOG)
NAMES = {"monday": "monday.com", "wix": "Wix", "square": "Square", "ramp": "Ramp", "apollo": "Apollo", "onedrive": "OneDrive", "google-tasks": "Google Tasks",
         "brex": "Brex", "pipedrive": "Pipedrive", "docusign": "DocuSign", "klaviyo": "Klaviyo", "ashby": "Ashby", "google-analytics": "Google Analytics",
         "google-search-console": "Search Console", "kit": "Kit", "cal-com": "Cal.com", "attio": "Attio", "microsoft-teams": "Microsoft Teams",
         "mercury": "Mercury", "posthog": "PostHog"}
# Apps the repository has no logo for show the icon the app itself shows for them (the site icons in
# desktop/source/shared/node/vendor-mcp/logos.ts), saved once in app-favicons/. Google's three
# share one generic icon there, so they are named instead of drawn.
FAVICONS = sorted(os.path.splitext(n)[0] for n in os.listdir(f"{HERE}/app-favicons"))
def tile(k):
    if k in APPS:
        src, name, _ = logo(k)
    else:
        src, name = f"logos/{k}.png", NAMES[k]
        shutil.copy(f"{HERE}/app-favicons/{k}.png", f"{OUT}/{src}")
    return f'<li title="{name}"><img src="{src}" alt="{name}" loading="lazy"></li>'
drawn = [k for k in CATALOG if k in APPS or k in FAVICONS]
by_name = [NAMES[k] for k in CATALOG if k not in drawn]
assert len(drawn) == 63 and by_name == ["Google Tasks", "Google Analytics", "Search Console"], (len(drawn), by_name)
WALL_HTML = ('<section class="sd-sec" data-sd="apps"><div class="sd-wrap">'
  + head(f"{len(CATALOG)} apps, connected in a tap", "Sign in once on the app's own page and your agents use it from then on. Anything else they open in their own browser, like you would.")
  + '<ul class="sd-wall">' + "".join(tile(k) for k in drawn) + '</ul>'
  + '<p class="sd-wall-more">And ' + ", ".join(by_name[:-1]) + " and " + by_name[-1] + '.</p></div></section>')
EXTRA = {"roster": ROSTER_HTML, "steps": STEPS_HTML, "uses": USES_HTML, "compare": COMPARE_HTML, "wall": WALL_HTML}

SURGERY = r"""([TICKER, ORBIT_HTML, TALK_HTML, VM_HTML, APPROVE_HTML, MOBILE_HTML, EXTRA]) => {
  const gone = ['#__framer-badge-container', '#__framer-editorbar-container', '#hl-aria-live-message-container', '#hl-aria-live-alert-container'];
  gone.forEach((s) => document.querySelectorAll(s).forEach((n) => n.remove()));
  // Only the Framer editor bar and the extension used these; nothing else refers to them.
  document.querySelectorAll('style').forEach((st) => { if (/__framer-editorbar/.test(st.textContent)) st.remove(); });
  for (const img of document.querySelectorAll('img')) {
    const m = (img.getAttribute('src') || '').match(/Simeon le site_files\/([A-Za-z0-9]+\.png)/);
    if (m) img.setAttribute('src', 'img/' + m[1]);
    img.removeAttribute('srcset'); img.removeAttribute('sizes');
  }
  // Framer's appear animations start from opacity 0 and are finished by its
  // runtime; with no runtime they would stay invisible. The FAQ answers stay
  // hidden: they belong to closed rows.
  let shown = 0;
  for (const el of document.querySelectorAll('[style]')) {
    const o = el.style.opacity;
    if ((o === '0' || o === '0.001') && !el.classList.contains('framer-rl6bt5')) { el.style.opacity = '1'; shown++; }
  }
  // Same for the entrance offsets of those animations (the closing banner's picture sat 20 px short).
  for (const el of document.querySelectorAll('[data-framer-appear-id]')) el.style.transform = 'none';
  // Links leave the preview in a new tab instead of replacing it.
  // It is a preview to try: no button or link leads anywhere.
  for (const a of document.querySelectorAll('a')) { a.removeAttribute('href'); a.removeAttribute('target'); a.removeAttribute('rel'); }
  const heroSection = document.querySelector('section[data-framer-name="Hero"]');
  // What Simeon is, said first: an operations team for a business, and what is true of it today.
  heroSection.querySelectorAll('h1').forEach((h) => { h.textContent = 'Your AI operations team'; });
  heroSection.querySelector('.framer-52laz7').insertAdjacentHTML('afterend',
    '<p class="sd-lede">AI agents that run the busywork of your business inside the tools you already use. Each one has its own computer in the cloud, keeps working while you sleep, and asks before anything important.</p>');
  heroSection.querySelector('.framer-1pr7n1c-container').closest('.ssr-variant').insertAdjacentHTML('afterend',
    '<ul class="sd-proof"><li>7-day free trial</li><li>66 apps</li><li>Their own cloud computers</li><li>Asks before acting</li></ul>');
  const introHtml = 'Tell them what you need, like you would tell staff<span class="framer-text" style="--framer-text-color:var(--token-c206cc3b-6522-4028-8a20-1f745a747981, rgba(41, 41, 41, 0.6))"><br class="framer-text">'
    + 'Give your team a job and they take it from start to finish inside your tools, learn how your business works, and check in when they need you.</span>';
  document.querySelectorAll('section[data-framer-name="Intro"] h3').forEach((h) => { h.innerHTML = introHtml; });
  for (const img of document.querySelectorAll('img')) {
    if (heroSection.contains(img)) { img.removeAttribute('loading'); img.setAttribute('fetchpriority', 'high'); }
    else if (img.closest('section')) img.setAttribute('loading', 'lazy');
  }
  const hero = document.querySelector('section[data-framer-name="Hero"] .framer-115oxcp');
  const stage = document.createElement('div');
  stage.className = 'sd-stage';
  stage.innerHTML = '<div class="sd-frame"><div class="sd-bar"><span class="sd-dots"><i></i><i></i><i></i></span><span class="sd-title">Simeon</span></div>'
    + '<div class="sd-screen"><div class="sd-window"><picture class="sd-poster">'
    + '<source media="(min-width:1024px) and (min-height:620px) and (prefers-reduced-motion: no-preference)" srcset="app-poster-held.jpg"><source media="(max-width:599.98px)" srcset="data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw=="><source media="(max-width:809.98px)" srcset="app-poster-tall.jpg">'
    + '<img src="app-poster-wide.jpg" alt="" fetchpriority="high" decoding="sync"></picture>'
    + '<iframe data-hold data-src="app/index.html" title="Simeon, playing a launch week" loading="eager"></iframe></div></div></div>';
  hero.appendChild(stage);
  stage.insertAdjacentHTML('beforeend', MOBILE_HTML);
  // On a laptop the hero is a scroll scene: the painting spans the page with Simeon's wordmark,
  // narrows into the card as you scroll, and the app window rises onto it (HERO_JS).
  const paint = (hero.querySelector('.framer-es6gsc img') || hero.querySelector('img')).getAttribute('src');
  const logoSrc = document.querySelector('[data-framer-name="Logo"] img').getAttribute('src');
  stage.insertAdjacentHTML('beforebegin', '<div class="sd-bleed" aria-hidden="true"><img src="' + paint + '" alt="" fetchpriority="high"><i class="sd-fade"></i><i class="sd-cur sd-cur-l"></i><i class="sd-cur sd-cur-r"></i></div>'
    + '<div class="sd-word" role="img" aria-label="Simeon" style="-webkit-mask-image:url(' + logoSrc + ');mask-image:url(' + logoSrc + ')"></div>');
  const card = hero.closest('.framer-t7h7mm-container');
  const pin = document.createElement('div'); pin.className = 'sd-pin';
  const sticky = document.createElement('div'); sticky.className = 'sd-sticky';
  card.before(pin); pin.appendChild(sticky); sticky.appendChild(card);
  // "Connects to your apps": its ticker lists connectors, and its picture is the connector animation.
  const feature = [...document.querySelectorAll('section[data-framer-name="Feature"]')].find((sec) => /Connects to your apps/.test(sec.textContent));
  feature.querySelector('.framer-15163q8').innerHTML = TICKER;
  const box = feature.querySelector('.framer-115oxcp');
  // The painting stays underneath; the animation sits on it.
  box.insertAdjacentHTML('beforeend', ORBIT_HTML);
  const together = [...document.querySelectorAll('section[data-framer-name="Feature"]')].find((sec) => /Let your Agents work together/.test(sec.textContent));
  together.querySelector('.framer-115oxcp').insertAdjacentHTML('beforeend', TALK_HTML);
  const featureBox = (re) => [...document.querySelectorAll('section[data-framer-name="Feature"]')].find((sec) => re.test(sec.textContent)).querySelector('.framer-115oxcp');
  featureBox(/their own computers/).insertAdjacentHTML('beforeend', VM_HTML);
  featureBox(/Stay in control/).insertAdjacentHTML('beforeend', APPROVE_HTML);
  // Feature titles say what is true now: the agents' computers are in the cloud.
  const featureText = (re, title, sub) => {
    const sec = [...document.querySelectorAll('section[data-framer-name="Feature"]')].find((x) => re.test(x.textContent));
    const titles = sec.querySelectorAll('[data-framer-name="Title"] h4'), subs = sec.querySelectorAll('[data-framer-name="Subtitle"] h4');
    if (!titles.length || !subs.length) throw new Error('feature text not found: ' + title);
    titles.forEach((h) => { h.textContent = title; }); subs.forEach((h) => { h.textContent = sub; });
  };
  featureText(/Connects to your apps/, 'Works inside your tools', 'Gmail, Stripe, Notion, HubSpot and 60 more. Your agents use them the way you would, even the ones that are hard to navigate.');
  featureText(/their own computers/, 'Each agent has its own computer', 'A computer in the cloud with a full browser and its own files. Your agents keep working when your laptop is closed, and you can watch or step in at any point.');
  featureText(/Let your Agents work together/, 'Your agents work together', 'They pass work to each other and keep things moving, without you stepping in at every turn.');
  featureText(/Stay in control/, 'You stay in control', 'Sending an email, paying, publishing, deleting: your agents ask first, and you allow or refuse it in one tap.');
  // The new sections, in reading order: who is on the team after the intro; how it works, what to
  // hand off, how it compares and the apps after the features; then pricing.
  document.querySelector('section[data-framer-name="Intro"]').insertAdjacentHTML('afterend', EXTRA.roster);
  document.querySelector('section[data-framer-name="Pricing"]').insertAdjacentHTML('beforebegin', EXTRA.steps + EXTRA.uses + EXTRA.compare + EXTRA.wall);
  // Pricing: Standard, Pro, Max. The same Simeon on every plan, a 7-day trial on all three;
  // what changes is the weekly usage.
  const plans = [
    { name: 'Standard', monthly: 20, usage: 'Weekly Simeon usage included' },
    { name: 'Pro', monthly: 60, usage: '5× the weekly usage of Standard' },
    { name: 'Max', monthly: 100, usage: '20× the weekly usage of Standard' },
  ];
  const features = ['A team of agents with their own cloud computers', '66 apps to connect', 'Routines on a schedule', 'Asks before anything important'];
  const cards = [...document.querySelectorAll('section[data-framer-name="Pricing"] .framer-IbCrB')];
  const pricing = document.querySelector('section[data-framer-name="Pricing"]');
  pricing.querySelector('.framer-2vqzwa').insertAdjacentHTML('afterend',
    '<div class="sd-bill" role="group" aria-label="Billing period"><button type="button" class="sd-on" data-bill="m">Monthly</button><button type="button" data-bill="y">Yearly <span>Save 20%</span></button></div>');
  cards.forEach((card, i) => {
    const plan = plans[i];
    card.querySelector('.framer-w74sbr h4').textContent = plan.name;
    // Monthly, or yearly at 20% off: the switch above the cards sets which one shows.
    const price = card.querySelector('.framer-1v1u6gg h4');
    price.innerHTML = '<span class="sd-m">$' + plan.monthly + '</span><span class="sd-y">$' + plan.monthly * 0.8 + '</span>';
    const term = card.querySelector('.framer-ahitiq');
    term.insertAdjacentHTML('afterend', '<p class="sd-trial"><span class="sd-m">7-day free trial</span><span class="sd-y">Billed yearly, $' + plan.monthly * 12 * 0.8 + '. 7-day free trial</span></p>');
    card.querySelector('.framer-1iteyfr p').textContent = 'Includes:';
    const list = card.querySelector('.framer-jd3236');
    const row = list.firstElementChild;
    const rows = [...features, plan.usage].map((text) => { const r = row.cloneNode(true); r.querySelector('.framer-i185v4 p').textContent = text; return r; });
    list.replaceChildren(...rows);
    card.querySelector('.framer-kmhqoy .framer-15iv0gp p').textContent = 'Start free trial';
  });
  // FAQ: Simeon's own questions, answered only with what is true today.
  const faq = [
    ['What is Simeon?',
     "An AI operations team for founders and small businesses. It is a team of AI agents, each with a job (Chief of Staff, Inbox, Money, Growth, Content, Sales), its own computer in the cloud and access to the apps you already use. You tell them what you need and they do the work inside your tools."],
    ['How is it different from ChatGPT and other chatbots?',
     'A chatbot answers questions. Simeon\'s agents do the work: they sign into your apps, act in them, pass work to each other, and keep going on a schedule without being asked again.'],
    ['How is it different from Zapier and other automation apps?',
     'With an automation app you build every workflow yourself and fix it when it breaks. With Simeon you say what you want in plain words and the agent works out the steps.'],
    ['Which apps can my agents use?',
     '66 today, including Gmail, Outlook, Google Calendar, Slack, Notion, HubSpot, Attio, Salesforce, Stripe, Mercury, QuickBooks, Xero, Google Analytics, PostHog, Canva, LinkedIn and Calendly. You sign in once on the app\'s own page. Anything else they can open in their own browser, like you would.'],
    ['Where do my agents run?',
     'Each agent works on a computer of its own in the cloud, with a browser and files. You talk to them from the Simeon app, and routines keep running when your Mac is closed.'],
    ['What do I need to start?',
     'A Mac with Apple silicon. Download Simeon, sign in, and ask for the help you need. Every plan starts with a 7-day free trial.'],
    ['Will my agents act without asking me?',
     'Not for the things that matter. Before an agent sends an email, makes a purchase or runs something risky, it asks, and you allow or refuse it in the chat. You can change what needs asking in Settings.'],
    ['Can I change my team?',
     'Yes. Ask Simeon to add an agent for a new job, or rename or remove one. Your team grows with the business.'],
    ['How does Simeon handle my data?',
     "Your agents work on their own computers, apart from yours: a file only reaches them when you give it to them. You sign in to each app on that app's own page, and Simeon never asks for your passwords in chat. What your agents send to the AI model goes through Simeon Labs to the model provider to get an answer."],
    ['How much does Simeon cost?',
     'Standard is $20 a month, Pro $60 and Max $100, or 20% less billed yearly. Every plan starts with a 7-day free trial and includes the same team; what changes is how much weekly usage you get.'],
  ];
  // The export drew seven rows; the rest are copies of the last one (with its wrapper, if it has one).
  const drawn = [...document.querySelectorAll('section[data-framer-name="FAQ"] .framer-satGG')];
  const unit = (r) => (r.parentElement.children.length === 1 ? r.parentElement : r);
  let last = unit(drawn[drawn.length - 1]);
  for (let n = drawn.length; n < faq.length; n++) { const c = last.cloneNode(true); last.after(c); last = c; }
  const rows = [...document.querySelectorAll('section[data-framer-name="FAQ"] .framer-satGG')];
  if (rows.length !== faq.length) throw new Error('FAQ rows: ' + rows.length);
  rows.forEach((row, i) => {
    const [q, ans] = faq[i];
    row.querySelector('.framer-jv9jdf p').textContent = q;
    row.querySelector('.framer-119nhgq p').textContent = ans;
    row.classList.add('sd-faq');
    row.querySelector('.framer-7kqrje').setAttribute('role', 'button');
    row.querySelector('.framer-7kqrje').setAttribute('aria-expanded', 'false');
  });
  // The closing banner: the same promise as the hero, and the button's name spelled right.
  const cta = document.querySelector('section[data-framer-name="CTA"]');
  cta.querySelectorAll('.framer-1m1e2jc h4').forEach((h) => { h.textContent = 'Your AI operations team'; });
  for (const p of cta.querySelectorAll('p')) if (/Donwload/.test(p.textContent)) p.textContent = 'Download Simeon';
  const list = document.querySelector('section[data-framer-name="FAQ"] .framer-2bm14l-container');
  if (list) list.style.height = 'auto';
  const tokens = document.body.getAttribute('style');
  return { shown, tokens, head: document.head.innerHTML, body: document.body.innerHTML };
}"""

CSS = """
:root{%TOKENS%}
html{color-scheme:light}
html,body{margin:0;background:#f6f6f3}
body{overflow-x:clip}
/* The hero box keeps Framer's proportions at every width instead of its fixed 1079 x 813. */
.framer-194f581{width:100%}
.framer-t7h7mm-container{width:100%!important;max-width:1079px;height:auto!important;aspect-ratio:1079/813}
@media (max-width:809.98px){.framer-t7h7mm-container{aspect-ratio:2/3}}
section[data-framer-name="Hero"] .framer-hy289i{display:none!important}
/* The demo lives inside the box and is clipped by it, as a macOS window floating on the painting. */
.sd-stage{position:absolute;inset:0;z-index:5;overflow:hidden;border-radius:inherit;contain:layout paint}
.sd-frame{position:absolute;visibility:hidden;overflow:hidden;background:#fbfbfa;
  border:1px solid rgba(0,0,0,.12);box-shadow:0 1px 2px rgba(0,0,0,.06),0 24px 60px -18px rgba(30,30,40,.35)}
.sd-frame.sd-ready{visibility:visible}
.sd-bar{position:relative;display:flex;align-items:center;justify-content:center;background:#f3f3f2;
  border-bottom:1px solid rgba(0,0,0,.08);font:500 13px/1 -apple-system,BlinkMacSystemFont,"Inter",system-ui,sans-serif;color:#3c3c3c;letter-spacing:.01em}
.sd-dots{position:absolute;display:flex;left:0;top:50%;transform:translateY(-50%)}
.sd-dots i{display:block;border-radius:50%;background:#dcdcda;box-shadow:inset 0 0 0 .5px rgba(0,0,0,.1)}
.sd-screen{position:relative;overflow:hidden;background:#f5f5f7}
.sd-window{position:absolute;left:0;top:0;transform-origin:0 0;overflow:hidden}
.sd-window iframe{position:absolute;inset:0;display:block;width:100%;height:100%;border:0;opacity:0;transition:opacity .35s ease;pointer-events:none}
.sd-window.sd-live iframe{opacity:1}
.sd-poster,.sd-poster img{position:absolute;inset:0;display:block;width:100%;height:100%;object-fit:cover;object-position:0 0}
.sd-window.sd-live.sd-settled .sd-poster{display:none}
/* The laptop hero scene. Outside it the pin and its sticky layer take no box of their own. */
.sd-pin,.sd-sticky{display:contents}
.sd-bleed,.sd-word{display:none}
.sd-scrolly{--card-w:min(1440px,calc(100vw - 64px),calc((100vh - 84px) * 1.68));--card-h:calc(var(--card-w) / 1.68);--pin-top:calc(60px + (100vh - 60px - var(--card-h)) / 2)}
.sd-scrolly .sd-pin{display:block;width:100%;height:calc(var(--card-h) + 35vh)}
.sd-scrolly .sd-sticky{display:flex;justify-content:center;position:sticky;top:var(--pin-top)}
/* The laptop card spans the page like Cursor's (the founder, 28 September 2026: "the screen
   opens too small"), wider than the text column, and short enough to sit under the nav. */
.sd-scrolly .framer-t7h7mm-container{width:var(--card-w)!important;height:var(--card-h)!important;max-width:none!important;aspect-ratio:auto!important;flex:none!important}
.sd-scrolly .framer-gx3vnz,.sd-scrolly section[data-framer-name="Hero"] .framer-115oxcp{overflow:visible!important}
/* Nothing here is repainted while scrolling: the painting stands still and two page-coloured
   curtains slide in over its sides (their inner edges carry the card's round corners), a fade
   lifts off its top, the wordmark fades and the window rises. Transforms and opacity only,
   driven by the scroll position on the compositor where the browser can (HERO_JS). */
.sd-scrolly .sd-bleed{display:block;position:absolute;z-index:2;top:0;bottom:0;left:calc(50% - var(--vw,100vw) / 2);width:var(--vw,100vw);overflow:hidden;contain:paint}
.sd-bleed i{position:absolute;display:block}
.sd-fade{left:0;right:0;top:0;height:110px;background:linear-gradient(#f6f6f3,#f6f6f300);will-change:opacity}
.sd-cur{top:0;bottom:0;width:calc((var(--vw,100vw) - var(--box-w,100%)) / 2 + 1px);background:#f6f6f3;will-change:transform}
.sd-cur-l{left:0;transform:translateX(calc(-100% - 12px))}
.sd-cur-r{right:0;transform:translateX(calc(100% + 12px))}
.sd-cur::after{content:"";position:absolute;top:0;bottom:0;width:12px}
.sd-cur-l::after{left:100%;background:radial-gradient(circle at 100% 100%,#f6f6f300 11.5px,#f6f6f3 12px) top left/12px 12px no-repeat,radial-gradient(circle at 100% 0,#f6f6f300 11.5px,#f6f6f3 12px) bottom left/12px 12px no-repeat}
.sd-cur-r::after{right:100%;background:radial-gradient(circle at 0 100%,#f6f6f300 11.5px,#f6f6f3 12px) top right/12px 12px no-repeat,radial-gradient(circle at 0 0,#f6f6f300 11.5px,#f6f6f3 12px) bottom right/12px 12px no-repeat}
@keyframes sd-cur-l{from{transform:translateX(calc(-100% - 12px))}to{transform:translateX(0)}}
@keyframes sd-cur-r{from{transform:translateX(calc(100% + 12px))}to{transform:translateX(0)}}
@keyframes sd-fade-out{from{opacity:1}to{opacity:0}}
@keyframes sd-word-out{from{opacity:.92;transform:translate(-50%,-50%)}to{opacity:0;transform:translate(-50%,-50%) scale(.95)}}
@keyframes sd-rise{from{opacity:0;transform:translateY(28px) scale(.97)}to{opacity:1;transform:none}}
.sd-scrolly.sd-sda .sd-cur-l{animation:sd-cur-l 1ms ease-in-out both;animation-timeline:scroll(root block);animation-range:0px var(--r-a1,300px)}
.sd-scrolly.sd-sda .sd-cur-r{animation:sd-cur-r 1ms ease-in-out both;animation-timeline:scroll(root block);animation-range:0px var(--r-a1,300px)}
.sd-scrolly.sd-sda .sd-fade{animation:sd-fade-out 1ms linear both;animation-timeline:scroll(root block);animation-range:0px var(--r-a1,300px)}
.sd-scrolly.sd-sda .sd-word{animation:sd-word-out 1ms ease-in-out both;animation-timeline:scroll(root block);animation-range:var(--r-w0,400px) var(--r-w1,600px)}
.sd-scrolly.sd-sda .sd-stage{animation:sd-rise 1ms ease-out both;animation-timeline:scroll(root block);animation-range:var(--r-s0,500px) var(--r-s1,800px)}
.sd-scrolly section[data-framer-name="Hero"] .framer-115oxcp>.framer-es6gsc{visibility:hidden}
.sd-scrolly section[data-framer-name="Hero"] .framer-115oxcp{background:transparent!important}
.sd-scrolly .sd-bleed img{display:block;width:100%;height:100%;object-fit:cover;object-position:center}
.sd-scrolly .sd-word{display:block;position:absolute;z-index:3;left:50%;top:47%;width:36%;aspect-ratio:1024/460;transform:translate(-50%,-50%);background:#fff;opacity:.92;
  -webkit-mask-size:contain;mask-size:contain;-webkit-mask-repeat:no-repeat;mask-repeat:no-repeat;-webkit-mask-position:center;mask-position:center;filter:drop-shadow(0 2px 18px rgba(20,40,80,.18));will-change:opacity,transform}
.sd-scrolly .sd-stage{opacity:0;pointer-events:none;will-change:opacity,transform}
/* The app in the window never takes the pointer (FIT hands clicks to it), so a wheel or a
   finger over it scrolls the page on the browser's own scroll thread and never waits on the app
   (the founder, 28 September 2026: "i want zero lag"). The window itself takes clicks once up. */
.sd-scrolly .sd-stage.sd-up{pointer-events:auto}
/* The phone hero: a still of the app window filling the hero box. */
.sd-mob{display:none}
@media (max-width:599.98px){
  .framer-t7h7mm-container{aspect-ratio:3/5!important}
  .sd-frame{display:none!important}
  .sd-mob{position:absolute;inset:0;display:flex;container-type:inline-size;background:#fbfbfa;border-radius:inherit;overflow:hidden;
    box-shadow:inset 0 0 0 1px rgba(0,0,0,.08);font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","Inter",system-ui,sans-serif;color:#1d1d1f;-webkit-font-smoothing:antialiased;
    -webkit-user-select:none;user-select:none}
  .sd-m-rail{flex:none;width:21cqw;display:flex;flex-direction:column;align-items:center;gap:2.6cqw;padding:4.4cqw 0 4cqw;background:#f4f4f3;border-right:1px solid rgba(0,0,0,.07)}
  .sd-m-lights{display:flex;gap:1.6cqw;margin-bottom:2.4cqw}
  .sd-m-lights i{width:2.9cqw;height:2.9cqw;border-radius:50%;background:#ff5f57}
  .sd-m-lights i:nth-child(2){background:#febc2e}.sd-m-lights i:nth-child(3){background:#28c840}
  .sd-m-av{position:relative;display:grid;place-items:center;width:15cqw;height:12.4cqw;border-radius:3cqw}
  .sd-m-av img{width:11cqw;height:11cqw;object-fit:contain}
  .sd-m-on{background:#fff;box-shadow:0 0 0 1px rgba(0,0,0,.06),0 1px 2px rgba(0,0,0,.05)}
  .sd-m-group img{position:absolute;width:6.6cqw;height:6.6cqw}
  .sd-m-group img:nth-child(1){top:1.2cqw;left:4.2cqw}.sd-m-group img:nth-child(2){bottom:1.4cqw;left:1.6cqw}.sd-m-group img:nth-child(3){bottom:1.4cqw;right:1.6cqw}
  .sd-m-fill{flex:1}
  .sd-m-new{width:6cqw;height:6cqw;color:#6e6e73}
  .sd-m-new svg,.sd-m-plus svg,.sd-m-mic svg,.sd-m-clock svg{display:block;width:100%;height:100%}
  .sd-m-me{display:grid;place-items:center;width:9cqw;height:9cqw;border-radius:50%;background:#ececea;box-shadow:inset 0 0 0 1px rgba(0,0,0,.08);font-size:3.2cqw;color:#555;letter-spacing:.02em}
  .sd-m-main{flex:1;min-width:0;display:flex;flex-direction:column}
  .sd-m-head{display:flex;align-items:center;gap:2cqw;padding:4.2cqw 4cqw 3.4cqw;border-bottom:1px solid rgba(0,0,0,.06);font-size:4.2cqw}
  .sd-m-head img{width:7.4cqw;height:7.4cqw;object-fit:contain}
  .sd-m-head b{font-weight:500}
  .sd-m-role{font-size:3.3cqw;color:#255a93}
  .sd-m-thread{flex:1;min-height:0;overflow:hidden;display:flex;flex-direction:column;justify-content:flex-end;padding:0 3.6cqw;
    -webkit-mask-image:linear-gradient(#0000 0,#000 9cqw);mask-image:linear-gradient(#0000 0,#000 9cqw)}
  .sd-m-feed{display:flex;flex-direction:column;gap:2.2cqw;padding:3cqw 0 2cqw}
  .sd-m-in,.sd-m-out{position:relative;max-width:88%;padding:2.6cqw 3.6cqw;border-radius:4.8cqw;font-size:3.9cqw;line-height:1.42}
  /* The agent speaks on the Messages grey, as in the app (AGENT_SHEET_CSS in router-renderer-patch.mjs). */
  .sd-m-in{align-self:flex-start;background:#e9e9eb;box-shadow:0 0 0 .5px rgba(20,30,60,.07),0 1px 2px rgba(20,30,60,.04)}
  .sd-m-out{align-self:flex-end;background:#255a93;color:#fff;margin:1.6cqw 0 2.4cqw;
    box-shadow:inset 0 .5px 0 rgba(255,255,255,.28),0 0 0 .5px rgba(20,45,90,.18),0 1px 2px rgba(20,45,90,.08)}
  .sd-m-react{position:absolute;right:-1.4cqw;bottom:-3.6cqw;display:grid;place-items:center;width:7cqw;height:7cqw;border-radius:50%;background:#fff;box-shadow:0 1px 4px rgba(0,0,0,.18);font-size:3.6cqw;line-height:1}
  .sd-m-sys{align-self:center;display:flex;align-items:center;flex-wrap:wrap;justify-content:center;gap:1.2cqw;margin:1.4cqw 0;font-size:3.3cqw;color:#8e8e93}
  .sd-m-sys b{font-weight:500;color:#1d1d1f}
  .sd-m-clock{width:4cqw;height:4cqw;color:#3a3a3c}
  .sd-m-tag{display:inline-flex;align-items:center;gap:.8cqw;font-weight:500;vertical-align:middle;position:relative;top:-.1em}
  .sd-m-tag img{width:4.4cqw;height:4.4cqw;object-fit:contain}
  .sd-m-in .sd-app{font-size:.96em}
  .sd-m-file{align-self:flex-start;display:flex;align-items:center;gap:2.4cqw;padding:2.4cqw 4cqw 2.4cqw 2.6cqw;border-radius:3.6cqw;background:#e9e9eb;font-size:3.7cqw;
    box-shadow:0 0 0 .5px rgba(20,30,60,.07),0 1px 2px rgba(20,30,60,.04)}
  .sd-m-file img{width:7cqw;height:7cqw;object-fit:contain}
  .sd-m-compose{display:flex;align-items:center;gap:2.4cqw;margin:1cqw 3.6cqw 4cqw;padding:1.8cqw 1.8cqw 1.8cqw 2cqw;border-radius:99px;background:#fff;box-shadow:0 0 0 1px rgba(0,0,0,.09),0 2px 8px -4px rgba(0,0,0,.1)}
  .sd-m-plus{width:7cqw;height:7cqw;padding:1.3cqw;border-radius:50%;background:#f1f1f0;color:#6e6e73;box-sizing:border-box}
  .sd-m-ph{flex:1;font-size:3.8cqw;color:#a1a1a6;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .sd-m-mic{width:8cqw;height:8cqw;padding:1.9cqw;border-radius:50%;background:#255a93;color:#fff;box-sizing:border-box}
}
/* Nothing below the hero moves until it is on screen. */
.sd-marquee .sd-track{animation-play-state:paused}
.sd-marquee.sd-seen .sd-track{animation-play-state:running}
/* Connectors: two rows of logo-and-name chips gliding in opposite directions. */
.framer-15163q8{gap:12px!important}
.sd-chips{display:flex;flex-wrap:wrap;gap:8px;width:100%;max-width:448px}
.sd-marquee{overflow:hidden!important;width:100%!important;max-width:none!important;-webkit-mask:none!important;mask:none!important}
.sd-track{display:flex;width:max-content;animation:sd-slide 48s linear infinite}
.sd-track.sd-reverse{animation-direction:reverse;animation-duration:54s}
.sd-set{display:flex;gap:28px;padding-right:28px}
.sd-pill{flex:none;display:inline-flex;align-items:center;gap:10px;padding:8px 16px 8px 11px;border-radius:10px;background:#edede8;white-space:nowrap;font:400 15px/1.3 "Switzer Variable",-apple-system,system-ui,sans-serif;color:#353535}
.sd-pill img{width:22px;height:22px;object-fit:contain;display:block;flex:none}
@keyframes sd-slide{to{transform:translateX(-50%)}}
/* The connector animation: the Simeon mark on frosted glass, apps gliding behind it. */
.sd-orbit{position:absolute;inset:0;z-index:3;overflow:hidden;border-radius:inherit;
  background:transparent}
.sd-orb{position:absolute;left:0;top:50%;object-fit:contain;will-change:transform,filter,opacity}
.sd-tile{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);display:grid;place-items:center;
  background:rgba(255,255,255,.40);-webkit-backdrop-filter:blur(20px) saturate(1.9);backdrop-filter:blur(20px) saturate(1.9);
  border:1px solid rgba(255,255,255,.9)}
.sd-tile img{width:68%;height:68%}
/* Agents talking, on the painting: bubbles rise in from the bottom, older ones fade out at the top. */
.sd-talk{position:absolute;inset:0;z-index:3;container-type:inline-size;display:flex;flex-direction:column;justify-content:flex-end;
  padding:6cqw 5cqw;overflow:hidden;-webkit-mask:linear-gradient(#0000 0,#000 22%);mask:linear-gradient(#0000 0,#000 22%)}
.sd-feed{display:flex;flex-direction:column;gap:3cqw}
.sd-msg{display:flex;align-items:flex-end;gap:2cqw;max-width:92%}
.sd-is-typing .sd-bub{padding:0}
.sd-late{display:none;opacity:0;transform:translateY(10px);transition:opacity .9s ease,transform 1.1s cubic-bezier(.2,.8,.2,1)}
.sd-late.sd-shown{display:flex}
.sd-late.sd-in{opacity:1;transform:none}
.sd-typer{opacity:0;transition:opacity .6s ease}
.sd-typer.sd-in{opacity:1}
/* The permission sheet reads larger on a laptop. */
@media (min-width:810px){.sd-sheet{transform:scale(1.4)}}
.sd-right{align-self:flex-end;flex-direction:row-reverse}
.sd-av{flex:none;width:8.5cqw;height:8.5cqw;object-fit:contain}
.sd-col{display:flex;flex-direction:column;gap:.8cqw;min-width:0}
.sd-right .sd-col{align-items:flex-end}
.sd-who{font:600 2.7cqw/1 "Switzer Variable",system-ui,sans-serif;color:rgba(255,255,255,.92);text-shadow:0 1px 3px rgba(0,0,0,.25);padding-inline:1.4cqw}
.sd-bub{background:rgba(255,255,255,.93);-webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px);border-radius:4.6cqw;padding:2.8cqw 3.8cqw;
  font:400 3.7cqw/1.45 "Switzer Variable",system-ui,sans-serif;color:#1c1c1e;box-shadow:0 10px 30px -14px rgba(20,30,60,.45)}
.sd-left .sd-bub{border-bottom-left-radius:1.2cqw}
.sd-right .sd-bub{border-bottom-right-radius:1.2cqw}
.sd-app{display:inline-flex;align-items:center;gap:.32em;white-space:nowrap;font-weight:500;margin-inline:.08em;vertical-align:middle;position:relative;top:-.07em;line-height:1}
.sd-app-ico{flex:none;display:grid;place-items:center;width:1.3em;height:1.3em;border-radius:.34em;background:#fff;box-shadow:0 0 0 .5px rgba(0,0,0,.14)}
.sd-app-ico img{width:72%;height:72%;object-fit:contain}
.sd-typing{display:inline-flex;gap:.9cqw;padding:3cqw 3.4cqw}
.sd-typing i{width:1.4cqw;height:1.4cqw;border-radius:50%;background:#8e8e93;animation:sd-dot 1s infinite ease-in-out}
.sd-typing i:nth-child(2){animation-delay:.15s}.sd-typing i:nth-child(3){animation-delay:.3s}
@keyframes sd-dot{0%,80%,100%{opacity:.3;transform:translateY(0)}40%{opacity:1;transform:translateY(-.5cqw)}}
/* Scenes on the paintings, drawn quietly: light type, air, glass. */
.sd-scene{position:absolute;inset:0;z-index:3;container-type:inline-size;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:5cqw;padding:8cqw 7cqw;
  font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","Switzer Variable",system-ui,sans-serif;color:#1d1d1f;-webkit-font-smoothing:antialiased}
.sd-check{flex:none;width:3.4cqw;height:3.4cqw;border-radius:50%;background:#34c759;position:relative}
.sd-check::after{content:"";position:absolute;left:35%;top:19%;width:22%;height:44%;border:solid #fff;border-width:0 .5cqw .5cqw 0;transform:rotate(45deg)}
/* Otto's computer, in the approval's sheet: a live preview of its screen. */
.sd-screen-prev{position:relative;width:100%;aspect-ratio:16/10;border-radius:3.6cqw;overflow:hidden;display:grid;place-items:center;
  background:linear-gradient(160deg,#dfe7f1,#c4d3e6 60%,#d9d2e6);box-shadow:inset 0 0 0 .5px rgba(0,0,0,.08);margin-bottom:1.6cqw}
.sd-prev-live{position:absolute;top:2.2cqw;right:2.6cqw;display:flex;align-items:center;gap:1cqw;font-size:2.3cqw;color:#3a6b48}
.sd-prev-live i{width:1.4cqw;height:1.4cqw;border-radius:50%;background:#34c759;animation:sd-pulse 2.4s ease-in-out infinite;box-shadow:0 0 0 .7cqw rgba(52,199,89,.15)}
.sd-prev-win{position:relative;width:46%;aspect-ratio:1/1.05;border-radius:2.2cqw;background:rgba(255,255,255,.96);box-shadow:0 10px 24px -12px rgba(20,30,60,.35);display:grid;place-items:center}
.sd-prev-form{display:flex;flex-direction:column;align-items:center;gap:1.5cqw;width:72%;transition:opacity .5s}
.sd-prev-form img{width:6cqw;height:6cqw;margin-bottom:.8cqw}
.sd-prev-line{width:100%;height:3.6cqw;border-radius:1cqw;box-shadow:inset 0 0 0 .5px rgba(0,0,0,.16)}
.sd-prev-btn{width:100%;height:3.6cqw;border-radius:1cqw;background:#13b5ea}
.sd-prev-ok{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;gap:1.2cqw;font-size:2.7cqw;color:#1d1d1f;opacity:0;transition:opacity .5s}
.sd-prev-cap{position:absolute;left:2.2cqw;bottom:2.2cqw;display:flex;align-items:center;gap:1cqw;padding:.9cqw 2cqw .9cqw 1cqw;border-radius:99px;font-size:2.3cqw;color:#3a3a3c;
  background:rgba(255,255,255,.7);-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px)}
.sd-prev-cap .sd-av{width:4.2cqw;height:4.2cqw}
.sd-vm-scene.sd-done .sd-prev-form{opacity:0}
.sd-vm-scene.sd-done .sd-prev-ok{opacity:1}
.sd-vm-scene.sd-done .sd-sheet-btns{display:none}
.sd-vm-scene.sd-done .sd-sheet-done{display:flex}
@keyframes sd-pulse{50%{box-shadow:0 0 0 1.2cqw rgba(52,199,89,.04)}}
/* Iris's permission sheet. */
.sd-sheet{width:80%;display:flex;flex-direction:column;align-items:center;text-align:center;gap:2.6cqw;padding:7cqw 6cqw 5.5cqw;border-radius:7cqw;
  background:rgba(255,255,255,.8);-webkit-backdrop-filter:blur(30px) saturate(1.6);backdrop-filter:blur(30px) saturate(1.6);
  box-shadow:0 0 0 .5px rgba(255,255,255,.7),0 30px 70px -30px rgba(20,30,60,.5)}
.sd-sheet-face .sd-av{width:14cqw;height:14cqw}
.sd-sheet-h{font-size:4.1cqw;font-weight:500;letter-spacing:-.01em;margin-top:1cqw}
.sd-sheet-b{font-size:3.2cqw;line-height:1.5;font-weight:400;color:#6e6e73;max-width:92%}
.sd-sheet-b .sd-app{font-weight:400}
.sd-sheet-btns{display:grid;grid-template-columns:1fr 1fr;gap:2.4cqw;width:100%;margin-top:3cqw}
.sd-deny,.sd-allow{height:9.4cqw;display:grid;place-items:center;border-radius:99px;font-size:3.3cqw;font-weight:400;transition:transform .2s,opacity .2s}
.sd-deny{background:rgba(120,120,128,.14);color:#1d1d1f}
.sd-allow{background:#255a93;color:#fff}
.sd-sheet-done{display:none;align-items:center;justify-content:center;gap:1.6cqw;height:9.4cqw;margin-top:3cqw;font-size:3.2cqw;font-weight:400;color:#1d1d1f}
.sd-ok-scene.sd-done .sd-sheet-btns{display:none}
.sd-ok-scene.sd-done .sd-sheet-done{display:flex}
.sd-trial{margin:.5em 0 0;font:400 14px/1.4 "Switzer Variable",system-ui,sans-serif;color:rgba(53,53,53,.7)}
/* Monthly / Yearly switch. */
.sd-bill{display:inline-flex;gap:4px;padding:4px;border-radius:99px;background:#e6e6e1;margin-top:24px}
.sd-bill button{appearance:none;border:0;background:transparent;border-radius:99px;padding:9px 18px;font:400 15px/1 "Switzer Variable",system-ui,sans-serif;color:#555;cursor:pointer;display:inline-flex;gap:8px;align-items:center}
.sd-bill button.sd-on{background:#fff;color:#1d1d1f;box-shadow:0 1px 3px rgba(0,0,0,.12)}
.sd-bill button span{font-size:12px;color:#2f7a45;background:rgba(52,199,89,.14);border-radius:99px;padding:3px 7px}
.sd-bill button:focus-visible{outline:2px solid #255a93;outline-offset:2px}
.sd-y{display:none}
.sd-yearly .sd-y{display:inline}
.sd-yearly .sd-m{display:none}
/* FAQ rows open and close. */
.sd-faq{height:auto!important}
.sd-faq .framer-rl6bt5{display:grid!important;grid-template-rows:0fr;padding-bottom:0!important;opacity:0!important;transition:grid-template-rows .35s ease,opacity .3s ease,padding .35s ease}
.sd-faq .framer-rl6bt5>*{overflow:hidden;min-height:0}
.sd-faq.sd-open .framer-rl6bt5{grid-template-rows:1fr;padding-bottom:36px!important;opacity:1!important}
.sd-faq .framer-1levrjt{transition:transform .3s ease}
.sd-faq.sd-open .framer-1levrjt{transform:rotate(0deg)!important}
.sd-faq .framer-7kqrje:focus-visible{outline:2px solid #255a93;outline-offset:4px;border-radius:6px}
/* The hero says what Simeon is under its title, and what is true of it under the button. */
.sd-lede{margin:-8px 0 0;max-width:620px;font:400 20px/1.5 "Switzer Variable",-apple-system,system-ui,sans-serif;color:rgba(41,41,41,.6);text-wrap:pretty}
.sd-proof{display:flex;flex-wrap:wrap;gap:8px 22px;margin:0;padding:0;list-style:none;font:400 14px/1.4 "Switzer Variable",-apple-system,system-ui,sans-serif;color:rgba(41,41,41,.72)}
.sd-proof li{display:inline-flex;align-items:center;gap:8px}
.sd-proof li::before{content:"";width:6px;height:6px;border-radius:50%;background:#3f7f78}
/* The added sections share the page's column (1080 wide, 24 px from the edge, 18 on a phone),
   its section spacing and its two-tone headings. Order follows the page: Framer numbers its
   sections on tablets, so every section keeps its place in the page instead. */
section[data-framer-name],.sd-sec{order:0!important}
.sd-sec{position:relative;width:100%;box-sizing:border-box;padding:84px 0;font-family:"Switzer Variable",-apple-system,system-ui,sans-serif;color:#292929}
.sd-wrap{width:min(1080px,calc(100% - 48px));margin-inline:auto;display:flex;flex-direction:column;gap:40px}
.sd-head{max-width:760px}
.sd-head h2{margin:0;font-size:38px;line-height:1.3;font-weight:400;letter-spacing:-.01em;text-wrap:balance}
.sd-head p{margin:6px 0 0;font-size:24px;line-height:1.35;color:rgba(41,41,41,.6);text-wrap:pretty}
.sd-note{margin:0;max-width:640px;font-size:15px;line-height:1.5;color:rgba(53,53,53,.7)}
.sd-paint{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block}
/* Meet your team: six glass cards on a painting. */
.sd-roster{position:relative;border-radius:12px;overflow:hidden;padding:clamp(18px,4vw,48px);isolation:isolate}
.sd-roster-grid{position:relative;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}
.sd-role{display:flex;gap:14px;align-items:flex-start;padding:20px 20px 18px;border-radius:18px;background:rgba(255,255,255,.82);
  -webkit-backdrop-filter:blur(24px) saturate(1.5);backdrop-filter:blur(24px) saturate(1.5);box-shadow:0 0 0 .5px rgba(255,255,255,.7),0 18px 40px -24px rgba(20,30,60,.45)}
.sd-rf{flex:none;width:44px;height:44px;object-fit:contain;filter:drop-shadow(0 4px 8px rgba(0,0,0,.16))}
.sd-role-t{min-width:0;display:flex;flex-direction:column;gap:6px}
.sd-role h3{margin:0;font-size:18px;line-height:1.3;font-weight:500;color:#1d1d1f}
.sd-role p{margin:0;font-size:15px;line-height:1.45;color:rgba(41,41,41,.7)}
.sd-role-apps{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px}
.sd-mini{display:inline-flex;align-items:center;gap:6px;padding:4px 9px 4px 6px;border-radius:8px;background:rgba(237,237,232,.9);font-size:13px;line-height:1.3;color:#353535;white-space:nowrap}
.sd-mini img{width:16px;height:16px;object-fit:contain}
/* How it works. */
.sd-steps{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:24px;margin:0;padding:0;list-style:none}
.sd-step{display:flex;flex-direction:column;gap:8px;min-width:0}
.sd-step-pic{position:relative;aspect-ratio:4/3;border-radius:12px;overflow:hidden;display:grid;place-items:center;margin-bottom:14px;isolation:isolate;container-type:inline-size}
.sd-step-n{font-size:14px;color:rgba(41,41,41,.5);font-variant-numeric:tabular-nums}
.sd-step h3{margin:0;font-size:22px;line-height:1.3;font-weight:400;color:#292929}
.sd-step p{margin:0;font-size:16px;line-height:1.5;color:rgba(53,53,53,.7)}
.sd-g{position:relative;font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","Switzer Variable",system-ui,sans-serif;color:#1d1d1f;
  background:rgba(255,255,255,.8);-webkit-backdrop-filter:blur(24px) saturate(1.6);backdrop-filter:blur(24px) saturate(1.6);box-shadow:0 0 0 .5px rgba(255,255,255,.7),0 20px 44px -22px rgba(20,30,60,.5)}
.sd-g-team{display:flex;flex-direction:column;gap:2px;padding:8px;border-radius:16px;width:62%}
.sd-g-team span{display:flex;align-items:center;gap:10px;padding:7px 10px;border-radius:10px;font-size:max(12px,4.4cqw)}
.sd-g-team span:first-child{background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.06)}
.sd-gf{width:max(22px,8cqw);height:max(22px,8cqw);object-fit:contain}
.sd-g-add,.sd-g-rt{display:flex;align-items:center;gap:10px;width:76%;padding:12px;border-radius:16px}
.sd-g-ico{flex:none;display:grid;place-items:center;width:max(30px,11cqw);height:max(30px,11cqw);border-radius:9px;background:#fff;box-shadow:0 0 0 .5px rgba(0,0,0,.12)}
.sd-g-ico img{width:64%;height:64%;object-fit:contain}
.sd-g-txt{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px;font-size:max(11px,3.6cqw);color:#6e6e73;line-height:1.3}
.sd-g-txt b{font-weight:500;color:#1d1d1f;font-size:max(13px,4.4cqw)}
.sd-g-btn{flex:none;padding:6px 14px;border-radius:99px;background:#255a93;color:#fff;font-size:max(12px,4cqw)}
.sd-g-clock{flex:none;width:max(26px,9cqw);height:max(26px,9cqw);padding:5px;box-sizing:border-box;border-radius:50%;background:#fff;color:#3a3a3c;box-shadow:0 0 0 .5px rgba(0,0,0,.12)}
.sd-g-clock svg{display:block;width:100%;height:100%}
.sd-g-on{flex:none;position:relative;width:max(30px,10.5cqw);height:max(18px,6.2cqw);border-radius:99px;background:#34c759}
.sd-g-on::after{content:"";position:absolute;right:2px;top:2px;bottom:2px;aspect-ratio:1;border-radius:50%;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.2)}
/* What you can hand off: a switch like the billing one, then three asks and their answers. */
.sd-tabs{display:inline-flex;flex-wrap:wrap;gap:4px;padding:4px;border-radius:22px;background:#e6e6e1;align-self:flex-start;margin-bottom:-12px}
.sd-tabs button{appearance:none;border:0;background:transparent;border-radius:99px;padding:9px 18px;font:400 15px/1 "Switzer Variable",system-ui,sans-serif;color:#555;cursor:pointer}
.sd-tabs button.sd-on{background:#fff;color:#1d1d1f;box-shadow:0 1px 3px rgba(0,0,0,.12)}
.sd-tabs button:focus-visible{outline:2px solid #255a93;outline-offset:2px}
.sd-uses[hidden]{display:none!important}
.sd-uses{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}
.sd-use{display:flex;flex-direction:column;gap:14px;padding:20px;border-radius:12px;background:#edede8;min-width:0}
.sd-ask{align-self:flex-end;max-width:90%;margin:0;padding:10px 14px;border-radius:18px 18px 5px 18px;background:#255a93;color:#fff;font-size:15px;line-height:1.42;
  box-shadow:inset 0 .5px 0 rgba(255,255,255,.28),0 1px 2px rgba(20,45,90,.1)}
.sd-reply{display:flex;align-items:flex-end;gap:10px;max-width:96%}
.sd-rf-s{flex:none;width:30px;height:30px;object-fit:contain;filter:drop-shadow(0 3px 6px rgba(0,0,0,.14))}
.sd-reply>div{min-width:0;display:flex;flex-direction:column;gap:4px}
.sd-reply-who{font-size:12px;color:rgba(41,41,41,.55);padding-left:4px}
.sd-reply p{margin:0;padding:10px 14px;border-radius:18px 18px 18px 5px;background:#fff;font-size:15px;line-height:1.45;color:#1c1c1e;box-shadow:0 0 0 .5px rgba(20,30,60,.07),0 1px 2px rgba(20,30,60,.04)}
.sd-reply .sd-app{font-weight:500}
/* Next to a chatbot and an automation app. */
.sd-cmp-scroll{overflow-x:auto;-webkit-overflow-scrolling:touch}
.sd-cmp{width:100%;min-width:560px;border-collapse:separate;border-spacing:0;font-size:16px;line-height:1.4}
.sd-cmp th,.sd-cmp td{padding:15px 16px;text-align:left;border-bottom:1px solid rgba(0,0,0,.08);font-weight:400}
.sd-cmp thead th{font-size:15px;color:rgba(53,53,53,.7);border-bottom-color:rgba(0,0,0,.14)}
.sd-cmp tbody th{color:#353535;width:40%}
.sd-cmp td{width:20%}
.sd-cmp .sd-us{background:#edede8}
.sd-cmp thead .sd-us{color:#1d1d1f;font-weight:500;border-radius:12px 12px 0 0}
.sd-cmp tbody tr:last-child .sd-us{border-radius:0 0 12px 12px}
.sd-cmp tbody tr:last-child th,.sd-cmp tbody tr:last-child td{border-bottom:0}
.sd-cy,.sd-cp,.sd-cn{display:inline-flex;align-items:center;gap:8px;font-size:15px}
.sd-cy{color:#1d1d1f}.sd-cp{color:rgba(53,53,53,.75)}.sd-cn{color:rgba(53,53,53,.45)}
.sd-cy::before,.sd-cp::before,.sd-cn::before{content:"";flex:none;width:8px;height:8px;border-radius:50%}
.sd-cy::before{background:#34c759}.sd-cp::before{background:#e8a33d}.sd-cn::before{background:rgba(0,0,0,.16)}
.sd-vh{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}
/* Every app, as the app's own tile. */
.sd-wall{display:grid;grid-template-columns:repeat(9,minmax(0,1fr));gap:10px;width:100%;max-width:760px;margin:0;padding:0;list-style:none}
.sd-wall li{aspect-ratio:1;display:grid;place-items:center;border-radius:16px;background:#fff;box-shadow:0 0 0 .5px rgba(0,0,0,.08),0 1px 2px rgba(0,0,0,.04)}
.sd-wall img{width:42%;height:42%;object-fit:contain;border-radius:22%}
.sd-wall-more{margin:-16px 0 0;font-size:15px;line-height:1.55;color:rgba(53,53,53,.7);max-width:820px}
@media (max-width:1137.98px){
  .sd-sec{padding:72px 0}
  .sd-roster-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
  .sd-use{padding:16px}
}
@media (max-width:809.98px){
  .sd-sec{padding:60px 0}
  .sd-wrap{width:calc(100% - 36px);gap:28px}
  .sd-head h2{font-size:27px}
  .sd-head p{font-size:19px}
  .sd-lede{font-size:17px;margin-top:-4px}
  .sd-roster-grid,.sd-uses,.sd-steps{grid-template-columns:minmax(0,1fr)}
  .sd-steps{gap:36px}
  .sd-tabs{margin-bottom:0}
  .sd-wall{grid-template-columns:repeat(7,minmax(0,1fr));gap:8px}
  .sd-wall li{border-radius:12px}
  .sd-wall-more{margin-top:-8px}
  /* On a phone each row's question sits over its three answers, so Simeon's column is never off screen. */
  .sd-cmp{min-width:0;display:block}
  .sd-cmp thead,.sd-cmp tbody{display:block}
  .sd-cmp tr{display:grid;grid-template-columns:repeat(3,minmax(0,1fr))}
  .sd-cmp thead th:first-child{display:none}
  .sd-cmp th,.sd-cmp td{width:auto!important;padding:10px 12px}
  .sd-cmp tbody th{grid-column:1/-1;padding:16px 0 4px;border-bottom:0;background:none}
  .sd-cmp thead th{font-size:13px}
  .sd-cmp thead .sd-us{border-radius:10px 10px 0 0}
  .sd-cmp tbody tr:last-child .sd-us{border-radius:0 0 10px 10px}
  .sd-cy,.sd-cp,.sd-cn{font-size:14px}
}
/* The sticky nav stays above the demo: the box is its own stacking context. */
section[data-framer-name="Hero"] .framer-115oxcp{isolation:isolate}
.framer-hwOqx .framer-1kaho43-container{z-index:20!important}
/* Framer drew separate tablet and phone variants that the saved page does not carry;
   these rules stand in for them where the desktop variant's fixed sizes break. */
.framer-yjRHu .framer-em720r{width:100%!important;max-width:1080px}
.framer-52laz7{white-space:pre-wrap!important;max-width:100%}
@media (max-width:1137.98px){
  .framer-1vhj83s{width:100%!important}
  .framer-1a41bgj-container{height:auto!important}
  .framer-IbCrB.framer-11ipdxq{height:auto!important;width:100%!important}
  .framer-IbCrB .framer-l7gc78{flex:none!important;height:auto!important;min-height:0!important}
  .framer-IbCrB .framer-ha34p,.framer-IbCrB .framer-kmhqoy{flex:none!important;height:auto!important}
}
@media (max-width:809.98px){
  .framer-bs0sin-container,.framer-1crrst0-container,.framer-2l1u3f-container,.framer-1xb7i50-container{height:auto!important;aspect-ratio:528/422;width:100%!important;flex:none!important}
  /* The three scenes hold a conversation, so on a phone their boxes are taller. */
  .framer-1crrst0-container,.framer-2l1u3f-container,.framer-1xb7i50-container{aspect-ratio:4/5}
  .framer-q489ce,.framer-1legnp{max-width:100%}
  .framer-VDmTI .framer-1mfif7k{display:flex!important;flex-direction:column;align-items:flex-start;gap:18px}
  .framer-VDmTI .framer-1n3jme1,.framer-VDmTI .framer-1icc86f{width:auto!important}
}
"""

FIT = """<script>
(() => {
  const stage = document.querySelector('.sd-stage'), frame = stage.querySelector('.sd-frame');
  const bar = frame.querySelector('.sd-bar'), dots = frame.querySelector('.sd-dots'), title = frame.querySelector('.sd-title');
  const screen = frame.querySelector('.sd-screen'), win = frame.querySelector('.sd-window');
  const px = (el, props) => { for (const k in props) el.style[k] = typeof props[k] === 'number' ? props[k] + 'px' : props[k]; };
  const fit = () => {
    const w = stage.clientWidth, h = stage.clientHeight;
    if (!w || !h) return;
    const phone = w < 560;
    // Inset like Cursor's: the window floats on the painting with the picture showing all round.
    const side = Math.round(w * (phone ? 0.03 : 0.04)), top = Math.round(h * (phone ? 0.03 : 0.05)), bottom = Math.round(h * (phone ? 0.03 : 0.05));
    const fw = w - 2 * side, fh = h - top - bottom;
    // Zoom: the app is laid out 1150 px wide in the laptop scene (its card is wide and short), 880 on
    // other computers and tablets, 440 on a phone, then scaled to the window.
    const s = fw / (phone ? 440 : document.documentElement.classList.contains('sd-scrolly') ? 1150 : 880);
    const barH = Math.round(Math.max(22, 30 * s));
    px(frame, { left: side, top, width: fw, height: fh, borderRadius: Math.round(11 * Math.min(1.2, s)) });
    px(bar, { height: barH, fontSize: Math.max(11, 13 * Math.min(1.1, s)) });
    px(dots, { left: 12 * Math.min(1.2, s), gap: 7 * Math.min(1.2, s) });
    for (const i of dots.children) px(i, { width: 11 * Math.min(1.2, s), height: 11 * Math.min(1.2, s) });
    const sh = fh - barH - 1;
    px(screen, { width: fw - 2, height: sh });
    px(win, { width: (fw - 2) / s, height: sh / s, transform: 'scale(' + s + ')' });
    frame.classList.add('sd-ready');
  };
  new ResizeObserver(fit).observe(stage);
  fit();
  // The still of the app shows at once; the live app takes over, unseen, once it has drawn its sidebar.
  const iframe = win.querySelector('iframe');
  const t0 = performance.now();
  const reveal = () => { win.classList.add('sd-live'); setTimeout(() => win.classList.add('sd-settled'), 500); };
  const poll = () => {
    let doc = null; try { doc = iframe.contentDocument; } catch {}
    const ready = doc && doc.querySelector('.sand-agents-sidebar');
    if (ready) { (doc.fonts ? Promise.race([doc.fonts.ready, new Promise((r) => setTimeout(r, 1200))]) : Promise.resolve()).then(() => requestAnimationFrame(() => requestAnimationFrame(reveal))); return; }
    if (performance.now() - t0 > 20000) return reveal();
    setTimeout(poll, 60);
  };
  // Phones show the still (.sd-mob) and never load the app; wider screens load it as soon as they are wider.
  const wide = matchMedia('(min-width:600px)');
  const load = () => { if (wide.matches && !iframe.getAttribute('src')) { iframe.setAttribute('src', iframe.dataset.src); poll(); } };
  wide.addEventListener('change', load); load();
  // The app redraws its agents' faces every frame, on this page's own thread. Nothing of it may
  // cost a frame of scrolling: its frame loop is paused while the page scrolls, while the window
  // is not showing (the laptop scene's painting, or the hero scrolled past), and resumes at rest.
  let offscreen = false, thaw = null;
  const freeze = (on) => { try { iframe.contentWindow.__sdFreeze && iframe.contentWindow.__sdFreeze(on); } catch {} };
  const hidden = () => offscreen || (window.sdWindowHidden ? window.sdWindowHidden() : false);
  window.sdSettleApp = () => { if (!thaw) freeze(hidden()); };
  new IntersectionObserver(([e]) => { offscreen = !e.isIntersecting; sdSettleApp(); }).observe(stage);
  addEventListener('scroll', () => { freeze(true); clearTimeout(thaw); thaw = setTimeout(() => { thaw = null; freeze(hidden()); }, 180); }, { passive: true });
  iframe.addEventListener('load', () => sdSettleApp());
  // The window takes no pointer, so a wheel or a finger over it always scrolls the page on the
  // browser's own thread. A click on it is handed to the part of the app under the pointer
  // (pointer and mouse events, then the click), and the cursor shows what is clickable there.
  const appPoint = (e) => {
    let doc = null; try { doc = iframe.contentDocument; } catch {}
    if (!doc || !win.classList.contains('sd-live')) return null;
    const r = iframe.getBoundingClientRect(), k = r.width / iframe.offsetWidth || 1;
    const x = (e.clientX - r.left) / k, y = (e.clientY - r.top) / k;
    if (x < 0 || y < 0 || x > iframe.offsetWidth || y > iframe.offsetHeight) return null;
    const el = doc.elementFromPoint(x, y);
    return el ? { doc, el, x, y } : null;
  };
  const send = (p, type) => {
    const view = p.doc.defaultView, Kind = type.startsWith('pointer') ? view.PointerEvent : view.MouseEvent;
    p.el.dispatchEvent(new Kind(type, { bubbles: true, cancelable: true, composed: true, view, clientX: p.x, clientY: p.y, screenX: p.x, screenY: p.y,
      button: 0, buttons: type.endsWith('down') ? 1 : 0, detail: 1, pointerId: 1, pointerType: 'mouse', isPrimary: true }));
  };
  let pressed = null, hovering = 0;
  screen.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    const p = appPoint(e); if (!p) return;
    pressed = p; send(p, 'pointerdown'); send(p, 'mousedown');
  });
  screen.addEventListener('pointerup', (e) => {
    if (e.button !== 0 || !pressed) return;
    const p = appPoint(e) || pressed;
    send(p, 'pointerup'); send(p, 'mouseup');
    if (pressed.el === p.el || pressed.el.contains(p.el)) send(pressed, 'click');
    pressed = null;
  });
  screen.addEventListener('pointermove', (e) => {
    if (hovering) return;
    hovering = requestAnimationFrame(() => {
      hovering = 0;
      const p = appPoint(e);
      screen.style.cursor = p && p.doc.defaultView.getComputedStyle(p.el).cursor === 'pointer' ? 'pointer' : '';
    });
  });
  // Off the laptop scene the demo plays at once; in it, HERO_JS lets it go when the window rises.
  window.sdReleaseDemo = () => {
    if (!iframe.hasAttribute('data-hold')) return;
    iframe.removeAttribute('data-hold');
    try { iframe.contentWindow.__simeonStart && iframe.contentWindow.__simeonStart(); } catch {}
  };
  if (!document.documentElement.classList.contains('sd-scrolly')) sdReleaseDemo();
})();
</script>"""

HERO_JS = """<script>
(() => {
  const root = document.documentElement;
  const q = matchMedia('(min-width:1024px) and (min-height:620px) and (prefers-reduced-motion: no-preference)');
  // Browsers with scroll-driven animations run the whole scene off the main thread, so the
  // demo's own work can never make it stutter. Others get the same steps from a light rAF loop.
  const sda = CSS.supports('animation-timeline: scroll()');
  const pin = document.querySelector('.sd-pin'), sticky = pin.querySelector('.sd-sticky');
  const box = sticky.querySelector('.framer-115oxcp'), word = box.querySelector('.sd-word'), stage = box.querySelector('.sd-stage');
  const curL = box.querySelector('.sd-cur-l'), curR = box.querySelector('.sd-cur-r'), fade = box.querySelector('.sd-fade');
  // Scroll offsets of each step, measured once per layout, never while scrolling.
  let g = null;
  const measure = () => {
    if (!root.classList.contains('sd-scrolly')) { g = null; return; }
    root.style.setProperty('--vw', root.clientWidth + 'px');
    root.style.setProperty('--box-w', box.offsetWidth + 'px');
    const a1 = Math.max(1, Math.round(pin.getBoundingClientRect().top + scrollY - (parseFloat(getComputedStyle(sticky).top) || 0)));
    const hold = Math.max(1, pin.offsetHeight - box.offsetHeight);
    // Quick: the wordmark goes and the window rises while the card is still settling, and the
    // window is fully up soon after the card pins.
    g = { a1, w0: a1 * 0.55, w1: a1 + hold * 0.15, s0: a1 * 0.75, s1: a1 + hold * 0.4 };
    for (const k of ['a1', 'w0', 'w1', 's0', 's1']) root.style.setProperty('--r-' + k, Math.round(g[k]) + 'px');
    tick();
  };
  const clamp = (v) => Math.max(0, Math.min(1, v));
  const inout = (t) => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  const out = (t) => 1 - Math.pow(1 - t, 2);
  let queued = false, started = false, up = false;
  const tick = () => {
    queued = false;
    if (!g) return;
    const y = scrollY;
    if (!sda) {
      const a = inout(clamp(y / g.a1)), w = inout(clamp((y - g.w0) / (g.w1 - g.w0))), e = out(clamp((y - g.s0) / (g.s1 - g.s0)));
      curL.style.transform = 'translateX(calc(' + (-(1 - a) * 100).toFixed(2) + '% - ' + (12 * (1 - a)).toFixed(2) + 'px))';
      curR.style.transform = 'translateX(calc(' + ((1 - a) * 100).toFixed(2) + '% + ' + (12 * (1 - a)).toFixed(2) + 'px))';
      fade.style.opacity = (1 - a).toFixed(3);
      word.style.opacity = (0.92 * (1 - w)).toFixed(3);
      word.style.transform = 'translate(-50%,-50%) scale(' + (1 - 0.05 * w).toFixed(4) + ')';
      stage.style.opacity = e.toFixed(3);
      stage.style.transform = 'translateY(' + (28 * (1 - e)).toFixed(2) + 'px) scale(' + (0.97 + 0.03 * e).toFixed(4) + ')';
    }
    // The story starts only once the window is fully up, and the window takes clicks from then.
    if (y >= g.s1 && !started) { started = true; setTimeout(sdReleaseDemo, 250); }
    if ((y >= g.s0 + (g.s1 - g.s0) * 0.9) !== up) { up = !up; stage.classList.toggle('sd-up', up); }
  };
  // Before the window rises the app is out of sight, so FIT keeps its frame loop paused.
  window.sdWindowHidden = () => g != null && scrollY < g.s0;
  const ask = () => { if (!queued) { queued = true; requestAnimationFrame(tick); } };
  const mode = () => {
    root.classList.toggle('sd-scrolly', q.matches);
    root.classList.toggle('sd-sda', q.matches && sda);
    if (!q.matches) {
      for (const el of [curL, curR, fade, word, stage]) { el.style.transform = ''; el.style.opacity = ''; }
      sdReleaseDemo();
    }
    measure();
  };
  q.addEventListener('change', mode);
  addEventListener('scroll', ask, { passive: true });
  addEventListener('resize', measure);
  new ResizeObserver(measure).observe(pin);
  if (document.fonts) document.fonts.ready.then(measure);
  addEventListener('load', measure);
  mode();
})();
</script>"""

VIEW_JS = """<script>
// A scene starts when it scrolls into view and starts over each time it comes back.
window.sdWhenSeen = (el, start, stop) => {
  if (!el) return;
  let on = false;
  new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (e.isIntersecting && !on) { on = true; el.classList.add('sd-seen'); start(); }
      else if (!e.isIntersecting && on) { on = false; el.classList.remove('sd-seen'); stop(); }
    }
  }, { threshold: 0.3 }).observe(el);
};
</script>"""

ORBIT_JS = """<script>
(() => {
  // The connector rows glide only while on screen.
  document.querySelectorAll('.sd-marquee').forEach((m) => sdWhenSeen(m, () => {}, () => {}));
  const orbit = document.querySelector('.sd-orbit');
  if (!orbit) return;
  const tile = orbit.querySelector('.sd-tile'), orbs = [...orbit.querySelectorAll('.sd-orb')];
  let t0 = null, run = 0;
  const frame = (id) => (now) => {
    if (id !== run) return;
    const W = orbit.clientWidth, H = orbit.clientHeight;
    if (W && H) {
      const t = Math.min(W * 0.36, H * 0.44), size = t * 0.5, gap = t * 1.05, lane = gap * orbs.length;
      tile.style.width = tile.style.height = t + 'px';
      tile.style.borderRadius = t * 0.235 + 'px';
      // A deep rim like an Apple icon on glass: a thick bright edge, a lit top, a soft lower shade, and a lifted shadow.
      const rim = Math.max(3, t * 0.04);
      tile.style.boxShadow = 'inset 0 0 0 ' + rim + 'px rgba(255,255,255,.72),inset 0 ' + rim * 0.6 + 'px ' + rim * 0.8 + 'px rgba(255,255,255,.95),'
        + 'inset 0 -' + rim * 0.8 + 'px ' + rim * 2.2 + 'px rgba(60,70,90,.14),0 ' + t * 0.1 + 'px ' + t * 0.24 + 'px -' + t * 0.06 + 'px rgba(30,40,60,.38),0 2px 5px rgba(30,40,60,.10)';
      if (t0 == null) t0 = now;
      // As in the reference: the row slides one place in 0.55 s, then holds for about a second
      // with a logo resting behind the glass, so the tile takes that app's colour.
      const period = 1600, move = 550, k = (now - t0) / period, step = Math.floor(k), f = Math.min(1, (k - step) * period / move);
      const ease = f < 0.5 ? 4 * f * f * f : 1 - Math.pow(-2 * f + 2, 3) / 2;
      const shift = (step + ease) * gap;
      orbs.forEach((orb, i) => {
        let x = (i * gap - shift) % lane;
        if (x < -lane / 2) x += lane;
        if (x > lane / 2) x -= lane;
        const d = Math.abs(x) / (W / 2);
        // The logo resting behind the glass swells, so its colour fills the tile the way the reference's does.
        const grow = 1 + 0.6 * Math.max(0, 1 - Math.abs(x) / (gap * 0.6));
        const sz = size * grow;
        orb.style.width = orb.style.height = sz + 'px';
        orb.style.transform = 'translate(' + (W / 2 + x - sz / 2) + 'px,-50%)';
        orb.style.filter = 'blur(' + Math.max(0, (d - 0.8) * 22).toFixed(1) + 'px)';
        orb.style.opacity = Math.max(0, Math.min(1, 1.9 - d)).toFixed(2);
      });
    }
    // Pass 0 only lays the scene out; runs from 1 up loop while it is on screen.
    if (id > 0) requestAnimationFrame(frame(id));
  };
  // Laid out once so the tile and logos are in place before the scroll reaches them.
  frame(0)(performance.now()); t0 = null;
  sdWhenSeen(orbit.closest('.framer-115oxcp'), () => { t0 = null; requestAnimationFrame(frame(++run)); }, () => { run++; });
})();
</script>"""

SCENES_JS = """<script>
(() => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  for (const [sel, first] of [['.sd-ok-scene', 2200], ['.sd-vm-scene', 2600]]) {
    const scene = document.querySelector(sel);
    if (!scene) continue;
    const btn = scene.querySelector('.sd-allow');
    let run = 0;
    const reset = () => { scene.classList.remove('sd-done'); btn.classList.remove('sd-press'); };
    const play = async (id) => {
      const live = () => id === run;
      while (live()) {
        reset();
        await wait(first); if (!live()) return;
        btn.classList.add('sd-press'); await wait(200); btn.classList.remove('sd-press');
        await wait(250); if (!live()) return;
        scene.classList.add('sd-done');
        await wait(4000);
      }
    };
    sdWhenSeen(scene.closest('.framer-115oxcp'), () => play(++run), () => { run++; reset(); });
  }
})();
</script>"""

TALK_JS = """<script>
(() => {
  const feed = document.querySelector('.sd-feed');
  if (!feed) return;
  const late = [...feed.querySelectorAll('.sd-late')];
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const typer = (msg) => {
    const t = msg.cloneNode(true);
    t.classList.remove('sd-late'); t.classList.add('sd-typer', 'sd-is-typing');
    t.querySelector('.sd-bub').innerHTML = '<span class="sd-typing"><i></i><i></i><i></i></span>';
    return t;
  };
  let run = 0;
  const reset = () => {
    feed.querySelectorAll('.sd-typer').forEach((t) => t.remove());
    late.forEach((m) => m.classList.remove('sd-shown', 'sd-in'));
  };
  const play = async (id) => {
    const live = () => id === run;
    while (live()) {
      await wait(900); if (!live()) return;
      for (const m of late) {
        // Slowly: the speaker types for a while, then the message settles in.
        const t = typer(m); feed.appendChild(t);
        await wait(60); t.classList.add('sd-in');
        await wait(2400);
        t.remove(); if (!live()) return;
        m.classList.add('sd-shown'); await wait(40); m.classList.add('sd-in');
        await wait(3200); if (!live()) return;
      }
      await wait(3500); if (!live()) return;
      late.forEach((m) => m.classList.remove('sd-in'));
      await wait(1000); if (!live()) return;
      late.forEach((m) => m.classList.remove('sd-shown'));
    }
  };
  sdWhenSeen(feed.closest('.framer-115oxcp'), () => { reset(); play(++run); }, () => { run++; reset(); });
})();
</script>"""

USES_JS = """<script>
(() => {
  const tabs = [...document.querySelectorAll('.sd-tabs [role="tab"]')];
  const pick = (t) => {
    for (const x of tabs) {
      const on = x === t;
      x.classList.toggle('sd-on', on); x.setAttribute('aria-selected', String(on)); x.tabIndex = on ? 0 : -1;
      document.getElementById(x.getAttribute('aria-controls')).hidden = !on;
    }
  };
  tabs.forEach((t, i) => {
    t.tabIndex = i === 0 ? 0 : -1;
    t.addEventListener('click', () => pick(t));
    t.addEventListener('keydown', (e) => {
      const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (d) { e.preventDefault(); const n = tabs[(i + d + tabs.length) % tabs.length]; pick(n); n.focus(); }
    });
  });
})();
</script>"""

BILL_JS = """<script>
(() => {
  const sw = document.querySelector('.sd-bill'), sec = document.querySelector('section[data-framer-name="Pricing"]');
  if (!sw || !sec) return;
  sw.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    sw.querySelectorAll('button').forEach((x) => x.classList.toggle('sd-on', x === b));
    sec.classList.toggle('sd-yearly', b.dataset.bill === 'y');
  });
})();
</script>"""

FAQ_JS = """<script>
(() => {
  for (const row of document.querySelectorAll('.sd-faq')) {
    const head = row.querySelector('.framer-7kqrje');
    const toggle = () => { const open = row.classList.toggle('sd-open'); head.setAttribute('aria-expanded', String(open)); };
    head.addEventListener('click', toggle);
    head.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } });
  }
})();
</script>"""

def strip_dark(css):
    """Removes every @media (prefers-color-scheme: dark) block, braces matched."""
    out, i = [], 0
    for m in re.finditer(r"@media\s*\(\s*prefers-color-scheme\s*:\s*dark\s*\)\s*\{", css):
        if m.start() < i: continue
        depth, j = 1, m.end()
        while depth:
            depth += {"{": 1, "}": -1}.get(css[j], 0); j += 1
        out.append(css[i:m.start()]); i = j
    out.append(css[i:])
    return "".join(out)

async def posters(app_path):
    """Stills of the app's first screen, shown the moment the page opens while the live app loads.
    One per window shape FIT lays out: computer (880 wide), a narrow tablet (880, tall) and a phone (440)."""
    import functools, http.server, threading
    from playwright.async_api import async_playwright
    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a): pass
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(Quiet, directory=OUT))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    exe = sorted(glob.glob("/opt/pw-browsers/chromium-*/chrome-linux*/chrome"))[-1]
    try:
        async with async_playwright() as p:
            b = await p.chromium.launch(executable_path=exe, args=["--no-sandbox"])
            # "held" is the laptop scene's still: the app before its story starts, as the page holds it
            # until the window is up (demo-gate.js reads the iframe's data-hold through frameElement).
            for name, w, h in (("wide", 880, 618), ("tall", 880, 1290), ("held", 1150, 638)):
                pg = await b.new_page(viewport={"width": w, "height": h}, device_scale_factor=2)
                if name == "held":
                    await pg.add_init_script("Object.defineProperty(window, 'frameElement', { get: () => ({ hasAttribute: () => true, removeAttribute() {} }) })")
                await pg.goto(f"http://127.0.0.1:{srv.server_port}/{app_path}/index.html")
                # The same moment the page reveals the live app: its sidebar drawn and its fonts in.
                await pg.wait_for_selector(".sand-agents-sidebar", state="attached")
                await pg.evaluate("document.fonts.ready")
                await pg.screenshot(path=f"{OUT}/app-poster-{name}.jpg", type="jpeg", quality=82)
                await pg.close()
            await b.close()
    finally:
        srv.shutdown()

async def main():
    from playwright.async_api import async_playwright
    exe = sorted(glob.glob("/opt/pw-browsers/chromium-*/chrome-linux*/chrome"))[-1]
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=exe, args=["--no-sandbox"])
        pg = await b.new_page()
        await pg.route("**/*", lambda r: r.abort() if r.request.url.startswith("http") else r.continue_())
        await pg.goto("file://" + f"{TMP}/stripped.html")
        r = await pg.evaluate(SURGERY, [TICKER, ORBIT_HTML, TALK_HTML, VM_HTML, APPROVE_HTML, MOBILE_HTML, EXTRA])
        await b.close()
    print("appear states finished:", r["shown"])
    head = re.sub(r"<meta[^>]*charset[^>]*>|<meta[^>]*viewport[^>]*>|<title>.*?</title>", "", r["head"], flags=re.S | re.I)
    head = re.sub(r"<link\b[^>]*(icon|canonical|alternate|preconnect|dns-prefetch)[^>]*>", "", head, flags=re.I)
    # The template's own metadata (Planar's title, description, share image and framer.app address) goes;
    # Simeon's takes its place.
    head = re.sub(r"<meta\b[^>]*>", "", head, flags=re.I)
    # The site is light only (the founder, 28 September 2026: the dark mode "doesnt match"):
    # Framer's dark-scheme token block goes, and the page says it is light.
    head = strip_dark(head)
    desc = "Simeon is your AI operations team: AI agents that run the busywork of your business inside the tools you already use, on computers of their own, and ask before anything important."
    head = ('<meta name="description" content="' + desc + '">\n'
            '<meta property="og:type" content="website">\n<meta property="og:url" content="https://simeonlabs.com/">\n'
            '<meta property="og:title" content="Simeon">\n<meta property="og:description" content="' + desc + '">\n'
            '<meta name="twitter:card" content="summary">\n<meta name="twitter:title" content="Simeon">\n'
            '<meta name="twitter:description" content="' + desc + '">\n'
            '<link rel="icon" href="favicon.ico" sizes="48x48">\n<link rel="icon" type="image/svg+xml" href="favicon.svg">\n<link rel="apple-touch-icon" href="apple-touch-icon.png">\n' + head)
    app_idx = open(f"{APP}/index.html").read()
    js = re.search(r'src="\./(assets/index-[^"]+\.js)"', app_idx).group(1)
    css = re.search(r'href="\./(assets/index-[^"]+\.css)"', app_idx).group(1)
    head = ("<script>if (matchMedia('(min-width:1024px) and (min-height:620px) and (prefers-reduced-motion: no-preference)').matches) document.documentElement.classList.add('sd-scrolly', ...(CSS.supports('animation-timeline: scroll()') ? ['sd-sda'] : []))</script>\n"
            '<link rel="preload" as="image" href="app-poster-held.jpg" media="(min-width:1024px) and (min-height:620px) and (prefers-reduced-motion: no-preference)" fetchpriority="high">\n'
            '<link rel="preload" as="image" href="app-poster-wide.jpg" media="(min-width:810px) and (max-width:1023.98px), (min-width:1024px) and (max-height:619.98px)" fetchpriority="high">\n'
            '<link rel="preload" as="image" href="app-poster-tall.jpg" media="(min-width:600px) and (max-width:809.98px)" fetchpriority="high">\n'
            "<script>if (matchMedia('(min-width:600px)').matches) for (const [rel, as, href] of [['modulepreload', '', 'app/" + js + "'], ['preload', 'style', 'app/" + css + "']]) "
            "{ const l = document.createElement('link'); l.rel = rel; if (as) l.as = as; l.crossOrigin = ''; l.href = href; document.head.appendChild(l); }</script>\n" + head)
    page = ('<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n'
            '<title>Simeon: your AI operations team</title>\n' + head +
            "<style>" + CSS.replace("%TOKENS%", r["tokens"]) + "</style>\n</head>\n<body>\n" + r["body"] + FIT + HERO_JS + VIEW_JS + ORBIT_JS + SCENES_JS + TALK_JS + USES_JS + BILL_JS + FAQ_JS + "\n</body>\n</html>\n")
    assert "prefers-color-scheme:dark" not in page.replace(" ", ""), "dark mode left in the page"
    for bad in ("framerusercontent.com/assets", "framerusercontent.com/third", "fonts.gstatic", "chrome-extension", "Simeon le site_files"):
        assert bad not in page, bad
    open(f"{OUT}/index.html", "w", encoding="utf-8").write(page)
    # Simeon's petal mark (desktop/scripts/make-favicons.mjs site source/favicons).
    for name in ("favicon.svg", "favicon.ico", "apple-touch-icon.png"): shutil.copy(f"{HERE}/favicons/{name}", f"{OUT}/{name}")
    shutil.copytree(APP, f"{OUT}/app")
    guard = open(f"{HERE}/scroll-guard.js").read()
    open(f"{OUT}/app/scroll-guard.js", "w").write(guard)
    idx = open(f"{OUT}/app/index.html").read()
    idx = idx.replace('<script src="./demo-bridge.js"></script>', '<script src="./scroll-guard.js"></script>\n    <script src="./demo-bridge.js"></script>\n    <script src="./demo-gate.js"></script>', 1)
    shutil.copy(f"{HERE}/demo-gate.js", f"{OUT}/app/demo-gate.js")
    assert "scroll-guard.js" in idx
    # The sidebar is solid in the page, not glass over a desktop.
    before = 'body::before{content:"";position:fixed;inset:0;z-index:-1;background:linear-gradient(160deg,#e4e4e7,#d4d4d8)}'
    assert before in idx
    idx = idx.replace(before, before + 'html body .sand-agents-sidebar{background-color:var(--cursor-bg-chrome)!important;-webkit-backdrop-filter:none!important;backdrop-filter:none!important}')
    open(f"{OUT}/app/index.html", "w").write(idx)
    # The app lives under a folder named after its content (app/<digest>/), so a changed window is a
    # new address: its files keep the same names from build to build (the patch rewrites them after
    # Vite hashed them), and vercel.json keeps them a year, so a fixed path would serve an old app.
    digest = hashlib.sha256()
    for root, dirs, files in sorted(os.walk(f"{OUT}/app")):
        dirs.sort()
        for name in sorted(files):
            full = os.path.join(root, name)
            digest.update(os.path.relpath(full, f"{OUT}/app").encode()); digest.update(open(full, "rb").read())
    app_path = f"app/{digest.hexdigest()[:12]}"
    os.rename(f"{OUT}/app", f"{OUT}/app-staged"); os.makedirs(f"{OUT}/app"); os.rename(f"{OUT}/app-staged", f"{OUT}/{app_path}")
    home = open(f"{OUT}/index.html", encoding="utf-8").read()
    assert home.count('data-src="app/index.html"') == 1
    # The preload of the app's script and stylesheet names the same folder.
    home = home.replace("'app/assets/", f"'{app_path}/assets/")
    open(f"{OUT}/index.html", "w", encoding="utf-8").write(home.replace('data-src="app/index.html"', f'data-src="{app_path}/index.html"'))
    await posters(app_path)
    shutil.rmtree(TMP, ignore_errors=True)
    print("site written to", os.path.abspath(OUT))

asyncio.run(main())
