import type { ComposeRow } from "@rakazo/core";
import {
  ComposeAction,
  ComposeRowKind,
  canCreate,
  composeRows,
  DEFAULT_VOICE_ID,
  VOICES,
  voiceById,
} from "@rakazo/core";
import { type KeyboardEvent, useMemo, useRef, useState } from "react";
import { AVATAR_COUNT, Blob } from "./Blob.js";
import { VoiceOrb } from "./VoiceOrb.js";
import "./compose.css";

/**
 * Starting something: a To: line, a picker, and the new-agent form.
 *
 * Read out of `desktop/src/renderer/design/shell/Compose.tsx`. It takes over
 * the window rather than opening a dialog over it, which is what the canvas
 * does and what Messages does: composing is a place you are, not a thing on top
 * of where you were.
 *
 * Which rows the picker shows, in what order, and which one ⌘1 means are
 * `@rakazo/core`'s `caisra-compose` and tested there; this draws them.
 *
 * There is no X. The shell's back bar is the way out of every screen.
 */
export function Compose({
  agents,
  onPick,
  onCreate,
}: {
  agents: readonly { id: string; name: string }[];
  onPick?: (agentId: string) => void;
  onCreate?: (draft: { name: string; label: string; description: string; voiceId: string }) => void;
}) {
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [label, setLabel] = useState("");
  const [description, setDescription] = useState("");
  // No voice until one is picked: the canvas starts at "No voice yet", not at a
  // default nobody chose.
  const [voiceId, setVoiceId] = useState("");
  const [pickingVoice, setPickingVoice] = useState(false);
  // Rolled once, when "Create new agent" is taken, and held until the agent is
  // made. It used to be drawn from the name — a different face on every
  // keystroke, and none of them the one the agent ended up with.
  const [avatar, setAvatar] = useState(0);
  const [avatarOpen, setAvatarOpen] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  const rows = useMemo(() => composeRows({ agents, query }), [agents, query]);
  const voice = voiceById(voiceId);

  const take = (row: ComposeRow) => {
    if (row.kind === ComposeRowKind.Action && row.id === ComposeAction.NewAgent) {
      setAvatar(Math.floor(Math.random() * AVATAR_COUNT));
      setCreating(true);
      // The name is the only thing required, so start in it.
      window.setTimeout(() => nameRef.current?.focus(), 0);
      return;
    }
    onPick?.(row.id);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    const first = rows[0];
    if (event.key === "Enter" && first) {
      event.preventDefault();
      take(first);
      return;
    }
    if ((event.metaKey || event.ctrlKey) && /^[1-9]$/.test(event.key)) {
      const row = rows.find((one) => one.key === event.key);
      if (row) {
        event.preventDefault();
        take(row);
      }
    }
  };

  return (
    <div className="compose">
      <div className="compose__to">
        <span className="compose__tolabel">To:</span>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder={creating ? "New agent" : "Search"}
          aria-label="Who to message"
          disabled={creating}
        />
      </div>

      <div className="compose__body">
        {creating ? (
          <div className="newagent">
            <div className="newagent__head">
              {/* The face is the one the agent will wear. It is settled before
                  you type, so the agent that appears in the list is the one you
                  were looking at while you named it. */}
              <Blob seed="new agent" avatar={avatar} size={52} />
              <div className="newagent__headstack">
                <div className="newagent__title">New agent</div>
                <div className="newagent__hint">Pick an avatar, a name and a voice.</div>
              </div>
              <button
                type="button"
                className="editavatar"
                aria-expanded={avatarOpen}
                onClick={() => setAvatarOpen((one) => !one)}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.7}
                  aria-hidden
                  focusable="false"
                >
                  <path d="M4 20h4l10.5-10.5a2.5 2.5 0 00-3.5-3.5L4.5 16.5V20z" />
                  <path d="M14.5 6.5l3 3" />
                </svg>
                <span>Edit avatar</span>
              </button>
            </div>

            {avatarOpen ? (
              <div className="avatars">
                <div className="avatars__title">Choose an avatar</div>
                <div className="avatars__grid">
                  {Array.from({ length: AVATAR_COUNT }, (_, index) => (
                    <button
                      // The faces are a fixed list in a fixed order, so the
                      // position is the identity.
                      // biome-ignore lint/suspicious/noArrayIndexKey: the index is the face
                      key={index}
                      type="button"
                      aria-label={`Avatar ${index + 1}`}
                      aria-pressed={index === avatar}
                      className={`avatars__one ${index === avatar ? "avatars__one--on" : ""}`}
                      onClick={() => setAvatar(index)}
                    >
                      <Blob seed="grid" avatar={index} size={31} />
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            <Group title="Name">
              <input
                ref={nameRef}
                className="cfield"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="e.g. Perrin"
              />
            </Group>

            <Group title="Voice">
              <button type="button" className="voicepill" onClick={() => setPickingVoice(true)}>
                {voice ? (
                  <VoiceOrb voice={voice} size={26} />
                ) : (
                  <span className="voicepill__none" />
                )}
                <span className="voicepill__name">{voice?.name ?? "No voice yet"}</span>
                <span className="voicepill__action">{voice ? "Change" : "Add"}</span>
              </button>
            </Group>

            <Group title="Label (optional)">
              <input
                className="cfield"
                value={label}
                onChange={(event) => setLabel(event.target.value)}
                placeholder="Research, marketing, admin…"
              />
            </Group>

            <Group title="Description">
              <textarea
                className="cfield cfield--area"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="What should this agent take care of?"
              />
            </Group>

            <div className="newagent__actions">
              <button
                type="button"
                className="pill pill--primary"
                disabled={!canCreate(name)}
                onClick={() => onCreate?.({ name, label, description, voiceId })}
              >
                Create agent
              </button>
              <button type="button" className="pill" onClick={() => setCreating(false)}>
                Cancel
              </button>
            </div>

            {/* A quiet reminder of what the picked voice is, under the form. */}
            {voice ? (
              <div className="newagent__voicenote">
                {voice.name} — {voice.description.toLowerCase()}
              </div>
            ) : null}
          </div>
        ) : (
          <div className="picker">
            {rows.length === 0 ? (
              <div className="picker__empty">
                Nobody by that name. Clear the box to see everyone.
              </div>
            ) : null}
            {rows.map((row) => (
              <button
                type="button"
                key={`${row.kind}:${row.id}`}
                className="picker__row"
                onClick={() => take(row)}
              >
                {row.kind === ComposeRowKind.Agent ? (
                  <Blob seed={row.id} size={25} />
                ) : (
                  <span className="picker__plus">+</span>
                )}
                <span className="picker__label">{row.label}</span>
                {row.key ? (
                  <span className="picker__keys">
                    <span className="keycap">⌘</span>
                    <span className="keycap">{row.key}</span>
                  </span>
                ) : null}
              </button>
            ))}
          </div>
        )}
      </div>

      {pickingVoice ? (
        <VoicePicker
          voiceId={voiceId}
          onPick={(id) => {
            setVoiceId(id);
            setPickingVoice(false);
          }}
          onClose={() => setPickingVoice(false)}
        />
      ) : null}
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="cgroup">
      <div className="cgroup__title">{title}</div>
      {children}
    </div>
  );
}

/**
 * The voice picker: one sphere at a time, an arrow either side, a dot per
 * voice. Over the screen with the canvas's scrim behind it.
 */
function VoicePicker({
  voiceId,
  onPick,
  onClose,
}: {
  voiceId: string;
  onPick: (id: string) => void;
  onClose: () => void;
}) {
  const start = Math.max(
    0,
    VOICES.findIndex((one) => one.id === (voiceId || DEFAULT_VOICE_ID)),
  );
  const [at, setAt] = useState(start);
  const voice = VOICES[at] ?? VOICES[0];
  if (!voice) return null;

  // Wrapping, so neither arrow is ever dead. `+ VOICES.length` because
  // `-1 % 7` is `-1` in JavaScript and would leave nothing selected.
  const step = (by: number) => setAt((current) => (current + by + VOICES.length) % VOICES.length);

  return (
    <div
      className="scrim"
      onClick={onClose}
      onKeyDown={(event) => {
        if (event.key === "Escape") onClose();
      }}
      role="presentation"
    >
      <div className="voicedialog" onClick={(event) => event.stopPropagation()} role="presentation">
        <div className="voicedialog__head">
          <div className="voicedialog__title">Choose a voice.</div>
          <div className="voicedialog__sub">How your agent speaks to you.</div>
        </div>

        <VoiceOrb voice={voice} size={163} elevated />

        <div className="voicedialog__row">
          <button
            type="button"
            className="voicedialog__arrow"
            aria-label="Previous voice"
            onClick={() => step(-1)}
          >
            <Arrow d="M15 5l-7 7 7 7" />
          </button>
          <div className="voicedialog__name">
            <div className="voicedialog__voice">{voice.name}</div>
            <div className="voicedialog__desc">{voice.description}</div>
          </div>
          <button
            type="button"
            className="voicedialog__arrow"
            aria-label="Next voice"
            onClick={() => step(1)}
          >
            <Arrow d="M9 5l7 7-7 7" />
          </button>
        </div>

        <div className="voicedialog__dots">
          {VOICES.map((one, index) => (
            <button
              key={one.id}
              type="button"
              aria-label={one.name}
              aria-current={index === at}
              className={`voicedialog__dot ${index === at ? "voicedialog__dot--on" : ""}`}
              onClick={() => setAt(index)}
            />
          ))}
        </div>

        <div className="voicedialog__actions">
          <button type="button" className="pill pill--primary" onClick={() => onPick(voice.id)}>
            Use this voice
          </button>
          <button type="button" className="pill" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function Arrow({ d }: { d: string }) {
  return (
    <svg
      width="15.5"
      height="15.5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
    >
      <path d={d} />
    </svg>
  );
}
