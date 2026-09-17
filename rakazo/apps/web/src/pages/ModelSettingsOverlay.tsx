import { Trans, useLingui } from "@lingui/react/macro";
import type { Me, ModelCatalogEntry } from "@rakazo/contracts";
import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@rakazo/ui-web";
import { Check, X } from "lucide-react";
import { useEffect, useState } from "react";
import { rpc } from "../lib/rpc";

/**
 * Which model answers.
 *
 * This screen used to be a thousand lines: a provider list, a key field, a
 * base URL, a model-id probe, an OAuth dance and six advanced toggles. None of
 * it is here any more, and the absence is the product.
 *
 * The model service is the deployment's own. Its key is held server-side and
 * every request is metered against the person's own allowance, so there is
 * nothing for anyone to paste and nothing to connect. What is left is the one
 * question a person actually has — which model is answering — and, for the
 * deployment owner, the ability to change it.
 */
export function ModelSettingsOverlay({
  onClose,
  embedded = false,
  localOwner = false,
}: {
  onClose: () => void;
  /** Render panel body only for the shared Settings shell. */
  embedded?: boolean;
  localOwner?: boolean;
}) {
  const { t } = useLingui();
  const [catalog, setCatalog] = useState<ModelCatalogEntry[]>([]);
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void Promise.all([rpc.models.list().catch(() => []), rpc.me()])
      .then(([models, profile]) => {
        if (!live) return;
        setCatalog(models);
        setMe(profile);
      })
      .catch(() => undefined)
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, []);

  const activeId = me?.defaultModel ?? null;
  const canChoose = Boolean(me?.isDeploymentOwner) && catalog.length > 1;

  async function choose(entry: ModelCatalogEntry) {
    if (!canChoose || entry.id === activeId) return;
    setError(null);
    setSaving(entry.id);
    try {
      await rpc.models.setDefault({ provider: entry.provider, modelId: entry.id });
      setMe((current) =>
        current ? { ...current, defaultProvider: entry.provider, defaultModel: entry.id } : current,
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t`That did not go through.`);
    } finally {
      setSaving(null);
    }
  }

  const description = loading ? (
    <Trans>Loading…</Trans>
  ) : localOwner ? (
    <Trans>The model this server answers with.</Trans>
  ) : canChoose ? (
    <Trans>Pick the model your team answers with.</Trans>
  ) : (
    <Trans>The model your team answers with.</Trans>
  );

  const body = (
    <>
      {!embedded ? (
        <DialogHeader className="flex-row items-start justify-between px-6 pt-6 sm:px-8 sm:pt-7">
          <div>
            <DialogTitle className="text-2xl text-foreground">
              <Trans>Model</Trans>
            </DialogTitle>
            <DialogDescription className="mt-1 text-[13.5px] text-muted-foreground/70">
              {description}
            </DialogDescription>
          </div>
          <DialogClose
            render={<Button variant="ghost" size="icon-sm" aria-label={t`Close model settings`} />}
          >
            <X />
          </DialogClose>
        </DialogHeader>
      ) : (
        <p className="px-6 pt-1 text-[13.5px] text-muted-foreground/70 sm:px-8">{description}</p>
      )}

      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-6 py-6 sm:px-8">
        {catalog.map((entry) => {
          const active = entry.id === activeId;
          return (
            <button
              key={`${entry.provider}:${entry.id}`}
              type="button"
              disabled={!canChoose || saving !== null}
              aria-pressed={active}
              onClick={() => void choose(entry)}
              className={`flex items-center justify-between gap-4 rounded-xl border px-4 py-3 text-start transition-colors ${
                active ? "border-primary bg-accent" : "border-border"
              } ${canChoose ? "hover:bg-accent" : "cursor-default"}`}
            >
              <span className="min-w-0">
                <span className="block truncate text-[16px] text-foreground">{entry.label}</span>
                <span className="mt-0.5 block truncate text-[13px] text-muted-foreground">
                  {entry.billing}
                </span>
              </span>
              {active ? <Check aria-hidden className="size-4 shrink-0 text-primary" /> : null}
            </button>
          );
        })}

        {!loading && catalog.length === 0 ? (
          // Honest rather than blank: a deployment with no model service is a
          // configuration the operator has to fix, not something to hide.
          <p className="text-[13.5px] text-muted-foreground">
            <Trans>This deployment has no model service configured yet.</Trans>
          </p>
        ) : null}

        {error ? <p className="text-[13.5px] text-destructive">{error}</p> : null}
      </div>
    </>
  );

  if (embedded) {
    return (
      <div data-testid="model-settings" className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {body}
      </div>
    );
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="flex max-h-[calc(100%-2rem)] w-[520px] max-w-[calc(100%-2rem)] flex-col gap-0 overflow-hidden rounded-2xl bg-card p-0 sm:max-w-[520px]"
      >
        {body}
      </DialogContent>
    </Dialog>
  );
}
