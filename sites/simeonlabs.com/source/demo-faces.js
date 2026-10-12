/* The demo's agents wear the apps' clay faces (the founder, 12 October 2026: no more butterflies).
   build.py fills in the catalogue (ios/SimeonCore/Sources/SimeonCore/Resources/Faces), the faces
   faces.py gives the demo's own agents (the apps' choice, AgentFaces.plan), and the name lists
   (desktop/source/shared/voice-call/name-genders.ts). The demo asks for a face per agent
   (desktop/demo/backend.ts); one made in the demo gets one as the apps would give it: Simeon's own
   for a Chief of Staff, else the face its name's gender has fewest of, ties settled by its id. */
(() => {
  const FACES = /*FACES*/[];
  const GIVEN = /*GIVEN*/{};
  const WOMEN = new Set(/*WOMEN*/"".split(" ")), MEN = new Set(/*MEN*/"".split(" "));
  const SIMEON = "clay-simeon";
  const TITLES = { mrs: "female", ms: "female", miss: "female", madam: "female", lady: "female", mr: "male", sir: "male", lord: "male",
    dr: null, doctor: null, prof: null, professor: null, captain: null, coach: null };
  const byId = Object.fromEntries(FACES.map((f) => [f.id, f]));
  const pool = FACES.filter((f) => f.id !== SIMEON);

  // AgentVoices.nameGender: the first word that is a name, after any title.
  const nameGender = (name) => {
    const words = String(name).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().match(/[a-z]+/g) || [];
    for (const word of words) {
      if (word in TITLES) { if (TITLES[word]) return TITLES[word]; continue; }
      return WOMEN.has(word) ? "female" : MEN.has(word) ? "male" : null;
    }
    return null;
  };
  // AgentVoices.stableHash: FNV-1a over the UTF-16 code units.
  const hash = (text) => {
    let h = 2166136261;
    for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return h >>> 0;
  };
  // AgentFaces.pick: the face fewest agents wear among the gender's, ties by the agent's id.
  const pick = (id, gender) => {
    const matching = pool.filter((f) => f.gender === gender), candidates = matching.length ? matching : pool;
    const worn = Object.values(GIVEN), count = (f) => worn.filter((w) => w === f.id).length;
    const fewest = Math.min(...candidates.map(count)), free = candidates.filter((f) => count(f) === fewest);
    return free[hash(id) % free.length];
  };

  const byName = {};
  globalThis.__simeonDemoFace = (row) => {
    if (!row || row.isGroup) return null;
    let id = GIVEN[row.id];
    if (!id) {
      const chief = /^(chief of staff|coo)$/i.test(String(row.title || "").trim()) && !Object.values(GIVEN).includes(SIMEON);
      id = chief ? SIMEON : pick(row.id, nameGender(row.name || "") || (hash(row.id) % 2 === 0 ? "female" : "male")).id;
      GIVEN[row.id] = id;
    }
    const face = byId[id];
    if (face && row.name) byName[String(row.name).trim().toLowerCase()] = "./faces/" + face.file;
    return face ? { url: "./faces/" + face.file, version: face.version } : null;
  };

  // A mention in a message names its agent only: its face is found by that name (demo-glass.css draws it).
  const dress = (root) => {
    for (const mention of root.querySelectorAll ? root.querySelectorAll(".simeon-agent:not([data-face])") : []) {
      const url = byName[mention.textContent.trim().toLowerCase()];
      if (!url) continue;
      mention.setAttribute("data-face", "");
      mention.style.setProperty("--simeon-face", 'url("' + url + '")');
    }
  };
  const watch = () => {
    dress(document);
    new MutationObserver((changes) => { for (const c of changes) for (const n of c.addedNodes) if (n.nodeType === 1) dress(n.parentElement || n); })
      .observe(document.body, { childList: true, subtree: true });
  };
  if (document.body) watch(); else document.addEventListener("DOMContentLoaded", watch);
})();
