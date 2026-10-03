# Two maty tests have been red since the day they were written

*Server agent, 23 September 2026. A working note of mine. Everything below
was run in this container tonight; the commands are in the text so anyone
can repeat them.*

## The short version

`server/tests/maty/test_service.py` has two failing tests:

- `TestClaim::test_the_claim_locks_the_row_it_takes`
- `test_two_runners_claiming_at_the_same_moment_take_different_jobs`

**Both are defects in the tests, not in the maty queue.** The queue's
`FOR UPDATE SKIP LOCKED` guarantee is intact and I verified it directly.
Neither failure is caused by PR #125; both reproduce on `origin/main` with
none of my code present.

**Neither is fixed.** I have not touched them — PR #125 is box-only and
frozen pending a decision, and these are not box. The two fixes are one
line each and are written out below.

## How I found them

I widened my check-in run from `tests/desktop` to `tests/desktop tests/maty`
and got `8 failed, 332 passed`. `tests/desktop` alone is `6 failed, 253
passed`, the known baseline (no provider keys, so `offered_models()` is
empty). The two extra failures were new to my *run*, not new to the
*repository*.

## They are not mine, and not new — measured three ways

1. **My branch does not touch maty.**
   `git diff --name-only origin/main...HEAD -- server/polar/maty server/tests/maty`
   returns nothing.
2. **They fail on `origin/main`.** I put `origin/main` (`3c722325`) in a
   worktree and ran `tests/maty/test_service.py` against it with the same
   interpreter: `2 failed, 32 passed`, the same two.
3. **They fail at the commit that introduced them.** Same worktree at
   `1ed3057f` (11 September, *"wip(connectors): snapshot, app side still
   building"*, the commit that added the file): both fail.

So they have been red for twelve days. Nothing regressed them. Nobody
noticed because this repository's own workflows get no runner (CLAUDE.md,
§ *On CI*) and because running `tests/maty` is not part of anyone's habit.

One thing I checked and ruled out, because it would have made this mine:
`git diff origin/main...HEAD -- server/uv.lock | grep -i sqlalchemy` is
empty. My lockfile change adds `e2b` and does not move SQLAlchemy. The pin
is `2.0.46` and has not changed since `be578313` (9 September).

## Failure 1 — the test compiles the statement with the wrong dialect

```
assert "SKIP LOCKED" in sql
AssertionError: assert 'SKIP LOCKED' in 'SELECT ... LIMIT :PARAM_1 FOR UPDATE'
tests/maty/test_service.py:147
```

`tests/maty/test_service.py:142-147` does `str(statement.compile()).upper()`.
With no dialect argument SQLAlchemy uses its generic compiler, which renders
`FOR UPDATE` and drops `SKIP LOCKED`. It is a PostgreSQL-only clause.

**The queue is correct.** `polar/maty/repository.py:46` is
`.with_for_update(skip_locked=True)`, inside `claimable_statement`. Compiled
against the real dialect it renders what the docstring promises:

```python
from sqlalchemy.dialects import postgresql
str(s.compile())                                # ... LIMIT :param_1 FOR UPDATE
str(s.compile(dialect=postgresql.dialect()))    # ... LIMIT %(param_1)s FOR UPDATE SKIP LOCKED
```

So the test asserts a true thing through a lens that cannot show it.

**The fix, one line at `tests/maty/test_service.py:145`:**

```python
sql = str(statement.compile(dialect=postgresql.dialect())).upper()
```

## Failure 2 — the engine is never built, so the test never runs

```
TypeError: unsupported operand type(s) for -: 'int' and 'NoneType'
sqlalchemy/pool/impl.py:137
tests/maty/test_service.py:556, in _own_session
```

This one dies in its fixture and reaches no assertion at all. `_own_session`
calls `polar.kit.db.postgres.create_async_engine(dsn=…, application_name=…)`
and passes no `pool_size`. That parameter is declared `pool_size: int | None
= None` and is forwarded verbatim to SQLAlchemy, whose `QueuePool.__init__`
computes `pool_size - 1`. `int - None` raises.

**Production is not affected, and I checked rather than assumed.** Every
other caller passes a size:

- `polar/postgres.py:31` and `:43` — the `app` / `worker` / `scheduler` /
  `script` engines — both pass `pool_size=settings.DATABASE_POOL_SIZE`.
- `tests/fixtures/database.py:44` and `:71` pass it too.

`grep -rn "create_async_engine(" --include=*.py polar tests` lists ten call
sites; `tests/maty/test_service.py:556` is the only one that omits it. So
the `None` default in the kit is a trap nothing has fallen into except this
test.

**The fix, at `tests/maty/test_service.py:556`:** pass
`pool_size=settings.DATABASE_POOL_SIZE` the way `tests/fixtures/database.py`
does.

A second, deeper option is to stop the kit from forwarding `None` at all —
`polar/kit/db/postgres.py:67` could drop the key when it is `None` and let
SQLAlchemy use its own default of 5. That is a change to shared plumbing
every engine in the server goes through, so I am not making it unasked.

## What this does and does not tell us about maty

It does **not** weaken the earlier finding that the queue half is the tested,
finished half. `tests/maty` is `79 passed, 2 failed`; the two failures are a
dialect argument and a missing keyword. The claim/lease/heartbeat behaviour
those 79 cover is unaffected.

It does say something about the state of the repository: a test can be
written, committed, and stay red for twelve days here without anyone
learning it. That is the CI condition, and it is still unproven — nobody has
read the Actions billing page, including me.

## What I have not run

- I have not run these tests on a machine with CI, because there isn't one.
- I have not applied either fix.
- I have not run the full `server/tests` suite, only `tests/desktop` and
  `tests/maty`.
