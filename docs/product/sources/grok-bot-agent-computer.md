# Agent Computer (“My Computer” / the Box) — Everything From System

**Private — Bass only.**  
**As of:** 2026-09-18 PT  
**Rule:** Compiled only from live system instructions, skills (`box-desktop`, `in-chat-forms`, `no-connector-fallback`, `learn-from-demo`, `code-changes`), and box reference docs (`/home/box/reference/debugging-the-box.md`, `/home/box/reference/app-ui.md`), plus the builder contract digest that cites those same sources (`/workspace/agent-system-contract.md`).  
**Not invented.** Where this instance was probed live, that is labeled **[live probe]** and is observation of *this* box, not a universal product promise.

**Voice to user:** Internally “the box”; to Bass always **“my computer.”** Never say “the box” to the user.

---

## 1. What it is

| Claim | Source |
| --- | --- |
| The agent has **its own computer** in addition to the user’s registered computers | Live system — “My computer” / Where you work |
| Internally called **the box**; user-facing name **my computer** | Live system |
| **One persistent Linux machine shared by all of this user’s agents** — same filesystem, installed tools, browser logins | Live system; agent-system-contract §9.1 |
| **Each agent gets its own desktop and browser window** on that shared machine — desktops are **not** shared across agents | Live system; contract §9.1 |
| Do **not** tell the user each agent has its own *machine* | Live system; contract §9.3 |
| Full computer: install tools, run code, generate files (spreadsheets, CSVs, docs, images, archives) via Shell | Live system |
| State **persists across turns** (files, installed tools, especially browser logins) | Live system; box-desktop / contract |
| **Nothing on the box touches any registered user computer’s filesystem, sessions, or accounts** by default | Live system — separate filesystems |
| User can **open** the agent’s desktop to watch or help | Live system; app-ui per-agent live preview |

---

## 2. Box vs registered user computers (registry model)

### 2.1 Agent computer (default)
- Shell / Read / AwaitShell **without** `machineId` → box
- Scratch: `/workspace`
- Profile / memory / routines / skills / channels: under `/home/box`
- Screenshot is **read-only** on the agent desktop
- GUI: only via `computerUse` / `browserUse` subagents — agent cannot click/type/scroll itself

### 2.2 Registered user computers
- Discovered with **ListMachines**
- Shell / Read / file copy **with** `machineId` → that machine
- Require **local-execution approval** (user allow)
- OS consent still applies (protected folders, mic, camera, screen recording, etc.) — attempt and let OS ask; don’t invent permission cards
- Chat may carry `[Sent from machine <id>]` — **default to that machine** when user doesn’t specify another
- Settings → Computer → **computers** row = registered machines map

### 2.3 Crossing the boundary
| Tool | Direction |
| --- | --- |
| **CopyToBox** | Registered user computer → box (verbatim; any type/size). Default landing `/workspace/uploads` or chosen box path |
| **CopyFromBox** | Box → registered user computer (verbatim). Lands in that computer’s working dir or chosen path |
| Expand globs on box Shell first; pass concrete paths to copy tools | Live system |

Chat attachments: arrive with an absolute path and a note whether they already materialized **on the box** or **on a registered computer**. Nothing is preloaded; attached images may already show inline — path is for when you need the file bytes.

### 2.4 Design implication (from system shape, not opinion)
The product is a **registry**: box + N user machines. “Which computer?” is real whenever files/shell/UI automation leave the box. Box handoff (`request_box_help`) is **box desktop only**, not “control Bass’s Mac.”

---

## 3. Filesystem layout (system)

| Path | Role |
| --- | --- |
| `/workspace` | Scratch / working tree on the box |
| `/home/box` | Profile, memory, routines, skills, channels, agent data |
| `/home/box/reference/` | Canonical app-ui + debugging-the-box docs |
| `/home/box/agent-data/managed-skills/skills/` | Cursor-managed skills (read-only) |
| `/home/box/agent-data/workflows/` | User-authored skills |
| `/tmp` | Desktop bring-up logs, box-doctor log, transient logs |

Files and installed tools **persist across turns**. A missing tool → reinstall.  
**Repos work** → Cursor cloud agents (`code-changes` skill) — not casual clones onto box or user disk.

---

## 4. Tools that touch the computer

### 4.1 On-box (no machineId)
| Tool | Role |
| --- | --- |
| **Shell** | Commands, installs, generation, long-running (`block_until_ms` / background) |
| **Read** | Structured line-numbered file reads; images inline; PDF via poppler |
| **AwaitShell** | Wait/poll background shells when blocked or hang-prone |
| **Screenshot** | Read-only capture of **this agent’s** desktop |
| **Task → computerUse** | Click/type/scroll/GUI on box desktop |
| **Task → browserUse** (when offered) | Page-level browser; can run alongside other work (doesn’t take desktop mouse); fall back to computerUse if site defeats it |
| **request_user_form** | In-chat form filled into **box browser** page |
| **request_box_help** | Hand **box** desktop to user (auth/captcha/payment/other) |
| **credential-request** / ListCredentials | 1Password fill into **live box browser** page |
| **request_cookie_origin_approval** (when offered) | Import user’s Chrome cookies for an origin into box browser |
| **GenerateImage** | Creates image file on box (user must ask for image) |

### 4.2 Explicitly forbidden on the box (box-desktop + debugging)
- Driving GUI from Shell: **xdotool**, raw input automation
- Driving box browser from Shell: **CDP attach**, Playwright/Puppeteer/`websocket-client`, `/json/new`, cookie-DB scraping, page JS eval over DevTools
- Launching Chrome via raw binary — use **`box-chrome`** / `box-chrome` launcher only
- Using `request_box_help` as a **repair** tool (it’s for manual steps on a **working** desktop)

### 4.3 computerUse constraints (live system)
- Display size cited for coordinate space: **1280×800**; clicks in that space
- **Only one computerUse** at a time (shared single screen per agent desktop)
- Runs background; report back to parent; cannot SendToUser
- Stops at username/password login → parent ListCredentials / form / help path
- SSO / passkey / captcha puzzle / payment → hand box to user then continue
- 2FA: wait for 1Password OTP fill when login carries one; else handoff
- Press-and-hold “I’m human” → mouse hold (`holdDurationMs`), not handoff

---

## 5. Desktop stack (debugging-the-box + doctor)

### 5.1 Display / remote desktop
- Primary desktop historically **display `:1`** (xvfb); per-agent forks exist (doctor: novnc fork websockify, etc.)
- **x11vnc** on VNC port (doctor: 5900)
- **noVNC / websockify** (doctor: 6080; fork 6081)
- Window manager + compositor: **xfwm4** + **picom** (doctor)
- Desktop comes up **with no browser window** — no Chrome until a subagent opens it (normal)

### 5.2 Logs (under `/tmp` on box)
| Log | Purpose |
| --- | --- |
| `start-desktop.log` / start-desktop bring-up | Overall desktop start |
| `x11vnc:1.log` / x11vnc logs | VNC |
| `novnc:1.log` | noVNC |
| `box-doctor.log` | Last doctor run / startup summary |

Stale X or Chrome locks after wake are a **known** failure mode.

### 5.3 Chrome
- Launch only via **`box-chrome`**
- Version checked by box-doctor
- Browser logins **persist** on the box across turns
- Cookie-origin import preferred before fresh login when tool exists; special-cased sites (e.g. Linear, Okta, United, Rippling, Databricks, Airtable) per box-desktop / in-chat-forms — import only sticks if Chrome already has a live session

### 5.4 box-doctor checks (canonical list from debugging doc + live binary)
Runs at startup and on demand (`box-doctor` over Shell); also `/tmp/box-doctor.log`.

Documented probes include:
- Valid `/etc/machine-id` (and D-Bus agreement)
- Chrome present + version
- Chrome FD pressure
- DNS / egress
- System clock skew
- D-Bus session bus availability
- X display responds (`xdpyinfo`)
- x11vnc listening
- noVNC / websockify listening (incl. forks)
- Compositor / WM running

Output shape: `[box-doctor] PASS|FAIL <name>: <detail>` plus `[box-doctor] SUMMARY`.

**[live probe] this instance:** Docker runtime (`/.dockerenv`); doctor SUMMARY 11 checks, 0 failed (machine-id, chrome, chrome-fds, egress, clock, dbus, xvfb, x11vnc, novnc, novnc-forks, compositor).

---

## 6. Runtimes

| Runtime | How to tell | Lifecycle |
| --- | --- | --- |
| **Local Docker (dev)** | `/.dockerenv` present | User’s Docker; inspect `sand-box-` (or similarly named) container via **user computer** shell: `docker ps` / logs / inspect. Stopped Docker → box won’t come up; app shows “computer needs Docker” |
| **Brokered anyrun pod (shipped default)** | `/.dockerenv` absent | Lifecycle **server-side**; no local docker inspect — use in-box probes |

Same Shell / Screenshot / Computer surfaces in both.

First boot / image pull can take **minutes** — “still starting / image downloading” is transient; wait and retry.

---

## 7. Persistence vs what Update wipes

| Survives **Update Grok Bot’s Computer** | Does **not** survive Update |
| --- | --- |
| Files | Installed software (apt/npm/pip packages, CLIs, docker images) — **must reinstall** |
| Logins (browser sessions called out) | — |

**Update** = move to a **fresh instance**, keep files + logins; two-click confirm (“Click Again to Confirm”); button label **Update**.  
Deep link: `[Update Grok Bot's Computer](grokbot://app/v1/settings?id=update-computer)`.

**Reset** = restore from **last saved snapshot**; can lose recent **unsynced** work; button **Reset**;  
`grokbot://app/v1/settings?id=reset-computer`.  
**System rule:** steer users to **Update**, **never** direct them to Reset as the recovery path.

Agents **cannot** rebuild the box themselves — only guide the user to Update.

---

## 8. App UI surfaces for the computer (app-ui.md only)

| UI | Behavior |
| --- | --- |
| Settings → **Computer** | Registered machines + box recovery rows |
| **Update Grok Bot’s Computer** | Prefer recovery |
| **Reset Grok Bot’s Computer** | Last resort; don’t recommend |
| Settings → **Updates** | **App** updates — distinct from Update Computer |
| Per-agent info pane (click agent name / Cmd+Shift+I) | **Live preview** of that agent’s computer; click preview → full screen view |
| General → local-execution, etc. | Related defaults (anchors listed in app-ui) |

**Never invent** other settings paths.

---

## 9. User help on the computer

### 9.1 `request_box_help`
- Hands **box** desktop to user with short instruction + “hand back” control
- Reasons: `auth` | `captcha` | `payment` | `other`
- `domain` = destination app; `idp_domain` when on SSO page
- Ends turn until hand-back; then **Screenshot first**
- **Not** for repairing a broken box

### 9.2 In-chat forms
- Prefer for typed login/checkout/OTP when fields are fillable on the **box browser**
- Host fills write-only; agent never sees values
- Unreachable targets → handoff, don’t re-issue doomed form

### 9.3 1Password / cookies
- ListCredentials → credential-request fill on live page
- Cookie-origin approval before fresh login when available

---

## 10. Escalation order (connectors vs box)

Live system preference order for reaching services:
1. Existing context / files  
2. **Connector**  
3. Web  
4. Signed-in **box browser**  
5. Box **desktop/GUI**  
6. Ask user  

Do **not** use the box browser as a side door around a broken connector the user expects — report connector failure and ask.

`no-connector-fallback`: if user already asked for the outcome, open the service on the box **without** an extra “want me to use the browser?” Choice widget.

---

## 11. Safety / Auto-review touching the computer

- Risky Shell / computerUse / MCP / CloudAgent (and similar) can be **Auto-reviewed**
- Blocked Computer actions: host raises Permission card; agent adapts safer or escalates **identical** action for one-time approve
- Deny = final; no workaround (including using signed-in browser to bypass a blocked capability)
- Credentials on user machines: reading/copying OK when it serves the ask; **using** user keys/tokens/sessions to grant yourself access or bypass controls is forbidden

---

## 12. Video on the computer

- Agent **cannot** watch videos itself
- User-attached / generated video → `watchVideo` / `videoReview` subagents via Task file_attachments
- Box video must be under `/workspace` (copy there first)
- From registered computers, only **chat-attached** videos are watchable

---

## 13. Teach / demo skill (related)

`learn-from-demo`: turn a **screen-recorded demonstration on your computer** into a reusable skill when a teach recording finishes — implies demo capture is tied to the agent computer surface.

---

## 14. Long-running work on the box

- Slow/open-ended Shell: `block_until_ms: 0` → background; keep working; notify on completion
- Leave dev servers/watchers running
- Independent commands can parallelize; dependent chain with `&&`
- User stop cancels related background work

---

## 15. Debugging playbook (ordered — from debugging-the-box.md)

1. **Is it up?** Shell returns output → box + daemon healthy. “Still starting” → wait/retry. Shell/Screenshot **not offered** → substrate down (Docker not running in local setup).
2. **Run `box-doctor`** / read `/tmp/box-doctor.log` — report failing checks, don’t guess.
3. **Desktop blank?** Screenshot real screen; read-only Shell diagnostics (`xdpyinfo` on display `:1`); tail `/tmp` desktop logs; Chrome only via `box-chrome`.
4. **Which runtime?** `/.dockerenv` → Docker vs anyrun.
5. **Commands failing?** `df -h` on `/workspace` (or `/`), read command error; reinstall missing tools.
6. **Recovery:** retry → user **Update Computer** (not Reset). `request_box_help` ≠ repair.

Keep user posted in plain language while diagnosing.

---

## 16. What the agent must never claim

- That each agent has a **separate machine** (they share one computer; separate desktops only)
- That box paths exist on user machines or vice versa without Copy*
- Invented Settings paths for recovery outside Update/Reset anchors
- That it clicked the desktop itself (always delegated)
- That Reset is the normal fix

---

## 17. Card / design hooks (system facts only)

| Card / flow | Computer tie-in |
| --- | --- |
| Box handoff | **Box** desktop control transfer |
| In-chat form / 1Password fill / cookie approval | **Box browser** page |
| Permission (Computer surface) | Auto-review of computerUse / related |
| Secret request | Env on **box** processes (or plugin team var) — not “files on Bass’s Mac” |
| CopyToBox / attachments | Explicit file custody move onto box |

These are why “do files live on the box?” and “one machine vs registry?” lock card rules.

---

## 18. Source map

| Source | Path / locus |
| --- | --- |
| Live system “My computer” / tooling / copy / machines | Injected agent instructions |
| `box-desktop` skill | `/home/box/agent-data/managed-skills/skills/box-desktop/SKILL.md` |
| Debugging the box | `/home/box/reference/debugging-the-box.md` |
| App UI (Computer settings, preview) | `/home/box/reference/app-ui.md` |
| in-chat-forms / no-connector-fallback / code-changes / learn-from-demo | managed skills |
| Builder digest | `/workspace/agent-system-contract.md` §§9, 11, 12, 23 |
| Live doctor / runtime | **[live probe]** Shell on this box 2026-09-18 |

---

## Appendix A — [live probe] this box snapshot (observation)

Not a product guarantee for every tenant; facts observed on CoS’s current computer:

- Runtime: **Docker** (`/.dockerenv`)
- `/etc/machine-id` present (32-hex)
- `box-doctor` SUMMARY: **11 checks, 0 failed**
- Chrome via doctor: Google Chrome reported
- DISPLAY env observed `:2` while doctor xvfb check on `:1` (forked display model)
- `/workspace` on overlay disk with free space
- Helpers present: `box-doctor`, `box-chrome`, desktop scripts under `/home/box/sand-host/box-scripts` and `/usr/local/bin/box-*`

---

*Confidential. Bass / Caisra only. Do not publish.*
