import { describe, expect, test } from "vitest";
import {
  Appearance,
  beatsAt,
  linesOf,
  OnboardingPhase,
  OnboardingTask,
  OTHER_REPLY,
  PermissionAnswer,
  phaseDone,
  RIDDLE,
  ROLES,
  segmentsOf,
  shownWords,
  stageOf,
  taskCopy,
  WORDS_PER_SECOND,
  WordState,
  wordsOf,
} from "./caisra-onboarding.js";

/**
 * Yodo's words, held to the founder's.
 *
 * Ported with the script from `desktop/src/shared/onboarding/script.test.ts`.
 * The assertions are theirs. This file exists so that a sentence of the
 * founder's cannot be quietly reworded by anyone, me included.
 */

describe("Yodo's words", () => {
  test("the greeting carries the name, and a blank name is not a blank greeting", () => {
    expect(linesOf(OnboardingPhase.Open, { userName: "Bass" })[0]).toBe("Hey, Bass!");
    expect(linesOf(OnboardingPhase.Open, { userName: "  " })[0]).toBe("Hey, there!");
    expect(linesOf(OnboardingPhase.Open, { userName: "Bass" })[1]).toBe(
      "My name is Yodo. I'm your Chief of Staff.",
    );
  });

  test("ten roles, each with its reply, and one for their own words", () => {
    expect(ROLES).toHaveLength(10);
    expect(ROLES[0]?.label).toBe("Finance");
    expect(linesOf(OnboardingPhase.Role, { userName: "B", role: 9 })[0]).toMatch(
      /My kind of client/,
    );
    expect(
      linesOf(OnboardingPhase.Role, { userName: "B", role: { other: "I run a bakery" } })[0],
    ).toBe(OTHER_REPLY);
  });

  test("the appearance card reads the Mac and offers the other mode", () => {
    const light = taskCopy(Appearance.Light).find((one) => one.task === OnboardingTask.Appearance);
    expect(light?.label).toBe("Change my theme to dark mode");
    expect(light?.doneLine).toMatch(/went dark\.$/);
    expect(light?.resultName).toMatch(/Dark$/);
    const dark = taskCopy(Appearance.Dark).find((one) => one.task === OnboardingTask.Appearance);
    expect(dark?.label).toBe("Change my theme to light mode");
    expect(dark?.doneLine).toMatch(/went light\.$/);
    expect(dark?.resultName).toMatch(/Light$/);
  });

  test("three endings: done, declined, and a failure that is never called done", () => {
    const task = taskCopy(Appearance.Light)[0];
    if (!task) throw new Error("no task copy");
    const done = linesOf(OnboardingPhase.Task, {
      userName: "B",
      task,
      answer: PermissionAnswer.Allowed,
    });
    expect(done[0]).toBe(task.doneLine);
    expect(done[2]).toBe("You're all set.");

    const declined = linesOf(OnboardingPhase.Task, {
      userName: "B",
      task,
      answer: PermissionAnswer.Declined,
    });
    expect(declined[0]).toMatch(/^No bother/);

    // Saying "Done" over a note that was never written is the lie the app must
    // not tell, so a failure gets its own words.
    const failed = linesOf(OnboardingPhase.Task, {
      userName: "B",
      task,
      answer: PermissionAnswer.Allowed,
      failure: "macOS did not allow it.",
    });
    expect(failed[0]).toBe("That didn't go through: macOS did not allow it.");
    expect(failed.join(" ")).not.toMatch(/Done/);
  });

  test("the one riddle has an answer", () => {
    expect(RIDDLE.question).toMatch(/\?$/);
    expect(RIDDLE.answer).toBe("An echo.");
  });
});

describe("how it streams", () => {
  test("words keep the space that precedes them, so joining them is the sentence", () => {
    expect(wordsOf("Hey, Bass!")).toEqual(["Hey,", " Bass!"]);
    expect(wordsOf("a b c").join("")).toBe("a b c");
  });

  test("lines sit on one clock with three beats between them", () => {
    const { segments, total } = segmentsOf(["one two", "three"]);
    expect(segments.map((one) => one.offset)).toEqual([0, 5]);
    expect(total).toBe(9);
  });

  test("thirteen words a second, never past the end", () => {
    expect(beatsAt(0, 50)).toBe(0);
    expect(beatsAt(1000, 50)).toBe(WORDS_PER_SECOND);
    expect(beatsAt(60_000, 50)).toBe(50);
  });

  test("a playing phase lays out every word and fades in the ones reached", () => {
    const lines = ["one two three", "four five"];
    const playing = { phase: OnboardingPhase.Open, beats: 2 };
    expect(shownWords(lines, 0, playing, OnboardingPhase.Open)).toEqual([
      { text: "one", state: WordState.In },
      { text: " two", state: WordState.In },
      { text: " three", state: WordState.Hidden },
    ]);
    // The second line is on the page before its first beat, all of it hidden,
    // so the line wraps once and nothing moves while it streams.
    expect(shownWords(lines, 1, playing, OnboardingPhase.Open).map((one) => one.state)).toEqual([
      WordState.Hidden,
      WordState.Hidden,
    ]);
  });

  test("a played phase shows all of it, still; a later one shows nothing", () => {
    const lines = ["one two three", "four five"];
    const playing = { phase: OnboardingPhase.Open, beats: 2 };
    const later = { phase: OnboardingPhase.Role, beats: 0 };
    expect(shownWords(lines, 1, later, OnboardingPhase.Open).map((one) => one.state)).toEqual([
      WordState.Still,
      WordState.Still,
    ]);
    expect(shownWords(lines, 0, playing, OnboardingPhase.Role)).toEqual([]);
  });

  test("a phase is done when its last word has landed, or when it is behind us", () => {
    const lines = ["one two three", "four five"];
    const playing = { phase: OnboardingPhase.Open, beats: 2 };
    const later = { phase: OnboardingPhase.Role, beats: 0 };
    expect(phaseDone(lines, playing, OnboardingPhase.Open)).toBe(false);
    expect(phaseDone(lines, { phase: OnboardingPhase.Open, beats: 11 }, OnboardingPhase.Open)).toBe(
      true,
    );
    expect(phaseDone(lines, later, OnboardingPhase.Open)).toBe(true);
    expect(phaseDone(lines, playing, OnboardingPhase.Task)).toBe(false);
  });

  test("the dots follow what has been chosen", () => {
    expect(stageOf({})).toBe(0);
    expect(stageOf({ role: 2 })).toBe(1);
    const task = taskCopy(Appearance.Light)[0];
    if (!task) throw new Error("no task copy");
    expect(stageOf({ role: 2, task })).toBe(2);
  });
});
