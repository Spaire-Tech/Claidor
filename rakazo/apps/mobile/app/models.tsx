import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { type MobileMe, type MobileModel, rpc } from "../lib/api";
import { mobileTokens } from "../lib/appearance";
import { useI18n } from "../lib/i18n";
import { native, useThemedStyles } from "../lib/native";

/**
 * Which model answers.
 *
 * This screen used to be a thousand lines of provider list, key field, base
 * URL, model-id probe, OAuth dance and advanced toggles. None of it is here
 * any more, and the absence is the product: the model service is the
 * deployment's own, its key is held server-side, and every request is metered
 * against the person's own allowance. There is nothing to paste.
 */
export default function Models() {
  const { t } = useI18n();
  const styles = useThemedStyles(createStyles);
  const [catalog, setCatalog] = useState<MobileModel[]>([]);
  const [me, setMe] = useState<MobileMe | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    let live = true;
    setLoading(true);
    void Promise.all([rpc<MobileModel[]>("models/list"), rpc<MobileMe>("me")])
      .then(([nextCatalog, nextMe]) => {
        if (!live) return;
        setCatalog(nextCatalog);
        setMe(nextMe);
        setError(null);
      })
      .catch((cause) => {
        if (live) setError(cause instanceof Error ? cause.message : t("Could not load models"));
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [t]);

  useFocusEffect(load);

  const activeId = me?.defaultModel ?? null;
  const canChoose = Boolean(me?.isDeploymentOwner) && catalog.length > 1;

  async function choose(entry: MobileModel) {
    if (!canChoose || entry.id === activeId || saving) return;
    setError(null);
    setSaving(entry.id);
    try {
      await rpc("models/setDefault", { provider: entry.provider, modelId: entry.id });
      setMe((current) =>
        current ? { ...current, defaultProvider: entry.provider, defaultModel: entry.id } : current,
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("That did not go through"));
    } finally {
      setSaving(null);
    }
  }

  return (
    <SafeAreaView edges={["bottom"]} style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.caption}>
          {canChoose
            ? t("Pick the model your team answers with.")
            : t("The model your team answers with.")}
        </Text>

        {loading ? <ActivityIndicator style={styles.spinner} /> : null}

        {catalog.map((entry) => {
          const active = entry.id === activeId;
          return (
            <Pressable
              key={`${entry.provider}:${entry.id}`}
              accessibilityRole="button"
              accessibilityState={{ selected: active, disabled: !canChoose }}
              disabled={!canChoose || saving !== null}
              onPress={() => void choose(entry)}
              style={[styles.row, active && styles.rowActive]}
            >
              <View style={styles.rowText}>
                <Text style={styles.rowLabel}>{entry.label}</Text>
                <Text style={styles.rowBilling}>{entry.billing}</Text>
              </View>
              {active ? <Text style={styles.check}>✓</Text> : null}
            </Pressable>
          );
        })}

        {!loading && catalog.length === 0 ? (
          <Text style={styles.empty}>{t("This deployment has no model service configured.")}</Text>
        ) : null}

        {error ? <Text style={styles.error}>{error}</Text> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function createStyles() {
  const tokens = mobileTokens();
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: native.page },
    content: { padding: 16, gap: 10 },
    caption: { color: tokens.mutedForeground, fontSize: 14, marginBottom: 4 },
    spinner: { marginVertical: 12 },
    row: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: tokens.border,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 12,
    },
    rowActive: { borderColor: tokens.primary, backgroundColor: tokens.accent },
    rowText: { flex: 1, gap: 2 },
    rowLabel: { color: tokens.foreground, fontSize: 16 },
    rowBilling: { color: tokens.mutedForeground, fontSize: 13 },
    check: { color: tokens.primary, fontSize: 16 },
    empty: { color: tokens.mutedForeground, fontSize: 14 },
    error: { color: tokens.destructive, fontSize: 14 },
  });
}
