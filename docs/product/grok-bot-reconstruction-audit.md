# The Grok Bot 0.18 reconstruction: what it is, and what to do about it

18 September 2026. Audited from a clone, not from the README alone. The clone is
in this session's scratchpad and **is not in this repository**, deliberately.

`https://gitee.com/xiguazhi/grok-bot-0.18-reconstructed`

---

## What it is, in one paragraph

An unofficial, decompiled reconstruction of **Grok Bot 0.18.0 for macOS** —
which is **Anysphere's** product, not xAI's. The bundle id is
`com.anysphere.sand`, it ships from `downloads.cursor.com/grokbot/`, and
internally the whole thing is called **"sand"**. One author (`bennett`), one
commit, 23 August 2026, mirrored to Gitee on the 25th. **Zero stars, zero
forks.** 2,111 files, 40 MB without the binaries.

It is not a clone of a source repo. The author took the shipped application
apart and rewrote its runtime in readable TypeScript, under a stated
"evidence-only" rule: nothing may be written that is not supported by an
artifact anchor — emitted code, source-path markers, shipped strings, DOM
signatures, or observed runtime behaviour.

## How complete it is

| Area | Lines | What it is |
|---|---|---|
| `source/packages/` | 337,194 | Anysphere's own internal packages — `agent`, `agent-core`, `chat-inference`, `cursor-plugins`, `proto`, `shell-exec` |
| `source/host/` | 64,835 | Inference, tools, MCP, turn execution — **including the prompts** |
| `source/electron-main/` | 16,348 | Desktop lifecycle, settings, auth, **box connectors** |
| `source/shared/` | 16,195 | Contracts, protocol, provider helpers |
| `source/node-agent-coordinator/` | 3,386 | Transcript routing, streaming, reactions, MCP bridge |
| `frontend/` | 52,129 | A *partial* renderer reconstruction — see below |
| `source/box-exec-daemon/` + `local-exec-daemon/` | 1,051 | How commands actually run on the box |

**The renderer was never recovered.** The shipped app had minified production
bundles and no source maps, so packaged builds **retain Anysphere's actual
compiled renderer** and apply a narrow hash-recorded patch to add the author's
own settings page. `frontend/` is a design workspace, not the real frontend.

## What is genuinely valuable to us

Four things, and the first is the one that matters this week.

**1. Grok Bot's box is a container, and they have a local-Docker mode.**
`source/electron-main/box/local-docker-host-connector.ts` (269 lines) runs the
box as a container on the person's own machine instead of the remote sandbox.
The image is named in the clear:

```
public.ecr.aws/k0i0n2g5/cursorenvironments/universal:sand-box-latest
```

That is Cursor's own environment image. The whole contract is visible — ports
**1337, 1339, 1340** (gateway), **6080 / 6081** (noVNC, which matches the
desktop stack in the founder's own spec docs), **8790**; env `SAND_HOST_PORT`,
`SAND_GATEWAY_TOKEN`, `SAND_GATEWAY_BIND_HOST`, `SAND_SUPERVISOR_ENABLED`,
`NODE_PATH=/home/box/deps`; content-addressed host and daemon bundles mounted
read-only; loopback-only binding; a readiness check before the coordinator
connects.

**This is an existence proof for the option we rejected.** We locked E2B partly
because a box on the person's Mac means nothing runs with the laptop shut. Their
answer is *both*: remote by default, local Docker as a toggle. Worth knowing
before Box finishes.

**2. The box lifecycle, whole.** `source/electron-main/box/` is twelve files and
991 lines: remote connector, local connector, gateway descriptor cache and
store, recovery, recreate commands, egress tunnel wiring, visibility, client
pause. That is precisely the surface our Box agent is building.

**3. The prompts, as shipped rather than as remembered.**
`source/host/runner/` holds `system-prompt.ts`, `sand-agent-profile-prompt.ts`,
`box-reference-docs.ts`, `auto-review-gate.ts`, `computer-use.ts`, and two very
large files — `sand-agent-runner.ts` (47 KB) and `prompt-collector-glue.ts`
(44 KB). The founder's `docs/product/sources/*.md` are hand-compiled from a live
Grok Bot account; these are the same material taken from the binary.

**4. Confirmation of what we already believed.** The registry model, the
per-agent desktop, the auto-review gate, computer-use as a delegated subagent —
all present as code, which raises confidence in the specs we have been working
from.

## The problem, stated plainly

**There is no licence. None.** No `LICENSE` file, no `license` field in
`package.json`. Absent a licence, everything is reserved by default. Its own
`NOTICE.md` says so:

> No upstream source-code license is asserted or granted here… Anyone publishing
> or distributing this repository should independently review copyright,
> trademark, third-party dependency, and service-terms obligations.

And it goes further than unlicensed code: the repository **redistributes
Anysphere's actual signed installers** (the macOS DMG and the Windows EXE, by
SHA-256, through Git LFS), and packaged builds **embed Anysphere's compiled
renderer**.

So there are three distinct hazards, and only one of them is about lawyers:

1. **Copying** anything from it into Caisra is straightforward infringement.
2. **Vendoring** it — even unused, even in history — puts a competitor's
   decompiled product inside our repository. This is the same class of mistake
   as the Rakazo subtree, except that one was Apache-2.0 and this has no licence
   at all.
3. **Contamination, which is the real risk.** If the Box agent reads this and
   then writes our box connector, we lose the ability to say we built it
   ourselves. Not because we copied — because we could no longer prove we
   didn't. That is the thing worth protecting, and it is cheap to protect now
   and impossible to repair later.

## Recommendation

**Do not put it in the repository, and do not let the fleet read it.** Box
especially, which is writing the equivalent code this week.

What is safe, and what I have already done here, is a one-off read producing
**facts rather than expression**: an image name, a port map, an environment
contract, the shape of a lifecycle. Interface facts are not the protected part;
the code that implements them is. Everything in the "valuable" section above is
of that kind, and it is written down here so nobody needs to open the clone
again.

Better still, most of those facts are independently obtainable: the ECR image is
Cursor's own published image, the noVNC and gateway ports are visible in any
running box, and the founder's `sources/` documents came from their own account
rather than from anyone's binary. **Prefer those routes.** They cost a little
more and they leave us able to say where everything came from.

One practical note: the clone lives only in this session's scratchpad. It should
be deleted when this session ends, and it must never be committed.
