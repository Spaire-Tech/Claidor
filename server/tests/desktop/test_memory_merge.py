"""The merge rules of the shared memory, on their own
(`polar/desktop/memory_merge.py`). No database, no I/O: two strings in,
one string out."""

import hashlib

import pytest

from polar.desktop.memory_merge import (
    MEMORY_FILE_RULES,
    MemoryRule,
    fact_id,
    fingerprint,
    is_accepted_memory_name,
    merge_document,
    merge_fact_file,
    merge_line_file,
    merge_list_file,
    merge_memory_file,
    rule_for,
)


class TestFingerprint:
    def test_punctuation_case_and_spacing_do_not_make_a_new_fact(self) -> None:
        assert fingerprint("Ships on Fridays!") == fingerprint("  ships   on fridays  ")
        assert fingerprint("- Dog named Ada") == fingerprint("Dog named Ada")
        assert fingerprint("Marie") != fingerprint("Marion")

    def test_letters_and_digits_survive_in_any_alphabet(self) -> None:
        assert fingerprint("Réunion, 14h") == "réunion 14h"


class TestMergeListFile:
    def test_a_fact_written_on_both_sides_appears_once(self) -> None:
        ours = "# User Memories\n\n- Ships on Fridays\n"
        theirs = "# User Memories\n\n- ships on fridays!\n- Stand-up at 9\n"
        merged = merge_list_file(ours, theirs)
        assert merged.count("Fridays") == 1
        assert "- Ships on Fridays" in merged  # ours, spelled our way
        assert "- Stand-up at 9" in merged

    def test_our_blocks_keep_their_order_and_new_ones_follow(self) -> None:
        ours = "- One\n- Two\n"
        theirs = "- Three\n- Two\n- One\n"
        assert merge_list_file(ours, theirs).splitlines() == [
            "- One",
            "- Two",
            "- Three",
        ]

    def test_a_new_block_is_filed_under_the_heading_it_came_from(self) -> None:
        ours = "# User Memories\n\n## Work\n\n- Ships on Fridays\n\n## Home\n\n- Dog named Ada\n"
        theirs = "## Work\n\n- Stand-up at 9\n"
        merged = merge_list_file(ours, theirs)
        assert merged.splitlines() == [
            "# User Memories",
            "",
            "## Work",
            "",
            "- Ships on Fridays",
            "- Stand-up at 9",
            "",
            "## Home",
            "",
            "- Dog named Ada",
        ]

    def test_a_block_under_a_heading_we_do_not_have_goes_at_the_end(self) -> None:
        ours = "## Work\n\n- Ships on Fridays\n"
        theirs = "## Travel\n\n- Hates red-eyes\n"
        merged = merge_list_file(ours, theirs)
        assert merged.splitlines()[-1] == "- Hates red-eyes"
        assert "## Travel" not in merged  # the structure stays ours

    def test_a_heading_that_holds_nothing_yet_receives_the_block(self) -> None:
        ours = "## Work\n\n- Ships on Fridays\n\n## Travel\n"
        theirs = "## Travel\n\n- Hates red-eyes\n"
        merged = merge_list_file(ours, theirs)
        assert merged.splitlines()[-1] == "- Hates red-eyes"
        assert merged.index("Travel") < merged.index("red-eyes")

    def test_the_structure_around_our_blocks_is_kept_verbatim(self) -> None:
        ours = (
            "# User Memories\n"
            "\n"
            "<!-- promoted 2026-09-10 -->\n"
            "- Ships on Fridays\n"
            "\n"
            "```\n"
            "- this is code, not a fact\n"
            "```\n"
        )
        theirs = "- Stand-up at 9\n- this is code, not a fact\n"
        merged = merge_list_file(ours, theirs)
        assert ours.rstrip("\n") in merged
        assert "<!-- promoted 2026-09-10 -->" in merged
        assert merged.endswith("- Stand-up at 9\n- this is code, not a fact\n")
        # What is inside a fence is structure, never a fact: the client's
        # bullet of the same words is a fact, and arrives as one.
        assert merged.count("- this is code, not a fact") == 2

    def test_a_block_keeps_its_continuation_lines(self) -> None:
        ours = "- Ships on Fridays\n"
        theirs = "- Prefers trains\n  except to Abidjan\n"
        merged = merge_list_file(ours, theirs)
        assert merged.splitlines()[-2:] == ["- Prefers trains", "  except to Abidjan"]

    def test_an_empty_side_yields_the_other_whole(self) -> None:
        theirs = "# User Memories\n\n## Work\n\n- Ships on Fridays\n"
        assert merge_list_file("", theirs) == theirs
        assert merge_list_file("   \n", theirs) == theirs
        assert merge_list_file(theirs, "") == theirs

    def test_merging_twice_changes_nothing_more(self) -> None:
        ours = "## Work\n\n- Ships on Fridays\n"
        theirs = "## Work\n\n- Stand-up at 9\n"
        once = merge_list_file(ours, theirs)
        assert merge_list_file(once, theirs) == once


class TestMergeLineFile:
    def test_a_note_appended_on_both_sides_keeps_both_lines(self) -> None:
        ours = "# 2026-09-11\n\n- 09:00 wrote the plan\n- 10:00 called Marie\n"
        theirs = "# 2026-09-11\n\n- 09:00 wrote the plan\n- 11:30 booked the flight\n"
        assert merge_line_file(ours, theirs).splitlines() == [
            "# 2026-09-11",
            "",
            "- 09:00 wrote the plan",
            "- 10:00 called Marie",
            "- 11:30 booked the flight",
        ]

    def test_a_repeat_is_dropped_however_it_is_indented(self) -> None:
        ours = "- 09:00 wrote the plan\n"
        theirs = "   - 09:00 wrote the plan   \n"
        assert merge_line_file(ours, theirs) == ours

    def test_blank_lines_come_from_our_copy_only(self) -> None:
        ours = "# Notes\n\n- one\n"
        theirs = "\n\n\n- two\n\n\n"
        assert merge_line_file(ours, theirs) == "# Notes\n\n- one\n- two\n"

    def test_an_empty_side_yields_the_other_whole(self) -> None:
        theirs = "- 09:00 wrote the plan\n"
        assert merge_line_file("", theirs) == theirs
        assert merge_line_file(theirs, "\n") == theirs

    def test_merging_twice_changes_nothing_more(self) -> None:
        ours = "- one\n"
        theirs = "- two\n"
        once = merge_line_file(ours, theirs)
        assert merge_line_file(once, theirs) == once


class TestMergeDocument:
    def test_the_newer_text_wins_whole(self) -> None:
        assert merge_document("ours", "theirs", True) == "ours"
        assert merge_document("ours", "theirs", False) == "theirs"


class TestNames:
    @pytest.mark.parametrize(
        ("name", "rule"),
        [
            ("MEMORY.md", MemoryRule.LIST),
            ("USER.md", MemoryRule.DOCUMENT),
            ("memory/2026-09-11.md", MemoryRule.LINES),
            ("memory/2024-02-29.md", MemoryRule.LINES),
        ],
    )
    def test_the_three_accepted_shapes_and_their_rules(
        self, name: str, rule: MemoryRule
    ) -> None:
        assert is_accepted_memory_name(name)
        assert rule_for(name) is rule

    @pytest.mark.parametrize(
        "name",
        [
            "",
            "SOUL.md",
            "IDENTITY.md",
            "AGENTS.md",
            "memory.md",
            "MEMORY.md ",
            " MEMORY.md",
            "/MEMORY.md",
            "./MEMORY.md",
            "../MEMORY.md",
            "../../etc/passwd",
            "memory/../../etc/passwd",
            "memory/2026-09-11.md/../../MEMORY.md",
            "memory\\2026-09-11.md",
            "memory/notes/2026-09-11.md",
            "memory/2026-09-11.md/x",
            "memory/2026-9-1.md",
            "memory/2026-13-01.md",
            "memory/2026-02-30.md",
            "memory/0000-00-00.md",
            "memory/2026-09-11.txt",
            "MEMORY.md\x00",
            "MEMORY.md\n",
            # A daily note with a trailing newline: `$` would have let this
            # through, and the name becomes a path.
            "memory/2026-09-11.md\n",
            "memory/2026-09-11.md\x00",
        ],
    )
    def test_everything_else_is_refused(self, name: str) -> None:
        """The name becomes a path inside a workspace on our servers, so
        it is matched whole against a fixed list."""
        assert not is_accepted_memory_name(name)
        assert rule_for(name) is None

    def test_the_rules_are_data(self) -> None:
        assert set(MEMORY_FILE_RULES) == {
            "MEMORY.md",
            "USER.md",
            "memory/YYYY-MM-DD.md",
            "agents/<agentId>/memory/profile.md",
            "agents/<agentId>/memory/log/YYYY-MM.md",
            "user-memory/agents/<agentId>/profile.md",
            "user-memory/agents/<agentId>/log/YYYY-MM.md",
            "projects/<slug>/memory/agents/<agentId>/profile.md",
            "projects/<slug>/memory/agents/<agentId>/log/YYYY-MM.md",
            "projects/<slug>/project.md",
        }


class TestTheAppsNames:
    """The Grok Bot reconstruction's own layout under the sand root
    (25 September 2026, `memory-service.ts`), widened into the accepted
    list so the box's host can sync what it actually writes."""

    @pytest.mark.parametrize(
        ("name", "rule"),
        [
            ("agents/a1/memory/profile.md", MemoryRule.FACTS),
            ("agents/a1/memory/log/2026-09.md", MemoryRule.FACTS),
            ("agents/8f3c-Ab_z.1/memory/log/2026-12.md", MemoryRule.FACTS),
            ("user-memory/agents/a1/profile.md", MemoryRule.FACTS),
            ("user-memory/agents/a1/log/2026-09.md", MemoryRule.FACTS),
            ("projects/launch/memory/agents/a1/profile.md", MemoryRule.FACTS),
            ("projects/launch/memory/agents/a1/log/2026-09.md", MemoryRule.FACTS),
            ("projects/launch/project.md", MemoryRule.DOCUMENT),
        ],
    )
    def test_the_app_s_shapes_and_their_rules(
        self, name: str, rule: MemoryRule
    ) -> None:
        assert is_accepted_memory_name(name)
        assert rule_for(name) is rule

    @pytest.mark.parametrize(
        "name",
        [
            "agents/a1/memory/.dreaming/explicit/abc.memory",
            "agents/a1/memory/.dreaming/tombstones/abc.deleted",
            "agents/a1/memory/.dreaming/next-refresh-at",
            "agents/../memory/profile.md",
            "agents/../../etc/passwd",
            "agents/./memory/profile.md",
            "agents/.hidden/memory/profile.md",
            "agents/a1/memory/log/2026-9.md",
            "agents/a1/memory/log/2026-13.md",
            "agents/a1/memory/log/2026-09-11.md",
            "agents/a1/memory/notes.md",
            "agents/a1/memory/profile.md\n",
            "agents/a1/memory/profile.md/x",
            "agents/a1/transcript.db",
            "agents/a1/profile.json",
            "agents/a1\\memory\\profile.md",
            "user-memory/a1/profile.md",
            "user-memory/agents/a1/memory/profile.md",
            "projects/launch/memory/profile.md",
            "projects/../x/project.md",
            "projects/launch/automation.json",
            "agents/" + "a" * 200 + "/memory/profile.md",
        ],
    )
    def test_the_rest_of_the_sand_root_is_refused(self, name: str) -> None:
        assert not is_accepted_memory_name(name)
        assert rule_for(name) is None


class TestFactFiles:
    """The app's fact lines, `- (YYYY-MM-DD) <fact>`, unioned by the app's
    own id (sha1 of the lowercased, whitespace-collapsed content)."""

    def test_the_id_is_the_app_s_memory_id_for(self) -> None:
        # memoryIdFor("The founder is called Bass.") in memory-service.ts:
        # sha1("the founder is called bass.")[:16].
        assert fact_id("The founder is called Bass.") == fact_id(
            "  the  FOUNDER is called   bass. "
        )
        assert (
            fact_id("The founder is called Bass.")
            == hashlib.sha1(b"the founder is called bass.").hexdigest()[:16]
        )
        # Cut at 500 characters before lowercasing, as the app cuts.
        assert fact_id("a" * 600) == fact_id("a" * 500)
        assert fact_id("a" * 600) != fact_id("a" * 499)

    def test_the_same_fact_learned_on_two_days_is_kept_once(self) -> None:
        ours = "# About the user\n\n- (2026-09-20) The founder is called Bass.\n"
        theirs = "# About the user\n\n- (2026-09-24) the founder is called Bass.\n"
        assert merge_fact_file(ours, theirs) == ours

    def test_their_new_facts_follow_ours_and_their_header_is_not_copied(
        self,
    ) -> None:
        ours = (
            "# Memory log\n\n<!-- Dated facts -->\n\n- (2026-09-20) Ships on Fridays.\n"
        )
        theirs = (
            "# Memory log\n\n<!-- Dated facts -->\n\n- (2026-09-21) Dog named Ada.\n"
        )
        assert merge_fact_file(ours, theirs).splitlines() == [
            "# Memory log",
            "",
            "<!-- Dated facts -->",
            "",
            "- (2026-09-20) Ships on Fridays.",
            "- (2026-09-21) Dog named Ada.",
        ]

    def test_an_empty_side_yields_the_other_whole(self) -> None:
        assert merge_fact_file("", "- (2026-09-20) x\n") == "- (2026-09-20) x\n"
        assert merge_fact_file("- (2026-09-20) x\n", "") == "- (2026-09-20) x\n"

    def test_merging_twice_changes_nothing_more(self) -> None:
        ours = "- (2026-09-20) a\n"
        theirs = "- (2026-09-21) b\n- (2026-09-22) a\n"
        once = merge_fact_file(ours, theirs)
        assert merge_fact_file(once, theirs) == once
        assert once == "- (2026-09-20) a\n- (2026-09-21) b\n"

    def test_a_line_that_is_not_a_fact_is_not_a_fact(self) -> None:
        assert merge_fact_file("- (2026-09-20) a\n", "- b\nnote\n") == (
            "- (2026-09-20) a\n"
        )


class TestMergeMemoryFile:
    def test_each_name_merges_by_its_own_rule(self) -> None:
        assert merge_memory_file("MEMORY.md", "- one\n", "- two\n") == "- one\n- two\n"
        assert (
            merge_memory_file("memory/2026-09-11.md", "one\n", "two\n") == "one\ntwo\n"
        )
        assert merge_memory_file("USER.md", "ours\n", "theirs\n") == "ours\n"
        assert (
            merge_memory_file("USER.md", "ours\n", "theirs\n", ours_is_newer=False)
            == "theirs\n"
        )

    def test_a_name_claidor_does_not_keep_raises(self) -> None:
        with pytest.raises(ValueError, match="SOUL.md"):
            merge_memory_file("SOUL.md", "a", "b")
