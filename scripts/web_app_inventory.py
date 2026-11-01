#!/usr/bin/env python3
"""What the Mac app is made of, read from its code, for the web and Windows app (docs/web-app/README.md).

The founder, 1 November 2026: a Windows app, from a web app that does everything the Mac app does, missing
nothing. This writes the lists that "everything" means, each read from the code rather than remembered, and
measures the web app people use today (the Electron window's compiled bundle in clients/apps/web/public/app)
against them:

  files.json      every Swift file of the Mac app and the shared core: its lines, what its header says it is,
                  the views it defines, whether it needs the Mac (AppKit and the like), how many of the app's
                  words it shows, and how many of those the old web app shows too
  strings.json    every English string in the Mac's and the core's catalogues (Localizable.xcstrings), the
                  files that show it, and whether the old web app has it
  server.json     every call to Simeon Labs' server: the paths, the Connect RPC methods
  box.json        every command sent to the cloud computer, with the host's own list beside it
  chat.json       every kind of chat row and card the Mac draws (SimeonCore's ChatRow, RequestCard)
  tests.json      the shared core's tests, file by file

    python3 scripts/web_app_inventory.py            # writes docs/web-app/inventory/ and prints the totals
"""
import json, pathlib, re, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "docs/web-app/inventory"
MAC = sorted((ROOT / "mac/Simeon").rglob("*.swift"))
CORE = sorted((ROOT / "ios/SimeonCore/Sources").rglob("*.swift"))
TESTS = sorted((ROOT / "ios/SimeonCore/Tests").rglob("*.swift"))
CATALOGUES = [ROOT / "mac/Simeon/Localizable.xcstrings", ROOT / "ios/SimeonCore/Sources/SimeonCore/Resources/Localizable.xcstrings"]
OLD_WEB = sorted((ROOT / "clients/apps/web/public/app").rglob("*.js"))
HOST_PROTOCOL = ROOT / "desktop/source/host/gateway-protocol.ts"
# what only a Mac has: AppKit, the accessibility and event APIs, the Keychain's Mac form, local processes
MAC_ONLY = re.compile(r"\bimport AppKit\b|\bNS(Workspace|Pasteboard|Event|Window|Panel|Application|Menu|StatusBar|Sound|Screen|Image|View)\b|\bAXUIElement|\bCGEvent|\bProcess\(\)|\bSMAppService\b|\bSPU[A-Z]")

# Every Swift file in exactly one area, so the checklist (docs/web-app/README.md) has a place for all of it; the
# script stops when a file is new or gone, until this map is updated.
AREAS = [
 ("sign-in", "Signing in and the first run",
  "SignInScreen MacSession FirstRun", "SignIn Tokens AppleSignIn GoogleSignIn EmailSignIn LoopbackSignIn AppReturnSignIn Onboarding Access LogoLightUp"),
 ("window", "The window, its look and its words",
  "SimeonMacApp MainWindow WindowChrome Look Glass HandCursor ClickOutside", "Colour Features L10n AppLanguage PlainWords Trace"),
 ("sidebar", "The sidebar, agents, groups, new chat, starter packs, the org chart",
  "Sidebar SidebarList SidebarMenus SidebarState Pictures NewAgentSheet NewChatPane StarterPackSheet OrgChart",
  "StoreAgents StoreNewChat SidebarSections AgentFaces StoreFaces AgentDraft StarterPacks AgentNetwork NewChat GroupMembers GeneratedNameGenders SidebarOrder"),
 ("chat", "The chat: messages, the composer, reactions, find, threads, dictation",
  "ChatPane ChatMotion MessageText MessageActions Composer ComposerPicks Attachments EmojiPicker Tapback Find Exchange Dictation Rendering CodeColours",
  "Chat ChatRuns ChatFind Exchanges ComposerDocument ComposerLists ComposerMenus Emoji AttachmentLimits Markdown LinkMetadata LinkIcons DictatedText Activity Trays Models"),
 ("cards", "Cards in the chat: questions, drafts, approvals, secrets, forms, 1Password, products, checkout, flights, joined",
  "Cards FlightBooking UserFormCard OnePasswordCards",
  "Flights FlightBooking ProductsCard PurchaseCard PurchaseApproval UserForm OnePasswordCards Approvals JoinedCard"),
 ("viewers", "Previews: files, pictures, videos, diagrams", "Viewers MediaViewer DiagramViewer FileBodies", "FilePreview Gallery"),
 ("pane", "The agent's pane: profile, avatar, routines, channels, a group's members",
  "AgentPane AvatarEditor PaneMembersFlight RoutinesPage RoutineTriggerCard ChannelsPage",
  "Routines RoutineTriggers RoutineEditing Channels AvatarCrop AgentVoices"),
 ("computer", "The cloud computer: its screen, take over, rebuild and recovery",
  "ComputerView ComputerPreview ComputerStates", "CloudComputer ComputerRebuild RebuildDriver MigrationWatch StoreComputer StoreRebuild"),
 ("calls", "Calls with an agent", "CallBannerWindow CallChat", "Call CallTones VoiceCall"),
 ("search", "Search (⌘K)", "SearchPanel", "Search Jump"),
 ("connectors", "Connectors: the catalogue, connector pages, connecting, accounts",
  "PluginsWindow PluginsModel MacConnector",
  "Plugins PluginsOverlay PluginCalls ConnectorPages ConnectConsent Connecting ConnectorIcons AppAccounts GeneratedAppIcons GeneratedBrands"),
 ("settings", "Settings, the account menu, usage and billing, Wallet, Credentials Store, feedback",
  "SettingsWindow SettingsParts SettingsGeneral SettingsUsage SettingsPages SettingsCredentials Feedback Account",
  "AccountSettings AccountMenu StoreSettings CredentialsStore Feedback Upgrade ApplePlans FreeMonth"),
 ("plumbing", "Talking to the server and the computer, and what is kept on the device", "",
  "Backend Gateway HTTP JSON SimeonAPI SHA256 Store StoreSaved SavedChats SavedGateway Demo"),
 ("mac-only", "The Mac's own: hands on this computer, local permission, 1Password app, notifications, Dock, menu bar, updates, links",
  "MacServices MacLocalHands MacLocalPermission MacOnePassword MenuBar Updates",
  "AgentNotifications DeepLink DockBadge LocalExecFiles LocalExecRules LocalExecWire LocalToolApprovals LocalToolPermission SensitivePaths"),
]


def rel(p):
    return str(p.relative_to(ROOT))


def header(text):
    """The file's own first comment, condensed to its first sentence or two."""
    m = re.search(r"/\*\*(.*?)\*/", text[:4000], re.S)
    lines = []
    if m and text[:m.start()].strip().startswith(("import", "//", "")) and m.start() < 1500:
        lines = [l.strip(" *") for l in m.group(1).splitlines()]
    else:
        for l in text.splitlines()[:30]:
            if l.startswith("//"):
                lines.append(l.lstrip("/ "))
            elif lines and not l.strip():
                break
    s = re.sub(r"\s+", " ", " ".join(l for l in lines if l)).strip()
    parts = re.split(r"(?<=[.!?])\s", s)
    return " ".join(parts[:2])[:400]


def norm(s):
    """A string with its placeholders and quotes made comparable: %@, %lld, %1$@ and \\(…) all become one mark."""
    s = s.replace("’", "'").replace("‘", "'").replace("“", '"').replace("”", '"').replace("…", "...")
    s = re.sub(r"%(\d+\$)?(l{0,2}[duf]|@|ld|lld|s)", "\x00", s)
    return s


def literals(text):
    """Every string literal in Swift source, interpolations as one mark (\\(…) can nest one level of parentheses)."""
    out = []
    for m in re.finditer(r'"((?:[^"\\\n]|\\.)*)"', text):
        s = re.sub(r"\\\((?:[^()]|\([^()]*\))*\)", "\x00", m.group(1))
        s = s.replace('\\"', '"').replace("\\n", "\n")
        out.append(norm(s))
    return out


def in_bundle(key, bundle):
    """Whether the old web app shows this string: every piece between placeholders, in order, with HTML/JS escapes undone."""
    pieces = [p for p in norm(key).split("\x00") if p.strip()]
    if not pieces:
        return None
    i = 0
    for p in pieces:
        j = bundle.find(p, i)
        if j < 0:
            return False
        i = j + len(p)
    return True


def lines(items):
    """A list written one entry per line: small, and a change between runs shows as the lines that changed."""
    return "[\n" + ",\n".join(json.dumps(x, ensure_ascii=False) for x in items) + "\n]\n"


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    texts = {p: p.read_text(encoding="utf-8") for p in MAC + CORE}
    bundle = "".join(p.read_text(encoding="utf-8", errors="replace") for p in OLD_WEB)
    bundle = norm(bundle.replace("\\u2019", "’").replace("\\u2026", "…").replace("\\'", "'").replace('\\"', '"'))

    # --- the words ---
    file_literals = {p: set(literals(t)) for p, t in texts.items()}
    strings = []
    for cat in CATALOGUES:
        data = json.loads(cat.read_text(encoding="utf-8"))
        for key, entry in sorted(data["strings"].items()):
            if not key.strip() or entry.get("shouldTranslate") is False:
                continue
            nk = norm(key)
            used = [rel(p) for p, lits in file_literals.items() if nk in lits]
            strings.append({"text": key, "catalogue": rel(cat), "files": used, "old_web_app": in_bundle(key, bundle)})
    (OUT / "strings.json").write_text(lines(strings))

    # --- the files ---
    files = []
    for p in MAC + CORE:
        t = texts[p]
        mine = [s for s in strings if rel(p) in s["files"]]
        files.append({
            "file": rel(p), "part": "mac" if p in MAC else "core", "lines": t.count("\n") + 1, "about": header(t),
            "views": sorted(set(re.findall(r"struct ([A-Z][A-Za-z0-9]+)\s*:\s*(?:[A-Za-z, ]*\b)?View\b", t))),
            "needs_a_mac": bool(MAC_ONLY.search(t)),
            "strings": len(mine), "strings_in_old_web_app": sum(1 for s in mine if s["old_web_app"]),
        })
    (OUT / "files.json").write_text(lines(files))

    # --- Simeon Labs' server ---
    server = {}
    pats = [(r'\bserver\(\s*"([^"]+)"', "path"), (r'\.data\(\s*"([^"]+)"', "path"), (r'\bpath\s*[:=]\s*"(/?[a-z][^"]*)"', "path"),
            (r'\bdashboard\(\s*"([A-Za-z]+)"', "dashboard RPC"), (r'\.connect\(\s*"([A-Za-z]+)"', "RPC"),
            (r'"(/(?:auth|oauth|api|desktop|billing|me|users|apps|sand-box|sand|agents|v1|login)[A-Za-z0-9_/{}.\-]*)"', "path")]
    for p, t in texts.items():
        for pat, kind in pats:
            for m in re.finditer(pat, t):
                k = (m.group(1), kind)
                server.setdefault(k, set()).add(rel(p))
    server_list = [{"call": c, "kind": k, "files": sorted(f), "old_web_app": c.strip("/").split("{")[0] in bundle}
                   for (c, k), f in sorted(server.items())]
    (OUT / "server.json").write_text(json.dumps(server_list, indent=1) + "\n")

    # --- the cloud computer (the host's gateway) ---
    box = {}
    for p, t in texts.items():
        for m in re.finditer(r'\b(?:command|commandWhenAwake|commandRequest)\(\s*"([A-Za-z]+)"', t):
            box.setdefault(m.group(1), set()).add(rel(p))
    host = []
    if HOST_PROTOCOL.exists():
        host = sorted(set(re.findall(r"^\s*([a-zA-Z][A-Za-z0-9]+):\s*\(api", HOST_PROTOCOL.read_text(), re.M)))
    # "old_web_app": the command's name is in the old web app's code (its window and web-bridge.js), as a word
    box_list = {"used_by_the_mac": [{"command": c, "files": sorted(f), "old_web_app": re.search(r"\b" + c + r"\b", bundle) is not None}
                                    for c, f in sorted(box.items())],
                "host_commands": host}
    (OUT / "box.json").write_text(json.dumps(box_list, indent=1) + "\n")

    # --- the chat's rows and cards ---
    chat_src = (ROOT / "ios/SimeonCore/Sources/SimeonCore/Chat.swift").read_text()
    def cases(enum):
        m = re.search(r"enum " + enum + r"\b[^{]*\{(.*?)\n\}", chat_src, re.S)
        return re.findall(r"^\s*case ([a-zA-Z]+)", m.group(1), re.M) if m else []
    chat = {"ChatRow": cases("ChatRow"), "RequestCard": cases("RequestCard")}
    (OUT / "chat.json").write_text(json.dumps(chat, indent=1) + "\n")

    # --- the shared core's tests ---
    tests = [{"file": rel(p), "tests": len(re.findall(r"\bfunc test[A-Za-z0-9_]*\(|@Test\b", p.read_text()))} for p in TESTS]
    (OUT / "tests.json").write_text(json.dumps(tests, indent=1) + "\n")

    # --- the areas: every file in one, with what each needs and what the old web app has of it ---
    where = {}
    for key, title, mac, core in AREAS:
        for name in mac.split():
            where.setdefault(("mac", name), []).append(key)
        for name in core.split():
            where.setdefault(("core", name), []).append(key)
    problems = []
    for x in files:
        k = (x["part"], pathlib.Path(x["file"]).stem)
        if len(where.get(k, [])) != 1:
            problems.append(f"{x['file']}: in {where.get(k, [])} (each file must be in exactly one area)")
    named = {(x["part"], pathlib.Path(x["file"]).stem) for x in files}
    problems += [f"{part} {name}: in the map but no such file" for (part, name) in where if (part, name) not in named]
    if problems:
        print("\n".join(problems)); return 1
    areas = []
    for key, title, mac, core in AREAS:
        mine = [x for x in files if where[(x["part"], pathlib.Path(x["file"]).stem)] == [key]]
        paths = {x["file"] for x in mine}
        strs = [s for s in strings if set(s["files"]) & paths]
        cmds = [b for b in box_list["used_by_the_mac"] if set(b["files"]) & paths]
        calls = [c for c in server_list if set(c["files"]) & paths]
        areas.append({
            "area": key, "title": title, "files": sorted(paths),
            "mac_lines": sum(x["lines"] for x in mine if x["part"] == "mac"), "core_lines": sum(x["lines"] for x in mine if x["part"] == "core"),
            "views": sum(len(x["views"]) for x in mine), "files_needing_a_mac": sum(1 for x in mine if x["needs_a_mac"]),
            "strings": len(strs), "strings_in_old_web_app": sum(1 for s in strs if s["old_web_app"]),
            "box_commands": sorted(b["command"] for b in cmds),
            "box_commands_not_in_old_web_app": sorted(b["command"] for b in cmds if not b["old_web_app"]),
            "server_calls": sorted(c["call"] for c in calls),
            "server_calls_not_in_old_web_app": sorted(c["call"] for c in calls if not c["old_web_app"]),
        })
    (OUT / "areas.json").write_text(json.dumps(areas, indent=1, ensure_ascii=False) + "\n")
    for a in areas:
        pct = 100 * a["strings_in_old_web_app"] // a["strings"] if a["strings"] else 0
        print(f"  {a['area']:10} {a['mac_lines']:6} Mac + {a['core_lines']:5} core lines, {a['strings']:4} strings ({pct:3}% in the old web app), "
              f"{len(a['box_commands'])} box commands ({len(a['box_commands_not_in_old_web_app'])} not in the old web app)")

    # --- totals ---
    shown = [s for s in strings if s["files"]]
    print(f"files: {len(MAC)} Mac ({sum(f['lines'] for f in files if f['part'] == 'mac')} lines), {len(CORE)} shared core "
          f"({sum(f['lines'] for f in files if f['part'] == 'core')} lines); {sum(1 for f in files if f['needs_a_mac'])} need a Mac")
    print(f"views: {sum(len(f['views']) for f in files)}")
    print(f"strings: {len(strings)} in the catalogues, {len(shown)} found in the code; "
          f"{sum(1 for s in strings if s['old_web_app'])} also in the old web app")
    print(f"server: {len(server_list)} calls; box: {len(box)} commands the Mac sends ({sum(1 for b in box_list['used_by_the_mac'] if b['old_web_app'])} "
          f"also in the old web app) of {len(host)} the host answers")
    print(f"chat: {len(chat['ChatRow'])} row kinds, {len(chat['RequestCard'])} request cards; tests: {sum(t['tests'] for t in tests)} in {len(tests)} files")


if __name__ == "__main__":
    sys.exit(main())
