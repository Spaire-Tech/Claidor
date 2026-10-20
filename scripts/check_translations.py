#!/usr/bin/env python3
"""Fail when any English sentence of Simeon's has no translation (docs/localization.md).

The languages are the apps' (`CFBundleLocalizations` in ios/project.yml, English
left out): adding one there makes this ask for it everywhere. It reads:

- every String Catalog (`*.xcstrings`) under ios/ and mac/: each string the
  apps show needs a translated value in each language (plural and device
  variations: every form);
- the voice calls' greetings: the engine's (`voice-call-prompt.ts`) and the
  core's (`VoiceCall.swift`), as many in each language as in English, the
  same words in both;
- the server's voice agent (`VOICE_LANGUAGES` in voice.py): a first message
  in each language;
- the shared core's sentences (`L10n.text("…")` in ios/SimeonCore): each one
  is a key of the core's catalog (Resources/Localizable.xcstrings), so the
  first check asks for its translations;
- the engine's, the server's and the emails' tables (`say`): each language's
  table has every key of the English one, with the same `{values}`
  (desktop/source/shared/words, server/simeon/desktop/words,
  server/emails/src/words.ts);
- the App Store page (ios/AppStore/metadata): each language's folder has
  every field the English one has, within App Store Connect's limits.

Run it with `python3 scripts/check_names.py` before pushing.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def languages() -> list[str]:
    text = (ROOT / "ios/project.yml").read_text()
    found = re.search(r"CFBundleLocalizations:\s*\[([^\]]*)\]", text)
    if found is None:
        return []
    tags = [tag.strip() for tag in found.group(1).split(",") if tag.strip()]
    return [tag for tag in tags if tag != "en"]


def catalogs() -> list[Path]:
    found: list[Path] = []
    for folder in ("ios", "mac"):
        for path in sorted((ROOT / folder).rglob("*.xcstrings")):
            if ".build" in path.parts or "DerivedData" in path.parts:
                continue
            found.append(path)
    return found


def unit_missing(unit: dict | None) -> bool:
    if not isinstance(unit, dict):
        return True
    value = unit.get("value")
    return unit.get("state") not in ("translated",) or not isinstance(value, str) or value == ""


def localization_missing(entry: dict | None) -> bool:
    """A translation is there when its string unit is, or every form of its variations is."""
    if not isinstance(entry, dict):
        return True
    if "stringUnit" in entry:
        return unit_missing(entry["stringUnit"])
    variations = entry.get("variations")
    if not isinstance(variations, dict) or not variations:
        return True
    for forms in variations.values():
        if not isinstance(forms, dict) or not forms:
            return True
        for form in forms.values():
            if localization_missing(form):
                return True
    return False


def check_catalog(path: Path, wanted: list[str]) -> list[str]:
    problems: list[str] = []
    data = json.loads(path.read_text())
    source = data.get("sourceLanguage", "en")
    if source != "en":
        problems.append(f"{path.relative_to(ROOT)}: the source language is {source}, not en")
    for key, string in sorted(data.get("strings", {}).items()):
        if string.get("shouldTranslate") is False:
            continue
        if string.get("extractionState") == "stale":
            continue
        localizations = string.get("localizations", {})
        for language in wanted:
            if localization_missing(localizations.get(language)):
                problems.append(f"{path.relative_to(ROOT)}: {key!r} has no {language}")
    return problems


def engine_greetings() -> dict[str, list[str]]:
    text = (ROOT / "desktop/source/shared/voice-call/voice-call-prompt.ts").read_text()
    out: dict[str, list[str]] = {}
    english = re.search(r"const GREETINGS: readonly Greeting\[\] = \[(.*?)\n\];", text, re.S)
    if english:
        out["en"] = re.findall(r"=> `([^`]*)`", english.group(1))
    by_language = re.search(r"const GREETINGS_BY_LANGUAGE[^=]*= \{(.*?)\n\};", text, re.S)
    if by_language:
        for language, body in re.findall(r"\n  ([\w-]+): \[(.*?)\n  \],", by_language.group(1), re.S):
            out[language] = re.findall(r"=> `([^`]*)`", body)
    return out


def core_greetings() -> dict[str, list[str]]:
    text = (ROOT / "ios/SimeonCore/Sources/SimeonCore/VoiceCall.swift").read_text()
    out: dict[str, list[str]] = {}
    for label, body in re.findall(r'\n    (case "[\w-]+"|default):\n      greetings = \[(.*?)\n      \]', text, re.S):
        language = "en" if label == "default" else label.split('"')[1]
        out[language] = re.findall(r'\n        "(.*)",', body)
    return out


def same_words(engine: str, core: str) -> bool:
    def plain(text: str) -> str:
        return (
            text.replace("${person}", "{person}").replace("\\(p)", "{person}")
            .replace("${name}", "{name}").replace("\\(name)", "{name}")
            .replace("\\u202f", " ").replace("\\u{202F}", " ")
        )

    return plain(engine) == plain(core)


def check_greetings(wanted: list[str]) -> list[str]:
    problems: list[str] = []
    engine, core = engine_greetings(), core_greetings()
    if not engine.get("en") or not core.get("en"):
        return ["voice calls: the English greetings could not be read (voice-call-prompt.ts, VoiceCall.swift)"]
    for language in wanted:
        for where, table in (("voice-call-prompt.ts", engine), ("VoiceCall.swift", core)):
            if len(table.get(language, [])) != len(table["en"]):
                problems.append(f"{where}: {len(table.get(language, []))} greetings in {language}, {len(table['en'])} in English")
        pairs = zip(engine.get(language, []), core.get(language, []))
        for index, (a, b) in enumerate(pairs):
            if not same_words(a, b):
                problems.append(f"voice calls: greeting {index + 1} in {language} differs between the engine ({a!r}) and the core ({b!r})")
    return problems


def check_server_voice(wanted: list[str]) -> list[str]:
    """The server's agent has each language, and the engine and the core send
    exactly the languages it has (one it was not given is refused)."""
    text = (ROOT / "server/simeon/desktop/voice.py").read_text()
    table = re.search(r"VOICE_LANGUAGES: dict\[str, str\] = \{(.*?)\n\}", text, re.S)
    server = set(re.findall(r'\n    "([\w-]+)": ', table.group(1))) if table else set()
    problems = [f"server/simeon/desktop/voice.py: VOICE_LANGUAGES has no {language}" for language in wanted if language not in server]
    engine_text = (ROOT / "desktop/source/shared/voice-call/voice-call-prompt.ts").read_text()
    engine_table = re.search(r"const VOICE_CALL_LANGUAGES[^=]*= \{(.*?)\};", engine_text, re.S)
    engine = set(re.findall(r':\s*"([\w-]+)"', engine_table.group(1))) if engine_table else set()
    core_text = (ROOT / "ios/SimeonCore/Sources/SimeonCore/VoiceCall.swift").read_text()
    core_table = re.search(r"static let languages: \[String: String\] = \[(.*?)\]", core_text, re.S)
    core = set(re.findall(r':\s*"([\w-]+)"', core_table.group(1))) if core_table else set()
    for where, sent in (("voice-call-prompt.ts VOICE_CALL_LANGUAGES", engine), ("VoiceCall.swift VoiceCallText.languages", core)):
        if sent != server | {"en"}:
            problems.append(f"{where} sends {sorted(sent)}; the server's agent has {sorted(server | {'en'})}")
    return problems


CORE = ROOT / "ios/SimeonCore/Sources"
CORE_CATALOG = CORE / "SimeonCore/Resources/Localizable.xcstrings"


def swift_literal(text: str, start: int) -> tuple[str, int]:
    """The pattern of the string literal at `start` (each `\\(…)` a value) and where it ends."""
    out, i = [], start + 1
    while text[i] != '"':
        if text.startswith("\\(", i):
            depth, i = 1, i + 2
            while depth:
                if text[i] == '"':
                    i = swift_literal(text, i)[1]
                    continue
                depth += {"(": 1, ")": -1}.get(text[i], 0)
                i += 1
            out.append("(?:%@|%lld)")
            continue
        if text.startswith("\\u{", i):
            end = text.index("}", i)
            out.append(re.escape(chr(int(text[i + 3:end], 16))))
            i = end + 1
            continue
        if text[i] == "\\":
            out.append(re.escape({"n": "\n", "t": "\t"}.get(text[i + 1], text[i + 1])))
            i += 2
            continue
        out.append("%%" if text[i] == "%" else re.escape(text[i]))
        i += 1
    return "".join(out), i + 1


def check_core_keys() -> list[str]:
    """Every sentence the core shows (`L10n.text`) is in its catalog: String values are `%@`, Int ones `%lld`."""
    keys = set(json.loads(CORE_CATALOG.read_text()).get("strings", {}))
    problems: list[str] = []
    for path in sorted(CORE.rglob("*.swift")):
        if path.name == "L10n.swift":
            continue
        text = path.read_text()
        for call in re.finditer(r"\bL10n\.text\(\s*", text):
            line = text.count("\n", 0, call.start()) + 1
            if text[call.end()] != '"':
                problems.append(f"{path.relative_to(ROOT)}:{line}: L10n.text takes a string literal")
                continue
            pattern, _ = swift_literal(text, call.end())
            if not any(re.fullmatch(pattern, key) for key in keys):
                problems.append(f"{path.relative_to(ROOT)}:{line}: not in the core's catalog ({CORE_CATALOG.relative_to(ROOT)})")
    return problems


def table_keys(text: str, name: str) -> dict[str, str]:
    """The `"key": "value"` pairs of one object or dict named `name` in a source file (TS or Python)."""
    found = re.search(rf"\b{name}\b[^=\n]*=\s*\{{(.*?)\n\}}", text, re.S)
    if found is None:
        return {}
    # A value may be written over several lines: "a" "b" (Python), "a" + "b" (TS), in parentheses.
    pairs = re.findall(r'^\s*"([^"]+)"\s*:\s*\(?\s*((?:"(?:[^"\\]|\\.)*"\s*\+?\s*)+)', found.group(1), re.M)
    pairs += re.findall(r"^\s*([A-Za-z]\w*)\s*:\s*\(?\s*((?:'(?:[^'\\]|\\.)*'\s*\+?\s*)+)", found.group(1), re.M)
    return {key: value for key, value in pairs}


#: The emails' tables (`server/emails/src/words.ts`) are named for their language.
EMAIL_TABLES = {"en": "ENGLISH", "fr": "FRENCH", "es": "SPANISH", "de": "GERMAN", "pt-BR": "BRAZILIAN_PORTUGUESE", "ja": "JAPANESE", "it": "ITALIAN", "nl": "DUTCH", "ko": "KOREAN", "zh-Hant": "TRADITIONAL_CHINESE", "ar": "ARABIC"}


def check_tables(wanted: list[str]) -> list[str]:
    """Each translation of the engine's, the server's and the emails' sentences has every English key, with its `{values}`."""
    sets: list[tuple[str, dict[str, str], dict[str, dict[str, str]]]] = []
    for part in sorted((ROOT / "desktop/source/shared/words/areas").glob("*.ts")) + sorted((ROOT / "server/simeon/desktop/words").glob("_[a-z]*.py")):
        text = part.read_text()
        name = lambda language: language.upper().replace("-", "_")  # noqa: E731
        sets.append((str(part.relative_to(ROOT)), table_keys(text, "EN"), {language: table_keys(text, name(language)) for language in wanted}))
    words = ROOT / "server/simeon/desktop/words"
    sets.append((
        "server/simeon/desktop/words/<language>.py",
        table_keys((words / "en.py").read_text(), "WORDS"),
        {language: table_keys((words / f"{language}.py").read_text(), "WORDS") if (words / f"{language}.py").exists() else {} for language in wanted},
    ))
    emails = (ROOT / "server/emails/src/words.ts").read_text()
    sets.append(("server/emails/src/words.ts", table_keys(emails, "ENGLISH"), {language: table_keys(emails, EMAIL_TABLES.get(language, language.upper())) for language in wanted}))
    problems: list[str] = []
    for where, english, translations in sets:
        for language, table in translations.items():
            for key, value in english.items():
                if key not in table:
                    problems.append(f"{where}: {key!r} has no {language}")
                elif sorted(re.findall(r"\{(\w+)\}", table[key])) != sorted(re.findall(r"\{(\w+)\}", value)):
                    problems.append(f"{where}: {key!r} in {language} has other {{values}}")
    return problems


#: App Store Connect's limits, in characters.
LISTING_LIMITS = {"name.txt": 30, "subtitle.txt": 30, "promotional_text.txt": 170, "keywords.txt": 100, "description.txt": 4000, "release_notes.txt": 4000}


def check_listing(wanted: list[str]) -> list[str]:
    """The App Store page in each language: every English field, each within its limit."""
    root = ROOT / "ios/AppStore/metadata"
    english = root / "en-US"
    if not english.is_dir():
        return []
    problems: list[str] = []
    for language in wanted:
        folders = [path for path in root.iterdir() if path.is_dir() and path.name.split("-")[0] == language.split("-")[0]]
        if not folders:
            problems.append(f"ios/AppStore/metadata: no {language} folder")
            continue
        for folder in folders:
            for field in sorted(english.glob("*.txt")):
                path = folder / field.name
                if not path.is_file() or not path.read_text().strip():
                    problems.append(f"{path.relative_to(ROOT)}: missing")
    for path in sorted(root.glob("*/*.txt")):
        limit = LISTING_LIMITS.get(path.name)
        if limit is not None and len(path.read_text().strip()) > limit:
            problems.append(f"{path.relative_to(ROOT)}: longer than App Store Connect's {limit}")
    return problems


def main() -> int:
    wanted = languages()
    if not wanted:
        print("check_translations: no language besides English in ios/project.yml (CFBundleLocalizations)")
        return 1
    problems: list[str] = []
    for path in catalogs():
        problems += check_catalog(path, wanted)
    problems += check_greetings(wanted)
    problems += check_server_voice(wanted)
    problems += check_core_keys()
    problems += check_tables(wanted)
    problems += check_listing(wanted)
    if problems:
        for problem in problems[:200]:
            print(problem)
        if len(problems) > 200:
            print(f"… and {len(problems) - 200} more")
        print(f"check_translations: {len(problems)} missing")
        return 1
    print(f"check_translations: every string has {', '.join(wanted)} ({len(catalogs())} catalogs)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
