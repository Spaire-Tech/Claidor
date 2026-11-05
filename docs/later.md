# Later

Things the founder wants looked at, but not now. Each item says what it is,
where it stands, and where to start in the code. Check the line numbers
again before starting: the code moves.

## The sidebar without the computer

*Noted on 5 November 2026. Not started.*

**Today.** Showing the sidebar doesn't wake the computer. The list comes
from this device's saved copy and from the server's copy
(`GET /desktop/api/chats/agents`). Pins and folders are read only if the
computer is already awake. Every **change** goes to the computer and wakes
it: pin, folder, rename, hide, delete. The pins and folders themselves are
stored only on the computer. Live status (working, waiting) still needs the
computer awake.

**The idea.** Keep pins, folders and sidebar edits on the server. Pass them
to the computer the next time it wakes. Then nothing in the sidebar wakes
the computer. Rough size: half a day to a day.

**Where to start**

Mac and iPhone (`ios/SimeonCore`, shared by both apps):

- Pins: `Store.swift:693` (`loadPins`, read with `commandIfAwake`) and
  `Store.swift:719` (`setPinned`, writes `setHostSettings({pinnedAgentIds})`).
- Hide: `Store.swift:758` (`setHidden`, sends `setAgentHiddenFromSidebar`).
- Folders: `StoreAgents.swift:75` (`loadSections`) and `StoreAgents.swift:98`
  (`editSections`, writes `setHostSettings({sidebarSections})`).
- Rename: `StoreAgents.swift:153`. Delete: `StoreAgents.swift:222`.
- Every write goes through `Store.swift:1507` (`command`), which wakes the
  computer (`Backend.swift:206`).
- The device's saved copy of pins and folders: `StoreSaved.swift:33`
  (`showSavedLayout`), `SavedChats.swift:239`.
- The server's copy of the list: `StoreSaved.swift:62` (`showServerList`).

Web and Windows app (`clients/apps/app/src/core/store.ts`):

- `loadPins` 1044, `setPinned` 1064, `loadSections` 1102, `setHidden` 1181,
  `deleteAgents` 1195, `renameAgent` 1236.

Engine on the computer (`desktop/source`):

- Where pins and folders are stored:
  `shared/node/settings/sand-settings-store.ts:195` and `:198`; set through
  `host/extensions/settings/settings-service.ts:51`.
- Hide: `host/extensions/transcript/agent-lifecycle.ts:748`.
- The engine pushes its list to the server here:
  `host/extensions/chat-copy/chat-copy.ts:30`.

Server (`server/simeon/desktop/chats.py`):

- `chats_agents` at line 256 returns the agent rows only: no pins, no
  folders, no hidden flag yet.

**Done means.** On a Mac and an iPhone, with the computer asleep: pin,
unpin, make a folder, move a chat into it, rename, hide. None of it wakes
the computer. The change shows on the other device. When the computer
wakes, it has the same pins and folders.
