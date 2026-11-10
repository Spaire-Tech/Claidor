"""Builds the website's product pages, one landing page for each thing Simeon does (the founder, 10 November 2026:
"a few landing pages additional. all on products"), under the bar's Products menu (nav.PRODUCTS).

Every product page has one format (the founder: "we can keep a format"): the opening every page has (its headline,
the home page's buttons) with one large picture under it, then sections as the home page's are, the title on the
left and a few plain lines on the right, each with one picture of what the apps really show; then questions and the
home page's closing call. The words say what Simeon does, plainly, and only what the apps and the server do
(the founder: no catchphrases, no noise). The pictures are drawn here in the site's parts: its grey, its radii,
its buttons, the cloud computer's own wallpaper (box/wallpapers), the agents' clay faces.

The first is the cloud computer (/cloud-computer), from docs/services-core.md (section 4), docs/services-agents.md
(sections 13 to 15) and box/README.md. It rewrites each product's folder in public/ from scratch; build.py calls it
after models.py, and it runs alone too, needing nothing but Python:

    python3 products.py
"""
import os, shutil

import teams
from teams import REPO, esc, frame
from versioning import version_style

OUT = teams.OUT
WALLPAPER = f"{REPO}/box/wallpapers/simeon-a.png"

ARROW_OUT = '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M3.5 8.5l5-5M4.5 3.5h4v4" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>'

CSS = """
/* A product page: the opening, then sections as the home page's (.trust-top: the title left, its lines right). */
.pp-open{padding-bottom:0}
.pp-sec{padding:clamp(72px,6.2*var(--vw,1vw),118px) 0 0}
.pp-sec .trust-top h2{margin:0;font-weight:var(--w-display);font-size:var(--t-display);line-height:1.1;letter-spacing:-.025em;max-width:var(--title-max);text-wrap:pretty}
@media (max-width:734px){.pp-sec .trust-top h2{max-width:13em;text-wrap:balance}}
.pp-card{position:relative;margin-top:clamp(40px,4*var(--vw,1vw),80px);border-radius:28px;background:var(--soft);overflow:hidden;container:pp/inline-size}
.pp-card.tall{aspect-ratio:1260/640}
.pp-card.mid{aspect-ratio:1260/520}
.pp-big{margin-top:clamp(40px,4*var(--vw,1vw),64px)}
@media (max-width:809.98px){.pp-card,.pp-card.tall,.pp-card.mid{aspect-ratio:auto;border-radius:24px}}

/* The cloud computer's screen: its wallpaper, a Chrome window on it, the agent's cursor. */
.scr{position:relative;border-radius:2cqw;overflow:hidden;background:#6f9bc6 center/cover no-repeat;box-shadow:0 0 0 1px rgba(0,0,0,.06),0 2cqw 5cqw -2cqw rgba(20,40,80,.35)}
.win{position:absolute;border-radius:1.2cqw;overflow:hidden;background:#fff;box-shadow:0 1.2cqw 3cqw -1cqw rgba(10,25,60,.45),0 0 0 1px rgba(0,0,0,.08)}
.win-bar{display:flex;align-items:center;gap:.6cqw;height:3.2cqw;padding:0 1.2cqw;background:#f2f2f4;border-bottom:1px solid #e3e3e8}
.win-bar i{width:.9cqw;height:.9cqw;border-radius:50%;background:#d6d6db}
.win-url{flex:1;margin-left:1.2cqw;height:1.9cqw;display:flex;align-items:center;padding:0 1cqw;border-radius:99px;background:#fff;font-size:1.1cqw;letter-spacing:0;color:#6e6e73;white-space:nowrap;overflow:hidden}
.win-body{padding:2.2cqw 2.4cqw}
.win-body .h{font-size:1.9cqw;letter-spacing:-.02em;color:var(--ink)}
.win-body .l{height:1cqw;margin-top:1.2cqw;border-radius:99px;background:#ececf0}
.win-body .row{display:flex;gap:1.6cqw;margin-top:2cqw}
.win-body .tile{flex:1;aspect-ratio:1;border-radius:1cqw;background:#f2f2f4}
.who{position:absolute;display:flex;align-items:flex-start;gap:.3cqw;pointer-events:none}
.who svg{width:2cqw;height:2.4cqw;filter:drop-shadow(0 .2cqw .4cqw rgba(0,0,0,.25))}
.who span{display:flex;align-items:center;gap:.5cqw;margin-top:1.6cqw;padding:.4cqw .9cqw .4cqw .4cqw;border-radius:99px;background:#fff;font-size:1.15cqw;letter-spacing:-.01em;color:var(--ink);box-shadow:0 .4cqw 1cqw rgba(0,0,0,.15)}
.who img{width:1.8cqw;height:1.8cqw;border-radius:50%}

/* The opening's picture: the computer as the apps open it. */
.hero-shot{padding:4.5cqw 6cqw}
.hero-shot .scr{aspect-ratio:16/10}

/* A desktop for each agent: three screens, each with its agent under it. */
.desks{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:2.6cqw;padding:6cqw 5cqw}
.desk .scr{aspect-ratio:16/10;border-radius:1.4cqw}
.desk .win{left:9%;top:12%;right:9%;bottom:12%;border-radius:.8cqw}
.desk .win-bar{height:2.2cqw;gap:.4cqw;padding:0 .8cqw}
.desk .win-bar i{width:.6cqw;height:.6cqw}
.desk .win-url{height:1.3cqw;margin-left:.6cqw;font-size:.8cqw;padding:0 .7cqw}
.desk .win-body{padding:1.4cqw 1.6cqw}
.desk .win-body .h{font-size:1.2cqw}
.desk .win-body .l{height:.7cqw;margin-top:.8cqw}
.desk p{display:flex;align-items:center;gap:.8cqw;margin-top:1.4cqw;font-size:1.5cqw;letter-spacing:-.01em;color:var(--ink)}
.desk p img{width:2.6cqw;height:2.6cqw;border-radius:50%}
.desk p small{font-size:1em;color:#86868b}

/* Watch it work, take over: the computer as the iPhone opens it, its two buttons under the screen. */
.watch{display:grid;place-items:center;padding:5cqw 0}
.watch-in{width:62cqw}
.watch .scr{aspect-ratio:16/10}
/* who has the computer, under the screen, as the Mac and the web draw it (ComputerView.css, .control-pill): a dark capsule,
   the eye and "Watching" in white at 60%, Take control in white */
.pill-wrap{display:flex;justify-content:center;margin-top:1.6cqw}
.ctl-pill{display:inline-flex;align-items:center;gap:1.2cqw;padding:.5cqw;border-radius:99px;background:rgba(28,28,30,.94);box-shadow:inset 0 0 0 .5px rgba(255,255,255,.1),0 .5cqw 3cqw rgba(0,0,0,.35);font-size:1.6cqw;line-height:1;white-space:nowrap}
.ctl-pill .state{display:flex;align-items:center;gap:.7cqw;padding-left:1.2cqw;color:rgba(255,255,255,.6)}
.ctl-pill .state svg{width:2cqw;height:2cqw}
.ctl-pill .go{display:inline-flex;align-items:center;height:3.6cqw;padding:0 1.7cqw;border-radius:99px;background:#fff;color:#141414;font-weight:var(--w-title)}

/* Sign in once: the card the agent sends in the chat, as the iPhone draws it (Cards.swift, the computer's card, 10 November
   2026): "Computer" with a laptop, "Action needed" over the agent's words in grey, the screen across the card, then Skip,
   I'm done and Take over in the blue of your messages, in a row at the right. */
.hand{display:grid;place-items:center;padding:6cqw 0}
.hand-card{width:46cqw;padding:2.2cqw 2.2cqw 2cqw;border-radius:2.4cqw;background:#fff;box-shadow:0 0 0 1px rgba(0,0,0,.06),0 1.4cqw 4cqw -1.6cqw rgba(0,0,0,.25)}
.hand-kind{display:flex;align-items:center;gap:1cqw;font-size:1.6cqw;color:var(--ink)}
.hand-kind svg{width:1.8cqw;height:1.8cqw;color:#6e6e73}
.hand-card .need{margin-top:1.6cqw;font-size:2cqw;font-weight:var(--w-title);letter-spacing:-.02em;color:var(--ink)}
.hand-card .say{margin-top:.3cqw;font-size:1.7cqw;line-height:1.35;letter-spacing:-.01em;color:#6e6e73}
.hand-card .scr{margin:1.6cqw -2.2cqw 0;aspect-ratio:16/10;border-radius:0;box-shadow:inset 0 .5px 0 rgba(0,0,0,.12),inset 0 -.5px 0 rgba(0,0,0,.12)}
.hand-card .win{left:22%;top:14%;right:22%;bottom:10%;border-radius:.8cqw}
.signin{display:flex;flex-direction:column;align-items:center;gap:.9cqw;padding:2.4cqw 2cqw}
.signin b{font-size:1.3cqw;font-weight:var(--w-title)}
.signin i{width:100%;height:2.2cqw;border-radius:.6cqw;background:#f2f2f4;box-shadow:inset 0 0 0 1px #e3e3e8}
.signin i.go{background:var(--ink);box-shadow:none}
.hand-btns{display:flex;justify-content:flex-end;gap:1cqw;margin-top:1.8cqw}
.hand-btns span{display:inline-flex;align-items:center;height:3.8cqw;padding:0 1.8cqw;border-radius:99px;font-size:1.5cqw;font-weight:var(--w-title);background:rgba(29,29,31,.08);color:var(--ink)}
.hand-btns .main{background:#255a93;color:#fff}

/* Forms, files and checkouts: a page the agent fills in. */
.form-shot{padding:5cqw 12cqw}
.form-shot .scr{aspect-ratio:16/9}
.form-shot .win{left:14%;top:9%;right:14%;bottom:0;border-bottom-left-radius:0;border-bottom-right-radius:0}
.fields{display:grid;grid-template-columns:1fr 1fr;gap:1.2cqw 1.6cqw;margin-top:1.6cqw}
.fields label{display:block;font-size:1cqw;color:#86868b}
.fields span{display:flex;align-items:center;gap:.6cqw;height:2.6cqw;margin-top:.4cqw;padding:0 1cqw;border-radius:.6cqw;box-shadow:inset 0 0 0 1px #e3e3e8;font-size:1.2cqw;color:var(--ink)}
.fields .file{grid-column:1/-1}
.fields .file span{box-shadow:none;background:#f5f5f7}
.fields .file svg{width:1.3cqw;height:1.3cqw;color:#6e6e73}
.fields .send{grid-column:1/-1;display:flex;justify-content:flex-end}
.fields .send span{background:var(--ink);color:#fff;box-shadow:none;padding:0 2cqw}

/* Tools already installed: as the home page's Security panel, each tool with its line. */
.tools{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,3.6fr);gap:24px;margin-top:clamp(40px,4*var(--vw,1vw),80px);padding:clamp(28px,3*var(--vw,1vw),56px);border-radius:28px;background:#fafafb}
.tools h3{font-size:var(--t-body);font-weight:var(--w-title);letter-spacing:-.01em}
.tools ul{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:22px 28px;margin:0;padding:0;list-style:none}
.tools li{display:flex;align-items:flex-start;gap:12px;font-size:var(--t-body);letter-spacing:-.01em}
.tools li span{display:grid;place-items:center;flex:none;width:32px;height:32px;border-radius:50%;background:#fff;box-shadow:0 0 0 1px rgba(0,0,0,.07)}
.tools li svg{width:16px;height:16px;color:#424245}
.tools li small{display:block;margin-top:2px;font-size:var(--t-small);color:#86868b}
@media (max-width:860px){.tools{grid-template-columns:1fr}.tools ul{grid-template-columns:repeat(2,minmax(0,1fr))}}

/* Asleep when idle, backed up: two panels side by side. */
.pair{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px;margin-top:clamp(40px,4*var(--vw,1vw),80px)}
.pair>div{padding:clamp(28px,3*var(--vw,1vw),52px);border-radius:28px;background:#fafafb}
.pair h3{font-size:var(--t-head);font-weight:var(--w-title);letter-spacing:-.015em}
.pair p{max-width:34em;font-size:var(--t-body);line-height:1.5;letter-spacing:-.01em;color:#515154}
@media (max-width:860px){.pair{grid-template-columns:1fr;gap:14px}}

/* On a phone the pictures keep their parts, at the phone's width. */
@container pp (max-width:700px){
  .hero-shot{padding:5cqw}
  .desks{grid-template-columns:1fr;gap:6cqw;padding:7cqw}
  .desk .win-bar{height:5cqw}.desk .win-url{height:3cqw;font-size:2cqw}.desk .win-body .h{font-size:3cqw}.desk .win-body .l{height:1.6cqw;margin-top:1.8cqw}
  .desk p{font-size:4cqw;gap:2.2cqw;margin-top:3cqw}.desk p img{width:7cqw;height:7cqw}
  .watch-in{width:88cqw}.pill-wrap{margin-top:3.6cqw}.ctl-pill{font-size:3.6cqw;gap:2.6cqw;padding:1.1cqw}.ctl-pill .state{padding-left:2.6cqw;gap:1.6cqw}.ctl-pill .state svg{width:4.4cqw;height:4.4cqw}.ctl-pill .go{height:8cqw;padding:0 3.8cqw}
  .hand-card{width:88cqw;padding:5cqw 5cqw 4.6cqw;border-radius:5cqw}.hand-kind{font-size:3.8cqw;gap:2.2cqw}.hand-kind svg{width:4.2cqw;height:4.2cqw}
  .hand-card .need{font-size:4.6cqw;margin-top:3.6cqw}.hand-card .say{font-size:3.8cqw;margin-top:.8cqw}.hand-card .scr{margin:3.6cqw -5cqw 0}
  .hand-btns span{height:8.8cqw;padding:0 4cqw;font-size:3.5cqw}.hand-btns{gap:2.2cqw;margin-top:4cqw}
  .form-shot{padding:6cqw 5cqw}.form-shot .scr{aspect-ratio:4/3.4}.form-shot .win{left:6%;right:6%}
  .fields label{font-size:2.2cqw}.fields span{height:5.6cqw;font-size:2.6cqw;padding:0 2cqw}.fields{gap:2.4cqw 3cqw;margin-top:3cqw}
}
"""

CURSOR = '<svg viewBox="0 0 20 24" aria-hidden="true"><path d="M3 2l13 6.6-5.8 1.6L7.4 16z" fill="#111" stroke="#fff" stroke-width="1.3" stroke-linejoin="round"/></svg>'
CHROME_PAGE = '<div class="win-body"><p class="h">{title}</p><div class="l" style="width:62%"></div><div class="l" style="width:44%"></div><div class="row"><i class="tile"></i><i class="tile"></i><i class="tile"></i></div></div>'


def window(url, body, style=""):
    return (f'<div class="win" style="{style}"><div class="win-bar"><i></i><i></i><i></i><span class="win-url">{esc(url)}</span></div>'
            f'{body}</div>')


def screen(wall, inner, cls="scr", style=""):
    return f'<div class="{cls}" style="background-image:url({wall});{style}">{inner}</div>'


# The tools on the computer (box/README.md, its Dockerfile's line), each with what an agent does with it.
TOOLS = [
    ("Google Chrome", "Opens pages, fills forms, buys", '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="3.2"/><path d="M12 8.8h8M9.2 13.6 5.2 6.7M14.8 13.6l-4 6.9"/>'),
    ("LibreOffice", "Word, Excel and PowerPoint files", '<path d="M6.5 3.5h7l4 4v13h-11z"/><path d="M13.5 3.5v4h4M9 12h6M9 15.5h6"/>'),
    ("Python and Node", "Runs code and scripts", '<path d="m8 8-4 4 4 4M16 8l4 4-4 4M13.5 6l-3 12"/>'),
    ("Git and GitHub CLI", "Clones, commits and opens pull requests", '<circle cx="7" cy="6" r="2"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="8" r="2"/><path d="M7 8v8M17 10c0 4-10 2-10 6"/>'),
    ("FFmpeg and ImageMagick", "Edits video, audio and pictures", '<rect x="3.5" y="5.5" width="17" height="13" rx="2"/><path d="m10 9.5 4.5 2.5-4.5 2.5z"/>'),
    ("PDF tools", "Reads and splits PDFs", '<path d="M6.5 3.5h7l4 4v13h-11z"/><path d="M13.5 3.5v4h4M9 13h6M9 16.5h4"/>'),
    ("Claude Code", "Runs on your own Claude plan", '<path d="M12 3v18M3 12h18M5.6 5.6l12.8 12.8M18.4 5.6 5.6 18.4"/>'),
    ("A shell", "git, jq, ripgrep, uv and bun", '<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><path d="m7.5 10 2.5 2-2.5 2M12 14.5h4"/>'),
    ("Files", "What you send, what agents make", '<path d="M3.5 7.5a2 2 0 0 1 2-2h4l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/>'),
]

QA = [
    ("Does each agent have its own computer?", "Each person has one computer in the cloud. Every agent works on a desktop of its own on it, with its own Chrome."),
    ("Can I use it myself?", "Yes. Open it from an agent's chat on your Mac or iPhone, and take control."),
    ("Where do my files go?", "Files you send to an agent land on the computer. Files your agents make come back to you in the chat."),
    ("How big is it?", "4 GB of memory and 2 CPUs."),
    ("What isn't backed up?", "Your Claude sign-in. It stays on the computer only."),
]


def cloud_computer(assets, ctas, close):
    wall = assets._copy(WALLPAPER, "img", "wallpaper.png")
    face = assets.face
    who = lambda name, fid, style: f'<div class="who" style="{style}">{CURSOR}<span><img src="{face(fid)}" alt="">{esc(name)}</span></div>'

    hero = screen(wall, window("admin.shopify.com/store/ashby-rowe/products", CHROME_PAGE.format(title="Products"),
                               "left:12%;top:10%;right:12%;bottom:12%") + who("Theo", "clay-08", "left:52%;top:46%"))
    desks = "".join(
        f'<div class="desk">{screen(wall, window(url, CHROME_PAGE.format(title=esc(title))))}'
        f'<p><img src="{face(fid)}" alt="">{esc(name)} <small>{esc(site)}</small></p></div>'
        for name, fid, url, title, site in (
            ("Theo", "clay-08", "admin.shopify.com", "Products", "Shopify"),
            ("Ivy", "clay-06", "higgsfield.ai", "New video", "Higgsfield"),
            ("Margot", "clay-01", "google.com/travel/flights", "Flights", "Google Flights"),
        ))
    watch = screen(wall, window("google.com/travel/flights", CHROME_PAGE.format(title="Flights"),
                                "left:12%;top:10%;right:12%;bottom:12%") + who("Margot", "clay-01", "left:58%;top:52%"))
    signin = '<div class="signin"><b>Sign in</b><i></i><i></i><i class="go"></i></div>'
    hand_shot = screen(wall, window("accounts.shopify.com", signin))
    laptop = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="5" width="14" height="10" rx="1.6" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M2.5 18.5h19" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>'
    clip = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m18.5 11.5-6.4 6.4a4 4 0 0 1-5.7-5.7l7-7a2.7 2.7 0 0 1 3.8 3.8l-7 7a1.3 1.3 0 0 1-1.9-1.9l6.4-6.4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>'
    form = ('<div class="win-body"><p class="h">Apply for Brand Designer</p><div class="fields">'
            '<div><label>First name</label><span>Archer</span></div><div><label>Last name</label><span>Lee</span></div>'
            '<div><label>Email</label><span>archer@ashbyrowe.com</span></div><div><label>Phone</label><span>+44 20 7946 0958</span></div>'
            f'<div class="file"><label>Résumé</label><span>{clip}resume.pdf</span></div>'
            '<div class="send"><span>Submit application</span></div></div></div>')
    form_shot = screen(wall, window("jobs.lever.co/ashby-rowe/apply", form) + who("Ivy", "clay-06", "left:79%;top:79%"))
    tools = "".join(f'<li><span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">{icon}</svg></span>'
                    f'<div>{esc(name)}<small>{esc(line)}</small></div></li>' for name, line, icon in TOOLS)

    return f"""<section class="hero pp-open" aria-label="Cloud computer">
  <div class="wrap">
    <h1>A computer in the cloud for your agents</h1>
    {ctas}
    <div class="pp-card pp-big"><div class="hero-shot">{hero}</div></div>
  </div>
</section>

<section class="pp-sec" aria-labelledby="desks-title"><div class="wrap">
  <div class="trust-top"><h2 id="desks-title">A desktop<br>for each agent.</h2><p>Your agents share one computer in the cloud. Each one works on a desktop of its own, in its own Chrome. It keeps working when your Mac is closed.</p></div>
  <div class="pp-card"><div class="desks">{desks}</div></div>
</div></section>

<section class="pp-sec" aria-labelledby="watch-title"><div class="wrap">
  <div class="trust-top"><h2 id="watch-title">Watch it work.<br>Take over anytime.</h2><p>Open an agent's computer from the chat, on your Mac or iPhone, and watch it work. Take control pauses the agent while you use the computer. Hand it back, and the agent carries on from where you left it.</p></div>
  <div class="pp-card"><div class="watch"><div class="watch-in">{watch}<div class="pill-wrap"><span class="ctl-pill"><span class="state"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/></svg>Watching</span><span class="go">Take control</span></span></div></div></div></div>
</div></section>

<section class="pp-sec" aria-labelledby="sign-title"><div class="wrap">
  <div class="trust-top"><h2 id="sign-title">Sign in once.</h2><p>When a site needs your password or a code, the agent opens the page and hands the computer to you. You sign in, and it carries on. Every agent's Chrome keeps that sign-in.</p></div>
  <div class="pp-card"><div class="hand"><div class="hand-card">
    <div class="hand-kind">{laptop}Computer</div>
    <p class="need">Action needed</p>
    <p class="say">Sign in to Shopify, then hand the computer back.</p>
    {hand_shot}
    <div class="hand-btns"><span>Skip</span><span>I’m done</span><span class="main">Take over</span></div>
  </div></div></div>
</div></section>

<section class="pp-sec" aria-labelledby="form-title"><div class="wrap">
  <div class="trust-top"><h2 id="form-title">Forms, files<br>and checkouts.</h2><p>Agents fill in forms, attach the files you send them, close pop-ups, and check out with a card you've saved. Captchas are left to you.</p></div>
  <div class="pp-card"><div class="form-shot">{form_shot}</div></div>
</div></section>

<section class="pp-sec" aria-labelledby="tools-title"><div class="wrap">
  <div class="trust-top"><h2 id="tools-title">Tools already<br>installed.</h2><p>Your agents can run code, convert files and make documents on it.</p></div>
  <div class="tools"><h3>On the computer</h3><ul>{tools}</ul></div>
</div></section>

<section class="pp-sec" aria-labelledby="keep-title"><div class="wrap">
  <div class="trust-top"><h2 id="keep-title">Asleep when idle.<br>Backed up every two minutes.</h2></div>
  <div class="pair">
    <div><p>After 30 minutes without work, the computer sleeps, with your files kept. A message or a routine wakes it. A message sent while it sleeps still reaches your agent.</p></div>
    <div><p>Your files, your agents' work and their sign-ins are copied every two minutes, and after each task. A new computer starts from that copy.</p></div>
  </div>
</div></section>

{teams.questions(QA)}

{close}"""


PAGES = {
    "cloud-computer": ("Cloud computer", "A computer in the cloud for your Simeon agents: a desktop and Chrome for each, that you can watch and take over.", cloud_computer),
}


def build(out=OUT):
    teams.copy_site_css(out)
    hero_css, ctas = teams.home_hero()
    _, close, home_css = teams.from_home()
    for key, (title, about, make) in PAGES.items():
        root = os.path.join(out, key)
        shutil.rmtree(root, ignore_errors=True)
        os.makedirs(root)
        assets = teams.Assets(root, f"/{key}")
        page = frame(title, esc(about), f"/{key}", make(assets, ctas, close), hero_css + home_css + CSS, current=key)
        open(f"{root}/index.html", "w", encoding="utf-8").write(version_style(page, out))
        print(f"{key} page written to {os.path.abspath(root)}")


if __name__ == "__main__":
    build()
