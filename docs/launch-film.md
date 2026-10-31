# The launch film

The film that introduces Simeon (the founder, 31 October 2026). It is made
after Anthropic's "Tag @Claude in" launch video, which the founder chose as the
style, with Iris (the clay face `clay-06`) as the person who talks, since the
founder will not be on camera. Nothing here is made yet: the first step is the
test below.

## The reference, in short

A 2 min 25 s film, 16:9. One presenter from the team that built it, at a desk
in a warm wooden office, talking plainly ("honestly", "the cool part is"),
about 360 words in two minutes, over one soft music bed.

1. **0:00–0:11, no words.** Chat bubbles over a blurred office: she asks Claude
   to take her triage "for the next few hours"; Claude: "On it. Good luck at
   the shoot, you're on in 15". The title types itself, "Tag @Claude in", the
   name in the brand's coloured pill.
2. **0:12–0:31.** She says who she is and what launches today; her name under
   her; a close side angle with "hey @Claude" typing beside her face; one proof
   number.
3. **0:32–1:05, demo 1.** Her shot shrinks into a rounded card on a mint
   ground, then the real app: a thread at chat speed in which Claude is
   corrected and adapts; a highlight sweeps each word she names; the camera
   pushes slowly toward the newest message.
4. **1:05–1:36, demo 2.** Back to her, then a second thread where Claude acts
   unasked, with a checklist ticking one line at a time.
5. **1:36–2:11, trust.** A glass panel draws a diagram in step with her words
   (what it can and cannot see); cuts on each sentence; a one-line call to
   action.
6. **2:12–2:25, no words.** She is back: "How's triage going?" and the answer
   ("11 sorted, 3 worth your eyes tomorrow. How was the shoot?"). The film was
   the shoot. The title becomes the logo.

## Ours

- **Iris presents.** She is `clay-06`, the first hire in "Introducing Simeon"
  ("Iris just joined your team"): an agent introduces Simeon. Her terracotta
  (`#c47256`, her stripes) plays the part of the reference's coral.
- **The bookend.** Iris to Simeon: "Can you cover my inbox for the next hour?
  I'm filming the launch video." Simeon: "On it. Good luck, you're on in 15."
  At the end: "Back! How did it go?" Simeon: "Theo took the invoices, Maya
  drafted 6 replies, 2 are waiting for your OK."
- **Title:** "Meet Simeon", Simeon in the apps' mention pill (his face, the
  name in the app's blue).
- **Demo 1:** the first question, "Iris just joined your team", she gets to
  work. **Demo 2 (unasked):** Theo sees Acme 34 days late on $4,200 and asks;
  the draft comes back; Send.
- **Trust:** only what the code does (drafts come back, Allow or Deny on a
  purchase, passwords in a form the agent cannot see, take over the computer).
  A "this agent cannot see that app" diagram only once the code is checked.
- **Made from:** Iris generated in Higgsfield; the app's screens recorded from
  the real Mac app (never generated); the titles, bubbles and diagram drawn as
  motion graphics.

## The test: 8 seconds of Iris talking

Before the film, one close-up, to see whether lip sync works on clay.

- **References:** `ios/SimeonCore/Sources/SimeonCore/Resources/Faces/clay-06.webp`
  (512, the face) and `.../Faces/Standing/clay-06.webp` (the cut-out, with the
  sweater and the notepad).
- **The line:** "Hey, I'm Iris. I work at SimeonLabs. Well, I'm one of the
  agents. And today, we're launching Simeon." (about 7 s; "Simeon" is
  SIM-ee-un.)
- **1. The still** (an image model with both references; 16:9):

  > Close-up interview shot of the clay character from the reference images,
  > seated at a wooden desk in a warm home office. Shoulders up, three-quarter
  > view, looking just to the left of the camera as if talking to an
  > interviewer, small relaxed smile, mouth closed. Keep her exactly as in the
  > references: handmade clay / plasticine figure with a soft matte clay
  > texture, dark brown chin-length bob with blunt bangs, small coloured
  > pencils clipped in her hair, round tortoiseshell glasses, rust, cream and
  > brown striped turtleneck. She is a stylized clay character, not a real
  > human. Background softly out of focus: warm wooden shelves with books and
  > plants, a glowing table lamp making round bokeh, late-afternoon light.
  > Shallow depth of field, 50mm lens, gentle warm colour, documentary
  > interview look. Space on the right of the frame. No text.

- **2. The voice:** a warm woman in her early thirties, natural and
  conversational, not an announcer, American English. The whole film keeps
  this voice.
- **3. The motion:** a model that takes the still as the start image and the
  voice as an audio reference (Higgsfield lists Wan 2.7, "character-consistent",
  2–15 s), 8 s, 16:9:

  > The clay character in the image speaks the words in the audio to someone
  > just off camera, warm and relaxed, lips matching every word. A small amused
  > smile before "Well", brighter at "launching Simeon". Natural blinks, small
  > head movements. Camera almost still, very slow push-in. She stays a
  > handmade clay character exactly as in the image. No captions.

- **4. Only if the mouth is off:** a lip-sync pass (Higgsfield's Sync Lipsync 3:
  the clip and the voice).
- **Judge:** the lips on "Iris" and "Simeon" (the m closes them); still clay
  and still `clay-06`; the glasses steady; natural blinks.

## Running it from a Claude session

The Higgsfield connector on claude.ai reads only (account, models, history);
it cannot generate. Higgsfield's API can: a separate prepaid balance (not the
plan's credits), base `https://api.higgsfield.ai`, header
`Authorization: Key <key id>:<key secret>` (docs.higgsfield.ai). The session
reads the two parts from the environment as `HF_API_KEY_ID` and
`HF_API_KEY_SECRET`. Veo is not listed in the API; Wan, Kling and Seedance are.
