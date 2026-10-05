import { useRef, useState, type KeyboardEvent } from "react";

import type { AgentSummary } from "../bridge/types.js";

export function Composer({ agent, onSend }: { readonly agent: AgentSummary; readonly onSend: (text: string) => Promise<void> }) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const area = useRef<HTMLTextAreaElement>(null);

  const submit = async () => {
    const message = text.trim();
    if (message.length === 0 || sending) return;
    setSending(true);
    setError(null);
    try {
      await onSend(message);
      setText("");
      if (area.current != null) area.current.style.height = "";
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setSending(false);
      area.current?.focus();
    }
  };
  const onKey = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void submit(); }
  };
  const grow = (node: HTMLTextAreaElement) => {
    node.style.height = "";
    node.style.height = `${Math.min(node.scrollHeight, 220)}px`;
  };

  return (
    <form className="composer" onSubmit={event => { event.preventDefault(); void submit(); }}>
      <button type="button" className="composer__attach" title="Attach" aria-label="Attach a file"><PlusIcon /></button>
      <textarea
        ref={area}
        className="composer__input"
        rows={1}
        placeholder={`Message ${agent.name}`}
        value={text}
        disabled={sending}
        onChange={event => { setText(event.target.value); grow(event.target); }}
        onKeyDown={onKey}
        aria-label={`Message ${agent.name}`}
      />
      {text.trim().length > 0
        ? <button type="submit" className="composer__send" title="Send" aria-label="Send" disabled={sending}><SendIcon /></button>
        : <button type="button" className="composer__mic" title="Dictate" aria-label="Dictate"><MicIcon /></button>}
      {error != null ? <div className="composer__error" role="alert">{error}</div> : null}
    </form>
  );
}

function PlusIcon() { return <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" fill="none" /></svg>; }
function SendIcon() { return <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 13V3m0 0L4 7m4-4 4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" /></svg>; }
function MicIcon() { return <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><rect x="5.5" y="2" width="5" height="8" rx="2.5" fill="currentColor" /><path d="M3.5 8a4.5 4.5 0 0 0 9 0M8 12.5V14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" /></svg>; }
