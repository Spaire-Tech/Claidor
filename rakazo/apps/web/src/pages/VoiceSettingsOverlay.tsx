import { Trans, useLingui } from "@lingui/react/macro";
import type { VoiceInfo, VoiceStatus } from "@rakazo/contracts";
import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
  Field,
  FieldLabel,
  NativeSelect,
  NativeSelectOption,
} from "@rakazo/ui-web";
import { XIcon } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { rpc } from "../lib/rpc";

/**
 * Which voice the agents speak with.
 *
 * The provider list and the key field are gone. This deployment has one voice
 * provider, keyed by the operator, so there is no provider to choose between
 * and nothing for anyone to paste — see `docs/product/claidor-on-rakazo.md` in
 * the parent repository. What remains is the question a person actually has:
 * which voice, and does it sound right.
 *
 * A bot can still be given a voice of its own in its own settings, and that
 * one wins over this.
 */
export function VoiceSettingsOverlay({
  onClose,
  embedded = false,
  onBusyChange,
}: {
  onClose: () => void;
  /** Render panel body only for the shared Settings shell. */
  embedded?: boolean;
  onBusyChange?: (busy: boolean) => void;
}) {
  const { t } = useLingui();
  const voiceSelectId = useId();
  const [status, setStatus] = useState<VoiceStatus | null>(null);
  const [voices, setVoices] = useState<VoiceInfo[]>([]);
  const [voiceId, setVoiceId] = useState("");
  const [canChoose, setCanChoose] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<"voice" | "test" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const busy = pending !== null;

  useEffect(() => {
    return () => onBusyChange?.(false);
  }, [onBusyChange]);

  function markPending(next: "voice" | "test" | null) {
    setPending(next);
    onBusyChange?.(next !== null);
  }

  useEffect(() => {
    let live = true;
    void Promise.all([
      rpc.voice.status(),
      rpc.voice.voices({}).catch(() => [] as VoiceInfo[]),
      rpc.me(),
    ])
      .then(([nextStatus, nextVoices, me]) => {
        if (!live) return;
        setStatus(nextStatus);
        setVoices(nextVoices);
        setVoiceId(nextStatus.voiceId);
        setCanChoose(Boolean(me.isDeploymentOwner));
      })
      .catch((cause) => {
        if (live) setError(cause instanceof Error ? cause.message : t`Could not load voices`);
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [t]);

  async function chooseVoice(nextVoiceId: string) {
    setVoiceId(nextVoiceId);
    if (!nextVoiceId || !canChoose) return;
    setError(null);
    setNotice(null);
    markPending("voice");
    try {
      setStatus(await rpc.voice.setVoice({ voiceId: nextVoiceId }));
      setNotice(t`Saved.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t`That did not go through.`);
    } finally {
      markPending(null);
    }
  }

  async function testVoice() {
    setError(null);
    setNotice(null);
    markPending("test");
    try {
      const { speaker } = await import("../lib/tts.js");
      await speaker.speak(t`Hi, this is how I'll sound when I read replies out loud.`);
      if (speaker.state.error) {
        setError(speaker.state.error);
        return;
      }
      setNotice(t`If you heard that, voice is ready.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : t`Could not play a test clip`);
    } finally {
      markPending(null);
    }
  }

  const body = (
    <>
      {!embedded ? (
        <div className="flex items-start justify-between px-6 pt-6 sm:px-8 sm:pt-7">
          <DialogTitle className="text-2xl font-medium text-foreground">
            <Trans>Voice</Trans>
          </DialogTitle>
          <DialogClose
            aria-label={t`Close voice settings`}
            disabled={busy}
            render={<Button variant="ghost" size="icon-sm" />}
          >
            <XIcon />
          </DialogClose>
        </div>
      ) : null}

      <div
        data-testid="voice-settings"
        className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-6 py-6 sm:px-8"
      >
        {loading ? (
          <p className="text-[13.5px] text-muted-foreground">
            <Trans>Loading…</Trans>
          </p>
        ) : !status?.configured ? (
          // Honest rather than blank: no voice provider is a thing the
          // operator fixes in the environment, not something a person here can.
          <p className="text-[13.5px] text-muted-foreground">
            <Trans>This deployment has no voice provider configured yet.</Trans>
          </p>
        ) : (
          <>
            <Field>
              <FieldLabel htmlFor={voiceSelectId}>
                <Trans>Voice</Trans>
              </FieldLabel>
              <NativeSelect
                id={voiceSelectId}
                value={voiceId}
                disabled={busy || !canChoose || voices.length === 0}
                onChange={(event) => void chooseVoice(event.target.value)}
              >
                {voiceId && !voices.some((voice) => voice.id === voiceId) ? (
                  <NativeSelectOption value={voiceId}>{voiceId}</NativeSelectOption>
                ) : null}
                {voices.map((voice) => (
                  <NativeSelectOption key={voice.id} value={voice.id}>
                    {voice.label}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
              <p className="mt-1.5 text-[12.5px] text-muted-foreground/80">
                {canChoose ? (
                  <Trans>Every agent speaks with this unless it has one of its own.</Trans>
                ) : (
                  <Trans>Chosen for this workspace. An agent can still have one of its own.</Trans>
                )}
              </p>
            </Field>

            <div>
              <Button
                variant="outline"
                disabled={busy || !status.ready}
                onClick={() => void testVoice()}
              >
                {pending === "test" ? <Trans>Playing…</Trans> : <Trans>Hear a sample</Trans>}
              </Button>
            </div>
          </>
        )}

        {notice ? <p className="text-[13.5px] text-success">{notice}</p> : null}
        {error ? <p className="text-[13.5px] text-destructive">{error}</p> : null}
      </div>
    </>
  );

  if (embedded) {
    return <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{body}</div>;
  }

  return (
    <Dialog
      open
      onOpenChange={(open, details) => {
        if (open) return;
        if (busy) {
          details.cancel();
          return;
        }
        onClose();
      }}
    >
      <DialogContent
        aria-describedby={undefined}
        showCloseButton={false}
        className="flex max-h-[calc(100%-2rem)] w-[520px] max-w-[calc(100%-2rem)] flex-col gap-0 overflow-hidden rounded-2xl p-0 sm:max-w-[520px]"
      >
        {body}
      </DialogContent>
    </Dialog>
  );
}
