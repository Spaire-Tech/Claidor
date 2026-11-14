/**
 * The sorts of attachment the engine tells apart, and the few words that say
 * what was sent: "3 images", "Sent 2 files · 1 image, 1 PDF".
 *
 * The published engine's build keeps none of this file (the engine uses only
 * its type); the test tool builds it because it is listed here.
 */
export const part = "shared/media-attachments";

export const modules = { attachments: "source/shared/media/attachments.ts" };

/** One file of a folder whose other files belong to other parts. */
export const covers = Object.values(modules);

/** Each input beside its answer, in the order asked. */
const asked = (inputs, ask) => inputs.map((input) => [input, ask(input)]);

/**
 * The answer, or the kind of failure. Where JavaScript itself refuses a
 * value, its sentence names whatever the code read first, so only the kind
 * of failure is kept.
 */
const attempt = (ask) => {
  try {
    return ask();
  } catch (error) {
    return { threw: error?.constructor?.name ?? typeof error };
  }
};

const COUNTS = [1, 0, 2, 11, -1, 1.5, 0.5, 1.0000001, Number.NaN, Number.POSITIVE_INFINITY, 1e21, "1", "2", true, null, undefined, 1n];

export const scenarios = [
  {
    name: "the eleven sorts of attachment, in their order",
    run: ({ attachments }) => ({
      kinds: attachments.SAND_ATTACHMENT_KINDS,
      isAList: Array.isArray(attachments.SAND_ATTACHMENT_KINDS),
      frozen: Object.isFrozen(attachments.SAND_ATTACHMENT_KINDS),
      theSameListEachTime: attachments.SAND_ATTACHMENT_KINDS === attachments.SAND_ATTACHMENT_KINDS,
    }),
  },
  {
    name: "a sort and a count in words: the singular for exactly one, the plural for every other count",
    run: ({ attachments }) => Object.fromEntries(attachments.SAND_ATTACHMENT_KINDS.map((kind) => [kind, COUNTS.map((count) => attempt(() => attachments.kindPhrase(kind, count)))])),
  },
  {
    name: "a sort that is not one of the eleven has no words",
    run: ({ attachments }) =>
      asked(["Image", "images", "", " image", "photo", undefined, null, 0, "constructor", "toString", "__proto__", "hasOwnProperty", "length"], (kind) => [attempt(() => attachments.kindPhrase(kind, 1)), attempt(() => attachments.kindPhrase(kind, 2))]),
  },
  {
    name: "counts are merged by sort in the order each sort first comes, without those of nothing or less; an unknown sort counts as a file",
    run: ({ attachments }) =>
      asked(
        [
          undefined,
          null,
          [],
          [{ kind: "image", count: 1 }],
          [{ kind: "image", count: 1 }, { kind: "image", count: 2 }],
          [{ kind: "pdf", count: 2 }, { kind: "image", count: 1 }, { kind: "pdf", count: 3 }, { kind: "video", count: 1 }, { kind: "image", count: 4 }],
          [{ kind: "image", count: 0 }],
          [{ kind: "image", count: -1 }, { kind: "pdf", count: 0 }, { kind: "video", count: Number.NaN }],
          [{ kind: "image", count: 0 }, { kind: "pdf", count: 1 }, { kind: "image", count: 2 }],
          [{ kind: "image", count: 0.5 }, { kind: "image", count: 0.25 }],
          [{ kind: "image", count: Number.POSITIVE_INFINITY }, { kind: "image", count: 1 }],
          [{ kind: "photo", count: 1 }],
          [{ kind: "photo", count: 1 }, { kind: "file", count: 2 }, { kind: "sketch", count: 3 }],
          [{ kind: "file", count: 2 }, { kind: "photo", count: 1 }, { kind: "image", count: 1 }],
          [{ kind: "Image", count: 1 }, { kind: "IMAGE", count: 1 }, { kind: " image", count: 1 }, { kind: "", count: 1 }],
          [{ kind: "constructor", count: 1 }, { kind: "toString", count: 1 }, { kind: "__proto__", count: 1 }, { kind: "hasOwnProperty", count: 1 }],
          [{ kind: undefined, count: 1 }, { kind: null, count: 1 }, { kind: 7, count: 1 }, { count: 1 }],
          attachmentsOfEverySort(),
          [...attachmentsOfEverySort()].reverse(),
          [{ kind: "image", count: 1, name: "extra fields are left behind" }],
          [{ kind: "image" }, { kind: "pdf", count: undefined }, { kind: "video", count: null }],
          [{ kind: "image", count: "2" }],
          [{ kind: "image", count: "2" }, { kind: "image", count: 3 }, { kind: "image", count: "4" }],
          [{ kind: "image", count: true }, { kind: "image", count: true }],
          [{ kind: "image", count: 1n }],
        ],
        (kinds) => attempt(() => attachments.mergeKindCounts(kinds)),
      ),
  },
  {
    name: "merged counts are new entries of a sort and a count, in a new list each time",
    run: ({ attachments }) => {
      const given = Object.freeze([Object.freeze({ kind: "image", count: 2, name: "one.png" })]);
      const merged = attachments.mergeKindCounts(given);
      return {
        fields: merged.map((entry) => Object.keys(entry)),
        notTheEntryGiven: merged[0] !== given[0],
        aNewListEachTime: attachments.mergeKindCounts(given) !== attachments.mergeKindCounts(given),
        nothingGivesANewEmptyListEachTime: attachments.mergeKindCounts(null) !== attachments.mergeKindCounts(null),
        aListLikeThingIsNotAList: attempt(() => attachments.mergeKindCounts({ length: 1, 0: { kind: "image", count: 1 } })),
        aListOfNoLengthThatIsNoList: attempt(() => attachments.mergeKindCounts({ length: 0 })),
        aText: [attempt(() => attachments.mergeKindCounts("")), attempt(() => attachments.mergeKindCounts("image"))],
        anEntryThatIsNothing: [attempt(() => attachments.mergeKindCounts([null])), attempt(() => attachments.mergeKindCounts([undefined]))],
        aSet: attempt(() => attachments.mergeKindCounts(new Set([{ kind: "image", count: 1 }]))),
      };
    },
  },
  {
    name: "what was sent, in words: the count as a whole number of at least one, with the sort when there is only one",
    run: ({ attachments }) => ({
      noSorts: asked([1, 0, 2, 3.9, -5, 0.2, 1.999, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, "3", "three", null, undefined, true], (count) => attempt(() => attachments.formatAttachmentSentSummary(count))),
      oneSort: asked([1, 0, 2, 3.9, -5, Number.NaN], (count) => attachments.formatAttachmentSentSummary(count, [{ kind: "image", count: 7 }])),
      everySortAlone: Object.fromEntries(attachments.SAND_ATTACHMENT_KINDS.map((kind) => [kind, [attachments.formatAttachmentSentSummary(1, [{ kind, count: 1 }]), attachments.formatAttachmentSentSummary(4, [{ kind, count: 4 }])]])),
      noCountAtAll: attempt(() => attachments.formatAttachmentSentSummary()),
      aBigInt: attempt(() => attachments.formatAttachmentSentSummary(2n)),
    }),
  },
  {
    name: "what was sent, with its sorts: several sorts follow the count of files after a middle dot, each with its own count",
    run: ({ attachments }) =>
      asked(
        [
          [3, null],
          [3, undefined],
          [3, []],
          [3, [{ kind: "image", count: 0 }]],
          [3, [{ kind: "image", count: 3 }]],
          [3, [{ kind: "image", count: 1 }, { kind: "image", count: 2 }]],
          [3, [{ kind: "image", count: 2 }, { kind: "pdf", count: 1 }]],
          [3, [{ kind: "pdf", count: 1 }, { kind: "image", count: 2 }]],
          [1, [{ kind: "image", count: 2 }, { kind: "pdf", count: 1 }]],
          [0, [{ kind: "image", count: 1 }, { kind: "pdf", count: 1 }]],
          [5, [{ kind: "image", count: 1 }, { kind: "pdf", count: 0 }]],
          [5, [{ kind: "photo", count: 2 }]],
          [5, [{ kind: "photo", count: 2 }, { kind: "sketch", count: 3 }]],
          [5, [{ kind: "photo", count: 2 }, { kind: "image", count: 3 }]],
          [2, [{ kind: "audio", count: 1 }, { kind: "markdown", count: 1 }]],
          [2.7, [{ kind: "image", count: 1.5 }, { kind: "table", count: 1 }]],
          [11, attachmentsOfEverySort()],
          [Number.NaN, [{ kind: "image", count: 1 }, { kind: "pdf", count: 1 }]],
          [2, [{ kind: "image", count: "1" }, { kind: "pdf", count: 1 }]],
          [2, "image"],
          [2, [null]],
        ],
        ([count, kinds]) => attempt(() => attachments.formatAttachmentSentSummary(count, kinds)),
      ),
  },
];

/** One of every sort, counted one, two, three and so on, in the engine's own order. */
function attachmentsOfEverySort() {
  return ["image", "video", "audio", "pdf", "markdown", "table", "json", "text", "document", "archive", "file"].map((kind, at) => ({ kind, count: at + 1 }));
}
