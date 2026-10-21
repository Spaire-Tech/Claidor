/**
 * The person's language (20 October 2026): the apps write `userLanguage`
 * beside `userTimeZone`; every agent then writes to the person in it, its
 * first hello and Simeon's introduction too, says "tu" in French unless asked
 * for "vous", and never translates a name. English, or no language, leaves
 * every prompt exactly as it was. A voice call hears and speaks it.
 */
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function load(entry, name) {
  const dir = await mkdtemp(path.join(os.tmpdir(), `simeon-${name}-`));
  const outfile = path.join(dir, `${name}.mjs`);
  await build({ entryPoints: [path.join(repoRoot, entry)], outfile, bundle: true, format: "esm", platform: "node", target: "node22", logLevel: "silent", external: ["electron"], banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" } });
  const module = await import(`${pathToFileURL(outfile).href}?${Date.now()}`);
  return { module, dir, dispose: () => rm(dir, { recursive: true, force: true }) };
}

function assemblyDeps(overrides = {}) {
  return {
    basePrompt: "You are Simeon.",
    isSubagentRunner: false,
    isSharedRoomRunner: false,
    isSystemPromptOverridden: false,
    agentProfileProvider: () => ({ name: "Theo", description: "runs the inbox", filePath: "", settingsFilePath: "" }),
    agentStore: () => null,
    compactionEpoch: () => 0,
    memoryStore: () => null,
    memorySnapshots: () => null,
    userMemory: () => null,
    projectMemory: () => null,
    isBoxScopedSubagent: () => false,
    requestContext: { resolve: () => ({ timeZone: "Europe/Paris", userFullName: "Bass Fall" }) },
    automationStore: () => null,
    workflowStore: () => null,
    channelStore: () => null,
    connectorManifests: [],
    mcpManagement: () => null,
    mcpCustomInstructionsSection: () => null,
    mcpDiscoveryStatusSection: () => null,
    remoteBoxSection: () => "",
    computerSection: () => null,
    ...overrides,
  };
}

test("a language tag is kept as BCP 47 writes it; anything else is no language", async () => {
  const { module, dispose } = await load("source/shared/user-language.ts", "user-language");
  try {
    assert.equal(module.normalizeUserLanguage("fr"), "fr");
    assert.equal(module.normalizeUserLanguage(" fr-ca "), "fr-CA");
    assert.equal(module.normalizeUserLanguage("pt_BR"), "pt-BR");
    assert.equal(module.normalizeUserLanguage("zh-hant"), "zh-Hant");
    for (const junk of [undefined, null, 3, "", "  ", "f", "français", "fr;q=0.9", "x".repeat(40)]) assert.equal(module.normalizeUserLanguage(junk), undefined, String(junk));
    assert.equal(module.isEnglishOrUnset(undefined), true);
    assert.equal(module.isEnglishOrUnset("en-GB"), true);
    assert.equal(module.isEnglishOrUnset("fr"), false);
    assert.equal(module.languageName("fr-CA"), "French");
    assert.equal(module.languageName("pt-BR"), "Brazilian Portuguese");
  } finally {
    await dispose();
  }
});

test("the server hears the person's language, never English or none", async () => {
  const { module, dispose } = await load("source/shared/user-language.ts", "user-language-header");
  try {
    assert.deepEqual(module.acceptLanguageHeader("fr"), { "accept-language": "fr" });
    assert.deepEqual(module.acceptLanguageHeader("pt_BR"), { "accept-language": "pt-BR" });
    for (const nothing of [undefined, null, "", "en", "en-GB", "français"]) assert.deepEqual(module.acceptLanguageHeader(nothing), {}, String(nothing));
    assert.equal(module.currentUserLanguage(), undefined, "unpinned: English");
    module.pinUserLanguageReader(() => "fr");
    assert.equal(module.currentUserLanguage(), "fr");
    module.pinUserLanguageReader(() => { throw new Error("settings not ready"); });
    assert.equal(module.currentUserLanguage(), undefined);
    module.pinUserLanguageReader(null);
  } finally {
    await dispose();
  }
});

test("the prompt names the language, says tu in French, and keeps names as they are", async () => {
  const { module, dispose } = await load("source/shared/user-language.ts", "user-language-prompt");
  try {
    const french = module.renderUserLanguageSystemPrompt("fr");
    assert.match(french, /^## Language/);
    assert.match(french, /The user's Simeon apps are in French \(français\)\. Write to the user in French/);
    assert.match(french, /starting with your very first hello/);
    assert.match(french, /question widget \(its question, options and helpText\)/);
    assert.match(french, /If the user writes to you in another language, answer in theirs\./);
    assert.match(french, /Never translate names: Simeon, SimeonLabs, the agents' names/);
    assert.match(french, /Gmail, Slack, Link, Shop, Stripe/);
    assert.match(french, /say "tu" to the user/);
    assert.match(french, /switch to "vous" and keep it from then on/);
    assert.match(french, /update_state, target "memory", scope "user", action "write"/, "the vous preference is remembered for every agent");
    // Spanish: "tú" by default, "usted" when asked for, remembered the same way; neutral Spanish, the person's own way followed.
    const spanish = module.renderUserLanguageSystemPrompt("es-MX");
    assert.match(spanish, /Write to the user in Spanish/);
    assert.match(spanish, /In Spanish, say "tú" to the user/);
    assert.match(spanish, /switch to "usted" and keep it from then on/);
    assert.match(spanish, /"Prefers to be addressed as usted in Spanish"/);
    assert.match(spanish, /¿ and ¡ open every question and exclamation/);
    assert.doesNotMatch(spanish, /"tu"|"vous"/);
    // Another language: named, but no rule of address.
    const german = module.renderUserLanguageSystemPrompt("de");
    assert.match(german, /Write to the user in German/);
    assert.doesNotMatch(german, /"tu"|"vous"|"tú"|"usted"/);
    // English or none: nothing at all.
    for (const english of [undefined, null, "", "en", "en-US", "nonsense!"]) assert.equal(module.renderUserLanguageSystemPrompt(english), "", String(english));
  } finally {
    await dispose();
  }
});

test("every agent's instructions carry the language; English reads exactly as before", async () => {
  const { module, dispose } = await load("source/host/runner/system-prompt-assembly.ts", "prompt-assembly-language");
  try {
    const before = module.createSystemPromptAssembly(assemblyDeps()).getSystemPrompt();
    const english = module.createSystemPromptAssembly(assemblyDeps({ userLanguage: () => "en" })).getSystemPrompt();
    const unset = module.createSystemPromptAssembly(assemblyDeps({ userLanguage: () => undefined })).getSystemPrompt();
    assert.equal(english, before, "English is unchanged");
    assert.equal(unset, before, "no language is unchanged");
    assert.doesNotMatch(before, /## Language/);

    let language = "fr";
    const assembly = module.createSystemPromptAssembly(assemblyDeps({ userLanguage: () => language }));
    const french = assembly.getSystemPrompt();
    assert.match(french, /## Language\nThe user's Simeon apps are in French/);
    assert.match(french, /say "tu" to the user/);
    assert.ok(french.indexOf("## Language") < french.indexOf("Your user is Bass Fall"), "early, with what does not change");
    language = "en";
    assert.equal(assembly.getSystemPrompt(), before, "changed back to English, the prompt is as before");

    const room = module.createSystemPromptAssembly(assemblyDeps({ isSharedRoomRunner: true, userLanguage: () => "fr" })).getSystemPrompt();
    assert.match(room, /## Language/, "a group chat is in the person's language too");
    const child = module.createSystemPromptAssembly(assemblyDeps({ isSubagentRunner: true, userLanguage: () => "fr" })).getSystemPrompt();
    assert.doesNotMatch(child, /## Language/, "a subagent writes to its agent, not to the person");
  } finally {
    await dispose();
  }
});

test("the first hello and Simeon's introduction are in the person's language", async () => {
  const language = await load("source/shared/user-language.ts", "user-language-cue");
  const onboarding = await load("source/shared/agents/onboarding.ts", "onboarding-language");
  const chief = await load("source/shared/agents/chief-of-staff.ts", "chief-language");
  try {
    const { firstRunCueInLanguage } = language.module;
    for (const cue of [onboarding.module.SAND_ONBOARDING_KICKSTART_PROMPT, chief.module.SAND_CHIEF_OF_STAFF_KICKSTART_PROMPT, chief.module.staffedFirstRunCue({ fromName: "Simeon", personName: "Bass" })]) {
      assert.equal(firstRunCueInLanguage(cue, undefined), cue, "no language: the cue as it was");
      assert.equal(firstRunCueInLanguage(cue, "en-US"), cue, "English: the cue as it was");
      const french = firstRunCueInLanguage(cue, "fr");
      assert.ok(french.startsWith(cue), "the cue itself is unchanged");
      assert.match(french, /The user's apps are in French: write every message of this turn to the user in French, question widgets \(question, options and helpText\) included/);
      assert.match(french, /Say "tu" to the user\./);
      assert.match(french, /Names of apps, connectors and agents stay as they are\./);
    }
    assert.match(firstRunCueInLanguage("cue", "es"), /The user's apps are in Spanish: .* Say "tú" to the user\./);
    assert.doesNotMatch(firstRunCueInLanguage("cue", "de"), /"tu"|"tú"/, "only the languages with a familiar you");
  } finally {
    await Promise.all([language.dispose(), onboarding.dispose(), chief.dispose()]);
  }
});

test("the engine reads the language where it builds the prompt and the first-run cues", async () => {
  const composition = await readFile(path.join(repoRoot, "source/host/host-runner-composition.ts"), "utf8");
  assert.match(composition, /userLanguage: \(\) => \{\n\s*const value = method\(settings, "getUserLanguage"\)\?\.\(\);/);
  assert.match(composition, /method\(extensions\.api\("transcript"\), "setUserLanguageResolver"\)/);
  const lifecycle = await readFile(path.join(repoRoot, "source/host/extensions/transcript/agent-lifecycle.ts"), "utf8");
  assert.match(lifecycle, /const prompt = firstRunCueInLanguage\(/);
  assert.match(lifecycle, /this\.tm\.userLanguage\?\.\(\)/);
  const messaging = await readFile(path.join(repoRoot, "source/host/extensions/transcript/agent-to-agent-messaging.ts"), "utf8");
  assert.match(messaging, /firstRunCueInLanguage\(staffedFirstRunCue\(/);
});

test("the host keeps userLanguage beside userTimeZone and answers it", async () => {
  const { module, dir, dispose } = await load("source/host/extensions/settings/settings-service.ts", "settings-language");
  try {
    const service = new module.SettingsService(path.join(dir, "settings.json"));
    assert.equal(service.getHostSettings().userLanguage, undefined);
    service.setHostSettings({ userLanguage: "fr", userTimeZone: "Europe/Paris" });
    assert.equal(service.getHostSettings().userLanguage, "fr");
    assert.equal(service.getUserLanguage(), "fr");
    assert.equal(service.getHostSettings().userTimeZone, "Europe/Paris");
    service.setHostSettings({ userLanguage: "not a language" });
    assert.equal(service.getUserLanguage(), "fr", "junk is ignored");
    service.setHostSettings({ userLanguage: "pt_br" });
    assert.equal(service.getUserLanguage(), "pt-BR");
    const stored = JSON.parse(await readFile(path.join(dir, "settings.json"), "utf8"));
    assert.equal(stored.userLanguage, "pt-BR");
    service.setHostSettings({ userLanguage: "" });
    assert.equal(service.getUserLanguage(), undefined, "\"\" forgets it");
    assert.equal("userLanguage" in service.getHostSettings(), false);
  } finally {
    await dispose();
  }
});

test("a voice call hears and speaks the person's language, its first line too", async () => {
  const { module, dispose } = await load("source/shared/voice-call/voice-call-prompt.ts", "voice-language");
  try {
    assert.equal(module.voiceCallLanguage(undefined), "en");
    assert.equal(module.voiceCallLanguage("fr-CA"), "fr");
    assert.equal(module.voiceCallLanguage("es-419"), "es");
    assert.equal(module.voiceCallLanguage("de"), "en", "a language the server's voice agent was not given yet is English");
    assert.equal(module.voiceCallLanguage("tlh"), "en");

    const english = module.buildVoiceCallOverrides({ agent: { name: "Theo" }, transcript: [], pick: 0, personName: "Bass" });
    const unset = module.buildVoiceCallOverrides({ agent: { name: "Theo" }, transcript: [], pick: 0, personName: "Bass", language: "en" });
    assert.deepEqual(unset, english, "English is unchanged");
    assert.equal(english.agent.language, "en");
    assert.equal(english.agent.firstMessage, "Hey Bass, it's Theo. What's up?");
    assert.doesNotMatch(english.agent.prompt.prompt, /Language:/);

    const french = module.buildVoiceCallOverrides({ agent: { name: "Theo" }, transcript: [], pick: 0, personName: "Bass", language: "fr" });
    assert.equal(french.agent.language, "fr");
    assert.equal(french.agent.firstMessage, "Salut Bass, c’est Theo. Quoi de neuf ?");
    assert.match(french.agent.prompt.prompt, /Language:\n- Speak French for the whole call\./);
    assert.match(french.agent.prompt.prompt, /Say "tu" to them/);
    assert.match(french.agent.prompt.prompt, /Names stay as they are/);
    const spanish = module.buildVoiceCallOverrides({ agent: { name: "Theo" }, transcript: [], pick: 0, personName: "Bass", language: "es" });
    assert.equal(spanish.agent.language, "es");
    assert.equal(spanish.agent.firstMessage, "Hola Bass, soy Theo. ¿Qué tal?");
    assert.match(spanish.agent.prompt.prompt, /Language:\n- Speak Spanish for the whole call\./);
    assert.match(spanish.agent.prompt.prompt, /Say "tú" to them, warm and direct, never stiff, unless they ask for "usted"/);
    const spanishGreetings = new Set([0, 0.2, 0.4, 0.6, 0.8, 0.99].map((pick) => module.buildFirstMessage("Theo", pick, null, "es")));
    assert.equal(spanishGreetings.size, 5, "five Spanish openings, as in English");
    for (const greeting of spanishGreetings) {
      assert.match(greeting, /Theo/);
      assert.doesNotMatch(greeting, /!/, "calm, no exclamation mark");
      assert.doesNotMatch(greeting, /\busted\b/, "tú, not usted");
      assert.match(greeting, /¿[^?]+\?$/, "a question opens with ¿");
    }
    const greetings = new Set([0, 0.2, 0.4, 0.6, 0.8, 0.99].map((pick) => module.buildFirstMessage("Theo", pick, null, "fr")));
    assert.equal(greetings.size, 5, "five French openings, as in English");
    for (const greeting of greetings) {
      assert.match(greeting, /Theo/);
      assert.doesNotMatch(greeting, /!/, "calm, no exclamation mark");
      assert.doesNotMatch(greeting, /\bvous\b/, "tu, not vous");
      assert.doesNotMatch(greeting, / \?/, "a narrow no-break space before ?, never a plain one");
    }
    // A language the voice does not speak yet: the call is English, as before.
    const german = module.buildVoiceCallOverrides({ agent: { name: "Theo" }, transcript: [], pick: 0, personName: "Bass", language: "de" });
    assert.deepEqual(german, english);
    assert.match(module.voiceCallLanguageRule("pt-BR"), /Speak Brazilian Portuguese for the whole call\./, "the rule names the person's own language");
  } finally {
    await dispose();
  }
});
