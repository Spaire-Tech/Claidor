"""Markup added to the founder's design, in the founder's own tokens.

Nothing here invents a visual language. The serif « S » mark, the
18px gap, the single column, the 999px chips, the .5px #f0eff1 rule
— every value is lifted from the block being extended, so an added
branch cannot look like a bolt-on.

What is new is only which branches exist, and each exists because a
control in the design had nothing behind it.
"""

#: The answer branch for the Ask panel.
#:
#: The founder designed nine exchanges and all nine are already in
#: `REV_ASKS`, rendered by the `isAsk` branch. What was missing is the
#: other half: a question that matches no workflow falls through to
#: `AS_ANSWERS` and becomes a message with `role:'answer'` — and the
#: message list has no branch for that role, so it renders nothing.
#: The question posts, the working line runs, and the reply is
#: replaced by markup that does not exist.
#:
#: Every prop below is already computed by the design's own message
#: map — `shown` (which carries the typing animation), `findings`,
#: `chain`, `rows`, `text2`, `chips`, `work`. Only `hasChain` had to
#: be added. The frame is the `isAsk` frame, so a plain answer sits in
#: the same conversation as a workflow answer.
ANSWER = """
                <sc-if value="{{ m.isAnswer }}" hint-placeholder-val="{{ false }}">
                  <div style="display:flex; gap:18px; align-items:flex-start; animation:pcIn .3s ease both">
                    <span style="flex:0 0 18px; width:18px; font-family:'Bodoni Moda',Didot,Georgia,serif; font-size:16px; line-height:1; color:#15171b; margin-top:6px">S</span>
                    <div style="flex:1; min-width:0; display:flex; flex-direction:column; gap:20px">
                      <span style="font-size:16px; line-height:1.7; letter-spacing:-.006em; color:#22252b; max-width:64ch; text-wrap:pretty">{{ m.shown }}</span>

                      <sc-if value="{{ m.hasFindings }}" hint-placeholder-val="{{ false }}">
                        <div style="display:flex; flex-direction:column">
                          <sc-for list="{{ m.findings }}" as="f" hint-placeholder-count="3">
                            <div style="display:flex; align-items:flex-start; gap:13px; border-top:{{ f.rule }}; padding:13px 2px">
                              <span style="flex:0 0 auto; display:inline-flex; align-items:center; height:20px; padding:0 9px; border-radius:999px; background:{{ f.sevBg }}; color:{{ f.sevFg }}; font-size:12px; letter-spacing:-.004em">{{ f.sev }}</span>
                              <span style="flex:1; min-width:0; display:flex; flex-direction:column; gap:3px">
                                <span style="font-size:14.5px; color:#1d1d1f; letter-spacing:-.01em; line-height:1.45; text-wrap:pretty">{{ f.t }}</span>
                                <span style="font-size:13px; color:#8f96a0; line-height:1.5; text-wrap:pretty">{{ f.d }}</span>
                              </span>
                              <span style="flex:0 0 auto; font-family:'JetBrains Mono',ui-monospace,monospace; font-size:11.5px; letter-spacing:0; color:#9aa1ab; white-space:nowrap">{{ f.ref }}</span>
                            </div>
                          </sc-for>
                        </div>
                      </sc-if>

                      <sc-if value="{{ m.hasChain }}" hint-placeholder-val="{{ false }}">
                        <div style="background:#fbfbfc; border-radius:12px; box-shadow:0 0 0 .5px rgba(16,22,35,.07); overflow:hidden">
                          <sc-for list="{{ m.chain }}" as="c" hint-placeholder-count="3">
                            <div style="display:flex; align-items:baseline; gap:12px; border-top:{{ c.rule }}; padding:11px 15px">
                              <span style="flex:0 0 auto; font-family:'JetBrains Mono',ui-monospace,monospace; font-size:11.5px; letter-spacing:0; color:#aeaeb2">{{ c.step }}</span>
                              <span style="flex:1; min-width:0; font-size:13.5px; color:#3d4048; line-height:1.5; text-wrap:pretty">{{ c.what }}</span>
                              <span style="flex:0 0 auto; font-family:'JetBrains Mono',ui-monospace,monospace; font-size:12px; letter-spacing:0; color:#6b7280; white-space:nowrap">{{ c.value }}</span>
                            </div>
                          </sc-for>
                        </div>
                      </sc-if>

                      <sc-if value="{{ m.hasRows }}" hint-placeholder-val="{{ false }}">
                        <div style="display:flex; flex-direction:column">
                          <sc-for list="{{ m.rows }}" as="r" hint-placeholder-count="3">
                            <div style="display:grid; grid-template-columns:1fr auto; gap:16px; align-items:baseline; border-top:{{ r.rule }}; padding:11px 2px">
                              <span style="min-width:0; font-size:14px; color:#3d4048; letter-spacing:-.008em">{{ r.what }}</span>
                              <span style="font-family:'JetBrains Mono',ui-monospace,monospace; font-size:12.5px; letter-spacing:0; color:#6b7280; white-space:nowrap">{{ r.value }}</span>
                            </div>
                          </sc-for>
                        </div>
                      </sc-if>

                      <sc-if value="{{ m.hasText2 }}" hint-placeholder-val="{{ false }}">
                        <span style="font-size:15px; line-height:1.65; color:#4a4f57; max-width:64ch; text-wrap:pretty">{{ m.text2 }}</span>
                      </sc-if>

                      <sc-if value="{{ m.hasWork }}" hint-placeholder-val="{{ false }}">
                        <div style="display:flex; flex-direction:column; gap:10px">
                          <button sc-camel-on-click="{{ m.toggleWork }}" style="align-self:flex-start; display:flex; align-items:center; gap:7px; border:0; background:transparent; padding:0; font:inherit; font-size:13px; color:#8f96a0; cursor:pointer">
                            <svg width="11" height="11" sc-camel-view-box="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" style="transform:{{ m.workRot }}; transition:transform .16s ease"><polyline points="9,5 16,12 9,19"></polyline></svg>
                            <span>{{ m.workLabel }}</span>
                          </button>
                          <sc-if value="{{ m.workOpen }}" hint-placeholder-val="{{ false }}">
                            <div style="display:flex; flex-direction:column; gap:8px; border-left:2px solid #eceaec; padding:2px 0 2px 14px">
                              <sc-for list="{{ m.work }}" as="w" hint-placeholder-count="3">
                                <span style="font-size:13px; color:#8f96a0; line-height:1.55; text-wrap:pretty">{{ w.t }}</span>
                              </sc-for>
                            </div>
                          </sc-if>
                        </div>
                      </sc-if>

                      <sc-if value="{{ m.hasChips }}" hint-placeholder-val="{{ false }}">
                        <div style="display:flex; flex-wrap:wrap; gap:9px">
                          <sc-for list="{{ m.chips }}" as="c" hint-placeholder-count="3">
                            <button sc-camel-on-click="{{ c.ask }}" style="border:1px solid rgba(16,22,35,.08); background:#fff; border-radius:999px; padding:8px 14px; font:inherit; font-size:13px; color:#3d4048; cursor:pointer; text-align:left" style-hover="background:#fbfbfa">{{ c.t }}</button>
                          </sc-for>
                        </div>
                      </sc-if>
                    </div>
                  </div>
                </sc-if>
"""


#: The two states a finding takes once someone acts on it.
#:
#: Both sit beside the founder's button cluster, never in place of
#: it: the cluster shows while `f.unruled`, these show after. The
#: reason field exists because the server refuses a dismissal without
#: one — « a ruling needs its reason, one sentence, so the decision
#: survives you moving on » — and the three-character floor is the
#: design's own `canSaveNote`, not a threshold of mine.
RULING = """
                                <sc-if value="{{ f.asking }}" hint-placeholder-val="{{ false }}">
                                <div style="display:flex; flex-wrap:wrap; align-items:center; gap:9px; width:100%">
                                  <input sc-camel-on-input="{{ f.typeNote }}" value="{{ f.noteText }}" placeholder="Why is this not a finding?" style="flex:1 1 320px; min-width:0; border:1px solid rgba(16,22,35,.10); background:#fff; border-radius:999px; height:38px; padding:0 16px; font:inherit; font-size:14px; color:#1c1f23; outline:none">
                                  <button sc-camel-on-click="{{ f.saveRule }}" style="border:0; background:{{ f.saveBg }}; color:#fff; border-radius:999px; height:38px; padding:0 18px; font:inherit; font-size:14px; font-weight:500; cursor:pointer">Save the reason</button>
                                  <button sc-camel-on-click="{{ f.cancelRule }}" style="border:0; background:transparent; color:#8f96a0; border-radius:999px; height:38px; padding:0 12px; font:inherit; font-size:14px; cursor:pointer" style-hover="background:#f3f3f1">Cancel</button>
                                </div>
                                </sc-if>
                                <sc-if value="{{ f.ruled }}" hint-placeholder-val="{{ false }}">
                                <div style="display:flex; flex-wrap:wrap; align-items:center; gap:12px; width:100%">
                                  <span style="flex:1 1 320px; min-width:0; font-size:14px; line-height:1.5; color:{{ f.ruleFg }}; text-wrap:pretty">{{ f.ruleLine }}</span>
                                  <sc-if value="{{ f.showAccept }}" hint-placeholder-val="{{ false }}">
                                    <button sc-camel-on-click="{{ f.acceptFix }}" style="border:0; background:#1f2937; color:#fff; border-radius:10px; height:38px; padding:0 16px; font:inherit; font-size:14px; font-weight:500; cursor:pointer" style-hover="background:#2f3b4c">Accept it</button>
                                  </sc-if>
                                  <button sc-camel-on-click="{{ f.undoRule }}" style="border:0; background:transparent; color:#0060d0; border-radius:999px; height:38px; padding:0 12px; font:inherit; font-size:14px; cursor:pointer" style-hover="background:#f3f3f1">Undo</button>
                                </div>
                                </sc-if>
"""


#: The disconnected half of the Microsoft card.
#:
#: The card was drawn connected only, so « Disconnect » had nowhere
#: to land — pressing it could not change anything, which is why it
#: had no handler. This is the other half, in the same row shape, and
#: « Connect » brings the first half back.
DISCONNECTED = """
                <sc-if value="{{ msOff }}" hint-placeholder-val="{{ false }}">
                <div style="display:flex; align-items:center; gap:14px; padding:18px 22px">
                  <img src="e8a6d21c-d924-4c3a-a0a3-14d500b2042e" alt="" style="flex:0 0 20px; width:20px; height:20px; object-fit:contain; opacity:.5">
                  <span style="flex:1; min-width:0">
                    <span style="display:block; font-size:16.5px; font-weight:400; letter-spacing:-.012em; color:#8f96a0">No account connected</span>
                    <span style="display:block; font-size:14px; color:#8f96a0; margin-top:2px">No folder is watched and nothing syncs. Models can still be added by hand.</span>
                  </span>
                  <button sc-camel-on-click="{{ msConnect }}" style="flex:0 0 auto; border:0; background:transparent; font:inherit; font-size:14px; color:#0060d0; cursor:pointer; padding:4px 6px">Connect</button>
                </div>
                </sc-if>
"""

#: How the panel actually reaches Excel.
#:
#: A web page cannot install an Office add-in — it hands over the
#: manifest and says where it goes. The shipped web app already makes
#: exactly this choice, and its own comment gives the reason: « an
#: Install button that installs a broken add-in is worse than none ».
#: So the button opens the steps rather than pretending.
INSTALL_STEPS = """
                <sc-if value="{{ addinSteps }}" hint-placeholder-val="{{ false }}">
                <div style="border-top:.5px solid #f4f3f5; padding:16px 22px 18px; display:flex; flex-direction:column; gap:9px">
                  <span style="font-size:14px; color:#4a4f57; line-height:1.55; text-wrap:pretty">A web page cannot reach inside Excel, so the manifest is handed over and Excel loads it.</span>
                  <span style="font-size:13.5px; color:#8f96a0; line-height:1.6">1 · Save the manifest file.<br>2 · In Excel: File → Options → Trust Center → Trusted Add-in Catalogues, and add the folder you saved it in.<br>3 · Insert → My Add-ins → Shared Folder → Swens.</span>
                  <span sc-camel-on-click="{{ closeAddinSteps }}" style="align-self:flex-start; font-size:13px; color:#0060d0; cursor:pointer; padding-top:2px">Close</span>
                </div>
                </sc-if>
"""


#: The field « Search chats » had no field.
#:
#: The row is the founder's — magnifier, 15px label, ⌘K chip, 11px/10px
#: padding, 10px radius. This is the same box in its typing state, so
#: the sidebar does not move when it opens: same height, same gap,
#: same icon, and the ⌘K chip gives way to a clear button because at
#: that point the shortcut has already done its job.
SEARCH_FIELD = """
            <sc-if value="{{ histTyping }}" hint-placeholder-val="{{ false }}">
            <div style="flex:0 0 auto; display:flex; align-items:center; gap:13px; width:100%; background:rgba(16,20,28,.05); border-radius:10px; padding:11px 10px; margin-bottom:8px">
              <span style="display:flex; color:#9aa1ab"><svg width="17" height="17" sc-camel-view-box="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" style="flex:0 0 17px"><circle cx="11" cy="11" r="6.6"></circle><line x1="16" y1="16" x2="20.5" y2="20.5"></line></svg></span>
              <input ref="{{ histRef }}" value="{{ histQ }}" sc-camel-on-change="{{ setHistQ }}" sc-camel-on-key-down="{{ histKey }}" placeholder="Search chats" style="flex:1; min-width:0; border:0; background:transparent; padding:0; font:inherit; font-size:15px; letter-spacing:-.008em; color:#1c1f23; outline:none">
              <button sc-camel-on-click="{{ closeHistSearch }}" title="Clear" style="flex:0 0 auto; display:flex; border:0; background:transparent; border-radius:5px; padding:2px; color:#a2a29c; cursor:pointer" style-hover="color:#4a4f57"><svg width="15" height="15" sc-camel-view-box="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><line x1="6.5" y1="6.5" x2="17.5" y2="17.5"></line><line x1="17.5" y1="6.5" x2="6.5" y2="17.5"></line></svg></button>
            </div>
            </sc-if>
"""

#: What a search that finds nothing says.
#:
#: The empty-state shape from §3 of the design reference: a headline
#: at the list's own size, a quieter reason under it, no box and no
#: spinner — the sidebar is too narrow for a framed panel.
SEARCH_EMPTY = """
              <sc-if value="{{ histNone }}" hint-placeholder-val="{{ false }}">
                <span style="display:block; font-size:14.5px; letter-spacing:-.008em; color:#4a4f57; padding:26px 10px 0">No chats match “{{ histQ }}”</span>
                <span style="display:block; font-size:13px; line-height:1.55; color:#8f96a0; padding:6px 10px 0; text-wrap:pretty">{{ histNoneWhy }}</span>
              </sc-if>
"""

#: The file an answer names but the mock does not hold.
#:
#: Of the ten files the answers offer, this mock genuinely holds two:
#: the findings, and the written report. « Northbank Bid Model —
#: proposed v23 » is the workbook with the fixes in it; « v13 → v14
#: change log » is a diff of two files. Handing over a findings CSV
#: under either name is worse than handing over nothing, because it
#: looks like it worked. So the card says what the file is and what
#: produces it.
#:
#: Root-level, beside the report modal: an answer's files are offered
#: on the Ask screen, and a `position:fixed` panel nested inside the
#: dock stops meaning the viewport.
FILE_NOT_YET = """
  <sc-if value="{{ fileSoon }}" hint-placeholder-val="{{ false }}">
  <div sc-camel-on-click="{{ closeFileSoon }}" style="position:fixed; inset:0; z-index:80; display:flex; align-items:center; justify-content:center; background:rgba(16,20,28,.3); backdrop-filter:blur(3px); padding:24px">
    <div style="width:100%; max-width:440px; background:#fff; border-radius:24px; box-shadow:0 1px 2px rgba(16,22,35,.05), 0 24px 60px rgba(16,22,35,.14); padding:30px 32px 26px; display:flex; flex-direction:column; gap:12px">
      <span style="font-size:17.5px; font-weight:500; letter-spacing:-.012em; color:#1c1f23; text-wrap:pretty">{{ fileSoonName }}</span>
      <span style="font-size:14.5px; line-height:1.6; color:#4a4f57; text-wrap:pretty">{{ fileSoonWhat }}</span>
      <span style="font-size:13px; line-height:1.6; color:#8f96a0; text-wrap:pretty">This is a design mock. It holds the findings and the written report; every other file comes from a check against your own model.</span>
      <button sc-camel-on-click="{{ closeFileSoon }}" style="align-self:flex-start; margin-top:6px; border:0; background:transparent; color:#0060d0; border-radius:999px; height:36px; padding:0 12px; font:inherit; font-size:14px; cursor:pointer" style-hover="background:#f3f3f1">Close</button>
    </div>
  </div>
  </sc-if>
"""

#: Confirmation for a button that carries no label.
#:
#: Share is an icon alone, so the « Link copied » acknowledgement the
#: Settings copy uses in-place has nowhere to go. It sits beside the
#: icon instead, at the meta size, and leaves after the same 1.8s.
SHARE_COPIED = """
          <sc-if value="{{ shareCopied }}" hint-placeholder-val="{{ false }}">
            <span style="flex:0 0 auto; pointer-events:auto; font-size:12.5px; letter-spacing:-.01em; color:#6b7280; background:#fff; border-radius:999px; box-shadow:0 0 0 .5px rgba(30,32,38,.07), 0 6px 18px rgba(16,22,35,.05); padding:5px 11px; animation:pcIn .24s ease both">Link copied</span>
          </sc-if>
"""
