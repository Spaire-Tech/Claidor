import { useState } from "react";
import { Banner, Button } from "@/ui/primitives";
import {
  looksLikeToken,
  setClaidorToken,
} from "@/claidor/session";

/**
 * Where a token gets into the pane, until the sign-in dialog exists.
 *
 * Pasting a token is not the product. It is here because the alternative
 * was waiting for an OAuth flow before anyone could point the panel at a
 * real contract, and the thing most worth learning right now is whether
 * the checks are useful — a question a paste answers as well as a dialog
 * does.
 *
 * It sits in the Check panel rather than in Settings because that is where
 * somebody meets the need. A gate whose remedy is three taps away in
 * another tab is a gate people give up at.
 *
 * The shape is checked before the token is stored, so pasting the wrong
 * string is refused here rather than surfacing as a 401 two screens later
 * that reads as « your sign-in expired ».
 */
export function TokenGate({ onSaved }: { onSaved: () => void }) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  function save() {
    const token = value.trim();
    setError(null);
    setWarning(null);

    if (!token) {
      setError("Paste a token first.");
      return;
    }
    if (!looksLikeToken(token)) {
      setError(
        'That does not look like a Claidor token. They start with "claidor_pat_".',
      );
      return;
    }

    const persisted = setClaidorToken(token);
    if (!persisted) {
      // The token is in memory and will work, but only until the pane
      // reloads. Say so rather than let it vanish without explanation.
      setWarning(
        "Saved for this session only — this Word is blocking storage, so you will have to paste it again after a reload.",
      );
    }
    onSaved();
  }

  return (
    <div className="stack" style={{ gap: 10 }}>
      <div className="card" style={{ padding: 14 }}>
        <strong>Connect to Claidor</strong>
        <p className="small muted" style={{ margin: "6px 0 10px" }}>
          The checks run on the Claidor engine, not in this pane, so the
          panel needs a token to reach it. Create one in Claidor under
          Settings, give it the <code>redline:read</code> scope, and paste
          it here.
        </p>

        <label className="small" htmlFor="claidor-token">
          Token
        </label>
        <input
          id="claidor-token"
          className="input"
          type="password"
          autoComplete="off"
          spellCheck={false}
          placeholder="claidor_pat_..."
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
          }}
          style={{ width: "100%", marginTop: 4 }}
        />

        <Button
          variant="primary"
          size="sm"
          block
          onClick={save}
          style={{ marginTop: 10 }}
        >
          Connect
        </Button>

        <p className="small muted" style={{ margin: "10px 0 0" }}>
          It is kept in this add-in's own storage, never written into the
          document. A token in the document would travel with the agreement.
        </p>
      </div>

      {error && <Banner tone="danger">{error}</Banner>}
      {warning && <Banner tone="warn">{warning}</Banner>}
    </div>
  );
}
