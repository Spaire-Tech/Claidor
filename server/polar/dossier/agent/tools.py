"""What the agent is allowed to do inside a matter.

Four tools, and the shape of them is the argument. An agent that can only
*talk* about a bundle of contracts produces confident prose; an agent that
can read a specific document, search across all of them, and run the
deterministic checks produces answers that can be looked up. The difference
between those two products is entirely in this file.

**Every tool operates on a fixed set of documents handed to it.** Not on a
database session, not on an id it resolves itself. The workspace is loaded
once, from the matter the caller is assigned to, and the tools can reach
nothing else — so « read the other side's file » is not a prompt injection
away, it is not expressible. A tool asked for a document outside its
workspace says it does not exist, which from inside the matter is true.

**Nothing here writes.** Reading, searching and checking only. Drafting and
editing are a separate surface with a separate set of guarantees, and
mixing them in would mean every prompt could change the file.

The results are dataclasses rather than prose. What the model receives is
serialised at the edge; what the trace stores is the same object; what a
test asserts on is the object too. One representation, three readers.
"""

from dataclasses import dataclass, field
from typing import Any
from uuid import UUID

from polar.models.dossier import DossierDocument
from polar.redline import review_document
from polar.redline.terms import Severity

#: A window of a document, in characters. Big enough to hold a clause and
#: its neighbours; small enough that twenty reads do not fill the context.
READ_WINDOW = 6_000

#: How many search hits are worth returning. Past this the answer is « that
#: term is everywhere », which is itself the useful finding.
MAX_HITS = 40

#: Characters either side of a search hit.
HIT_CONTEXT = 160


@dataclass(frozen=True)
class Workspace:
    """The documents this agent may touch, and nothing else."""

    dossier_id: UUID
    documents: tuple[DossierDocument, ...]

    def find(self, document_id: str) -> DossierDocument | None:
        for document in self.documents:
            if str(document.id) == str(document_id):
                return document
        return None


@dataclass
class ToolResult:
    """What a tool did, in a form the model, the trace and a test all read."""

    ok: bool
    #: One line for the trace: « Read Project_Atlas_SPA.docx ».
    summary: str
    #: The payload the model receives.
    data: dict[str, Any] = field(default_factory=dict)


def _refuse(summary: str) -> ToolResult:
    return ToolResult(ok=False, summary=summary, data={"error": summary})


def list_documents(workspace: Workspace) -> ToolResult:
    """Everything in the matter, readable or not.

    Unreadable files are listed rather than hidden. The agent needs to know
    they exist — « I checked every document » is false if six were scans,
    and an agent that cannot see them cannot say so.
    """
    documents = [
        {
            "document_id": str(document.id),
            "title": document.title,
            "piece_number": document.piece_number,
            "category": str(document.category),
            "readable": bool(document.extracted_text),
            "characters": len(document.extracted_text or ""),
        }
        for document in workspace.documents
    ]
    readable = sum(1 for document in documents if document["readable"])
    unreadable = len(documents) - readable

    summary = f"Listed {len(documents)} documents"
    if unreadable:
        summary += f" ({unreadable} not machine-readable)"

    return ToolResult(
        ok=True,
        summary=summary,
        data={
            "documents": documents,
            "readable": readable,
            "unreadable": unreadable,
        },
    )


def read_document(
    workspace: Workspace, document_id: str, start: int = 0, length: int = READ_WINDOW
) -> ToolResult:
    """A window of one document's text.

    Windowed rather than whole, because a 186-page agreement read in one
    call leaves no room to read the second one. The response says how much
    is left, so the agent can ask for the next window rather than assume it
    has seen everything — an assumption that produces « the agreement
    contains no indemnity » about a document whose indemnity is on page 90.
    """
    document = workspace.find(document_id)
    if document is None:
        return _refuse("No such document in this matter.")

    text = document.extracted_text
    if not text:
        return _refuse(
            f"« {document.title} » holds no machine-readable text "
            "(a scan without OCR). Its contents are unknown."
        )

    start = max(0, start)
    length = max(1, min(length, READ_WINDOW))
    window = text[start : start + length]
    end = start + len(window)

    return ToolResult(
        ok=True,
        summary=f"Read {document.title}",
        data={
            "document_id": str(document.id),
            "title": document.title,
            "text": window,
            "start": start,
            "end": end,
            "characters": len(text),
            "remaining": max(0, len(text) - end),
        },
    )


def check_document(workspace: Workspace, document_id: str) -> ToolResult:
    """Run the deterministic checks on one document.

    The tool that makes the agent worth trusting. Everything else it says
    about a document is a reading; this is arithmetic on the text, and the
    findings it returns are the same objects the Word panel shows. An agent
    that reports « the defined terms are consistent » because it read the
    document is guessing. One that reports it because this returned nothing
    is not.
    """
    document = workspace.find(document_id)
    if document is None:
        return _refuse("No such document in this matter.")

    text = document.extracted_text
    if not text:
        return _refuse(
            f"« {document.title} » holds no machine-readable text, so it "
            "cannot be checked."
        )

    findings = review_document(text)
    by_severity = {
        "critical": sum(1 for f in findings if f.severity is Severity.critical),
        "warning": sum(1 for f in findings if f.severity is Severity.warning),
        "to_review": sum(1 for f in findings if f.severity is Severity.to_review),
    }

    return ToolResult(
        ok=True,
        summary=(
            f"Checked {document.title} — {len(findings)} finding"
            f"{'' if len(findings) == 1 else 's'}"
        ),
        data={
            "document_id": str(document.id),
            "title": document.title,
            "counts": by_severity,
            "findings": [
                {
                    "defect": str(finding.defect),
                    "severity": str(finding.severity),
                    "certainty": str(finding.certainty),
                    "term": finding.term,
                    "note": finding.note,
                    "context": finding.context,
                    "start": finding.start,
                    "end": finding.end,
                }
                for finding in findings
            ],
        },
    )


def search_documents(workspace: Workspace, query: str) -> ToolResult:
    """Where a phrase appears across the matter.

    A literal, case-insensitive substring search — not a semantic one, and
    that is the point. « Find every mention of the cap » is a question the
    agent can decompose into words it then looks up exactly; a fuzzy match
    would let it report a hit it cannot quote, which is the failure mode the
    whole product is arranged against.

    Unreadable documents are counted in the response, so « no mention of an
    indemnity anywhere » can be qualified by « in the files we could read ».
    """
    needle = query.strip()
    if not needle:
        return _refuse("Search needs something to look for.")

    hits: list[dict[str, Any]] = []
    searched = 0
    unreadable = 0

    for document in workspace.documents:
        text = document.extracted_text
        if not text:
            unreadable += 1
            continue
        searched += 1

        haystack = text.lower()
        target = needle.lower()
        at = haystack.find(target)
        while at != -1 and len(hits) < MAX_HITS:
            hits.append(
                {
                    "document_id": str(document.id),
                    "title": document.title,
                    "start": at,
                    "quote": text[
                        max(0, at - HIT_CONTEXT) : at + len(needle) + HIT_CONTEXT
                    ],
                }
            )
            at = haystack.find(target, at + 1)

    summary = (
        f"Searched {searched} document{'' if searched == 1 else 's'} for "
        f"« {needle} » — {len(hits)} hit{'' if len(hits) == 1 else 's'}"
    )

    return ToolResult(
        ok=True,
        summary=summary,
        data={
            "query": needle,
            "hits": hits,
            "documents_searched": searched,
            "documents_unreadable": unreadable,
            "truncated": len(hits) >= MAX_HITS,
        },
    )


#: The tool definitions as the model is shown them. Kept beside the
#: implementations so a parameter cannot be renamed in one and not the
#: other — the commonest way a tool surface rots.
DEFINITIONS: list[dict[str, Any]] = [
    {
        "name": "list_documents",
        "description": (
            "Every document in this matter, with its title, piece number, "
            "size, and whether its text could be read. Start here."
        ),
        "input_schema": {"type": "object", "properties": {}},
    },
    {
        "name": "read_document",
        "description": (
            "Read a window of one document's text. Returns how many "
            "characters remain after the window, so you can read on. Never "
            "assume you have seen a document you have not read to the end."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "document_id": {"type": "string"},
                "start": {
                    "type": "integer",
                    "description": "Character offset to read from. Defaults to 0.",
                },
                "length": {
                    "type": "integer",
                    "description": f"Characters to read, at most {READ_WINDOW}.",
                },
            },
            "required": ["document_id"],
        },
    },
    {
        "name": "check_document",
        "description": (
            "Run the deterministic document checks on one document: defined "
            "terms, cross-references, numbering, house style. Every finding "
            "is arithmetic on the text rather than a reading, so use this "
            "instead of judging these things yourself."
        ),
        "input_schema": {
            "type": "object",
            "properties": {"document_id": {"type": "string"}},
            "required": ["document_id"],
        },
    },
    {
        "name": "search_documents",
        "description": (
            "Find where a phrase appears across every readable document in "
            "the matter. Literal, case-insensitive substring search — not "
            "semantic, so search for words the document would actually use."
        ),
        "input_schema": {
            "type": "object",
            "properties": {"query": {"type": "string"}},
            "required": ["query"],
        },
    },
]

TOOLS = {
    "list_documents": list_documents,
    "read_document": read_document,
    "check_document": check_document,
    "search_documents": search_documents,
}


def run_tool(workspace: Workspace, name: str, arguments: dict[str, Any]) -> ToolResult:
    """Dispatch one tool call.

    An unknown tool is a refusal rather than an exception: the model
    occasionally invents a name, and the useful response is to tell it that
    the tool does not exist and let it try again, not to end the run.
    """
    implementation = TOOLS.get(name)
    if implementation is None:
        return _refuse(f"There is no tool called « {name} ».")

    try:
        return implementation(workspace, **arguments)  # type: ignore[operator]
    except TypeError as error:
        # Wrong or missing arguments. Same reasoning as an unknown tool.
        return _refuse(f"Cannot call « {name} » with those arguments: {error}")


__all__ = [
    "DEFINITIONS",
    "HIT_CONTEXT",
    "MAX_HITS",
    "READ_WINDOW",
    "TOOLS",
    "ToolResult",
    "Workspace",
    "check_document",
    "list_documents",
    "read_document",
    "run_tool",
    "search_documents",
]
