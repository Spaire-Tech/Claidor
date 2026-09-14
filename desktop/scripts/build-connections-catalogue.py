#!/usr/bin/env python3
"""Emit the item rows of `src/shared/connections/catalog.ts`.

Two sources. The groups, order, names and logos of the original
sixty-five are ours (recovered from `3e1224d5`). The service
descriptions and MCP endpoints come from `github.com/cursor/plugins`,
`third_party/` — MIT, Copyright 2026 Cursor — and are **copied, never
guessed**, which is the whole reason this is a script and not an
afternoon of typing.

    git clone --depth 1 https://github.com/cursor/plugins /tmp/cursor-plugins
    git show 3e1224d5:desktop/src/shared/connections/catalog.ts > /tmp/old_catalog.ts
    python3 scripts/build-connections-catalogue.py /tmp/items.ts

Then paste the rows between the two hand-written halves of catalog.ts.
The file is hand-maintained after that; re-run this only to pick up new
services from upstream, and diff rather than overwrite.

Two rules are applied while copying and both are load-bearing:

  * Cursor's own proxy (`api.cursor.com`) is somebody else's middleman
    and not ours to put our people behind, so those fall back to
    Pipedream.
  * A `${PLACEHOLDER}` is not an address.
"""
import json, re, sys, pathlib

CURSOR = pathlib.Path('/tmp/cursor-plugins/third_party')
OLD = pathlib.Path('/tmp/old_catalog.ts').read_text()

# --- our sixty-five, parsed out of the recovered catalogue -------------------
ITEM_RE = re.compile(
    r"\{ id: '(?P<id>[^']+)', name: '(?P<name>[^']+)', group: G\.(?P<group>\w+), "
    r"kind: K\.(?P<kind>\w+)(?P<rest>[^}]*)\}")
ours = []
for m in ITEM_RE.finditer(OLD):
    rest = m.group('rest')
    logo = re.search(r"logo: '([^']+)'", rest)
    plat = re.search(r"platformId: '([^']+)'", rest)
    tag = re.search(r"tag: ConnectionTag\.(\w+)", rest)
    slug = re.search(r"appSlug: '([^']+)'", rest)
    ours.append({'appSlug': slug.group(1) if slug else None,
                 'id': m.group('id'), 'name': m.group('name'),
                 'group': m.group('group'), 'kind': m.group('kind'),
                 'logo': logo.group(1) if logo else None,
                 'platformId': plat.group(1) if plat else None,
                 'tag': tag.group(1) if tag else None})

# --- cursor's sixty-three ---------------------------------------------------
cursor = {}
for d in sorted(p.name for p in CURSOR.iterdir() if p.is_dir()):
    pj = CURSOR / d / '.cursor-plugin' / 'plugin.json'
    if not pj.exists():
        continue
    p = json.loads(pj.read_text())
    e = {'name': p.get('displayName', d), 'description': p.get('description', '')}
    mj = CURSOR / d / 'mcp.json'
    if mj.exists():
        servers = json.loads(mj.read_text()).get('mcpServers', {})
        key = next(iter(servers), None)
        s = servers.get(key, {}) if key else {}
        if 'url' in s:
            e['url'] = s['url']
            hdr = s.get('headers') or {}
            if hdr:
                # Two shapes in their manifests: `Authorization: Bearer
                # ${VAR}` and a vendor header carrying `${VAR}` bare. The
                # header name and any prefix are part of the answer — a
                # token sent under the wrong header is just a 401.
                name, value = next(iter(hdr.items()))
                var = re.search(r'\$\{([A-Z0-9_]+)\}', value)
                if var:
                    e['token_env'] = var.group(1)
                    e['token_header'] = name
                    prefix = value[:var.start()]
                    if prefix:
                        e['token_prefix'] = prefix
            au = s.get('auth') or {}
            if au.get('CLIENT_ID'):
                e['preregistered'] = True
            if au.get('scopes'):
                e['scope'] = ' '.join(au['scopes'])
        elif 'command' in s:
            e['command'] = s['command']
            e['args'] = s.get('args', [])
            e['env'] = list((s.get('env') or {}).keys())
    cursor[d] = e

# --- our id -> cursor id, checked by hand ------------------------------------
ALIAS = {
    'gmail': 'gmail', 'outlook': 'outlook', 'google-calendar': 'google-calendar',
    'microsoft-teams': 'teams', 'google-drive': 'google-drive', 'onedrive': 'onedrive',
    'todoist': 'todoist', 'zoom': 'zoom', 'fathom': 'fathom', 'otter': 'otter',
    'hubspot': 'hubspot', 'salesforce': 'salesforce', 'intercom': 'intercom',
    'calendly': 'calendly', 'xero': 'xero', 'github': 'github',
}
# Cards the founder deliberately made Browser or Local. A vendor MCP does not
# override that: it is their call which surface a service uses.
KEEP_KIND = {'x', 'linkedin', 'instagram', 'tiktok', 'youtube', 'facebook',
             'amazon', 'airbnb', 'booking', 'doordash', 'opentable',
             'google-flights', 'amazon-seller', 'youtube-studio'}

# --- where cursor-only services go ------------------------------------------
# The founder's eleven did not have to hold fifty-four more. Marketing and
# Hiring are mine, and flagged as such in the note.
NEW = {
    'outlook-calendar': 'MailCalendar',
    'coda': 'FilesDocs', 'craft': 'FilesDocs', 'mem': 'FilesDocs',
    'guru': 'FilesDocs', 'readwise': 'FilesDocs',
    'jotform': 'Productivity', 'typeform': 'Productivity',
    'smartsheet': 'Productivity', 'wrike': 'Productivity',
    'circleback': 'Meetings', 'fireflies': 'Meetings',
    'gamma': 'Creativity', 'excalidraw': 'Creativity',
    'brex': 'Finance', 'mercury': 'Finance', 'navan': 'Finance',
    'interactive-brokers': 'Finance', 'webull': 'Finance',
    'daloopa': 'Finance', 'sp-global': 'Finance',
    'attio': 'Sales', 'clay': 'Sales', 'outreach': 'Sales',
    'amplemarket': 'Sales', 'docusign': 'Sales', 'upwork': 'Sales',
    'klaviyo': 'Marketing', 'customer-io': 'Marketing', 'mailerlite': 'Marketing',
    'brevo': 'Marketing', 'meltwater': 'Marketing', 'profound': 'Marketing',
    'ahrefs': 'Marketing', 'semrush': 'Marketing', 'similarweb': 'Marketing',
    'hunter': 'Marketing', 'godaddy': 'Marketing', 'x-ads': 'Marketing',
    'ashby': 'Hiring', 'workable': 'Hiring', 'juicebox': 'Hiring',
    'gong': 'Sales',
    'google-cloud-bigquery': 'Developer', 'playwright': 'Developer',
}
SKIP = {'finance'}  # no MCP, and its description names another product

def usable(url):
    """Cursor's own proxy is a middleman, and not ours to put our people
    behind; a ${PLACEHOLDER} is not an address at all."""
    if not url.startswith('https://'):
        return False
    if '${' in url:
        return False
    return url.split('//', 1)[1].split('/')[0] != 'api.cursor.com'

def connect_of(cid):
    """The connect clause for a cursor service, or None."""
    e = cursor[cid]
    if 'url' in e and usable(e['url']):
        if 'token_env' in e:
            return ('token', e)
        return ('mcp', e)
    if 'command' in e:
        return ('local', e)
    return None

def ts(s):
    return "'" + s.replace("\\", "\\\\").replace("'", "\\'") + "'"

def emit_connect(cid):
    kindtag, e = connect_of(cid)
    if kindtag == 'mcp':
        bits = [f"via: C.Mcp", f"url: {ts(e['url'])}"]
        if e.get('scope'):
            bits.append(f"scope: {ts(e['scope'])}")
        if e.get('preregistered'):
            bits.append("registration: R.Preregistered")
        return "{ " + ", ".join(bits) + " }"
    if kindtag == 'token':
        bits = ['via: C.Token', 'url: ' + ts(e['url']),
                'header: ' + ts(e['token_header']),
                'tokenEnv: ' + ts(e['token_env'])]
        if e.get('token_prefix'):
            bits.append('prefix: ' + ts(e['token_prefix']))
        return '{ ' + ', '.join(bits) + ' }'
    args = ", ".join(ts(a) for a in e['args'])
    env = ", ".join(ts(v) for v in e.get('env', []))
    return ("{ via: C.Local, command: %s, args: [%s]%s }"
            % (ts(e['command']), args, f", env: [{env}]" if env else ""))

lines = []
for it in ours:
    cid = ALIAS.get(it['id'])
    parts = [f"id: {ts(it['id'])}", f"name: {ts(it['name'])}", f"group: G.{it['group']}"]
    kind = it['kind']
    if cid and it['id'] not in KEEP_KIND and connect_of(cid):
        kind = 'Account'
        parts.append("kind: K.Account")
        parts.append("connect: " + emit_connect(cid))
        if cursor[cid].get('description'):
            parts.append(f"line: {ts(cursor[cid]['description'])}")
    elif kind == 'Account' and it['appSlug']:
        parts.append("kind: K.Account")
        parts.append("connect: { via: C.Pipedream, appSlug: %s }" % ts(it['appSlug']))
    else:
        parts.append(f"kind: K.{kind}")
        if it['platformId']:
            parts.append(f"platformId: {ts(it['platformId'])}")
    if it['tag']:
        parts.append(f"tag: ConnectionTag.{it['tag']}")
    if it['logo']:
        parts.append(f"logo: {ts(it['logo'])}")
    lines.append((it['group'], "  { " + ", ".join(parts) + " },"))

for cid, group in NEW.items():
    if cid in SKIP or cid not in cursor:
        continue
    e = cursor[cid]
    if not connect_of(cid):
        continue
    parts = [f"id: {ts(cid)}", f"name: {ts(e['name'])}", f"group: G.{group}",
             "kind: K.Account", "connect: " + emit_connect(cid)]
    if e.get('description'):
        parts.append(f"line: {ts(e['description'])}")
    lines.append((group, "  { " + ", ".join(parts) + " },"))

GROUP_ORDER = ['MailCalendar', 'Messaging', 'FilesDocs', 'Productivity', 'Meetings',
               'Social', 'Creativity', 'Finance', 'Marketing', 'Sales', 'Hiring',
               'ShoppingTravel', 'Developer']
missing = sorted({g for g, _ in lines} - set(GROUP_ORDER))
assert not missing, f'groups with no place in the order: {missing}'
body = []
for g in GROUP_ORDER:
    rows = [l for (gg, l) in lines if gg == g]
    if not rows:
        continue
    body.append(f"  // {g}")
    body.extend(rows)
pathlib.Path(sys.argv[1]).write_text("\n".join(body) + "\n")
print(f"ours={len(ours)} cursor={len(cursor)} rows={len(lines)}")
