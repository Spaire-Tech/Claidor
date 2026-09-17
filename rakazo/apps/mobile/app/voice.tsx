import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { type MobileMe, rpc } from "../lib/api";
import { mobileTokens } from "../lib/appearance";
import { useI18n } from "../lib/i18n";
import { native, useThemedStyles } from "../lib/native";
import { speakText } from "../lib/voice";

type VoiceStatus = {
  configured: boolean;
  ready: boolean;
  provider: string | null;
  voiceId: string;
};
type VoiceInfo = { id: string; label: string; description?: string };

/**
 * Which voice the agents speak with.
 *
 * The provider list and the key field are gone: this deployment has one voice
 * provider, keyed by the operator, so there is nothing to choose between and
 * nothing to paste. A bot can still have a voice of its own in its settings,
 * and that one wins.
 */
export default function VoiceSettings() {
  const styles = useThemedStyles(createVoiceStyles);
  const { t } = useI18n();
  const [status, setStatus] = useState<VoiceStatus | null>(null);
  const [voices, setVoices] = useState<VoiceInfo[]>([]);
  const [canChoose, setCanChoose] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(() => {
    let live = true;
    setLoading(true);
    void Promise.all([
      rpc<VoiceStatus>("voice/status"),
      rpc<VoiceInfo[]>("voice/voices", {}).catch(() => [] as VoiceInfo[]),
      rpc<MobileMe>("me"),
    ])
      .then(([nextStatus, nextVoices, me]) => {
        if (!live) return;
        setStatus(nextStatus);
        setVoices(nextVoices);
        setCanChoose(Boolean(me.isDeploymentOwner));
        setError(null);
      })
      .catch((cause) => {
        if (live) setError(cause instanceof Error ? cause.message : t("Could not load voices"));
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [t]);

  useFocusEffect(load);

  async function chooseVoice(voiceId: string) {
    if (!canChoose || busy || voiceId === status?.voiceId) return;
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      setStatus(await rpc<VoiceStatus>("voice/setVoice", { voiceId }));
      setNotice(t("Saved."));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("That did not go through"));
    } finally {
      setBusy(false);
    }
  }

  async function testVoice() {
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      await speakText(t("Hi, this is how I'll sound when I read replies out loud."));
      setNotice(t("If you heard that, voice is ready."));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("Could not play a test clip"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView edges={["bottom"]} style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {notice ? <Text style={styles.notice}>{notice}</Text> : null}
        {loading ? <ActivityIndicator /> : null}

        {!loading && !status?.configured ? (
          <Text style={styles.cardMeta}>
            {t("This deployment has no voice provider configured.")}
          </Text>
        ) : null}

        {status?.configured ? (
          <>
            <Text style={styles.cardMeta}>
              {canChoose
                ? t("Every agent speaks with this unless it has one of its own.")
                : t("Chosen for this workspace. An agent can still have one of its own.")}
            </Text>

            <View style={styles.voices}>
              {voices.map((voice) => (
                <Pressable
                  key={voice.id}
                  accessibilityRole="button"
                  accessibilityState={{
                    selected: voice.id === status.voiceId,
                    disabled: !canChoose,
                  }}
                  disabled={!canChoose || busy}
                  onPress={() => void chooseVoice(voice.id)}
                  style={styles.voiceRow}
                >
                  <Text style={styles.voiceLabel}>{voice.label}</Text>
                  {voice.id === status.voiceId ? <Text style={styles.check}>✓</Text> : null}
                </Pressable>
              ))}
            </View>

            <Pressable
              accessibilityRole="button"
              disabled={busy || !status.ready}
              onPress={() => void testVoice()}
              style={[styles.button, (busy || !status.ready) && styles.disabled]}
            >
              <Text style={styles.buttonLabel}>{t("Hear a sample")}</Text>
            </Pressable>
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function createVoiceStyles() {
  const tokens = mobileTokens();
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: native.page },
    content: { padding: 20, gap: 10 },
    error: { color: tokens.destructive, marginBottom: 8 },
    notice: { color: tokens.success, marginBottom: 8 },
    cardMeta: { color: native.tertiaryLabel, marginTop: 4, fontSize: 12 },
    button: {
      marginTop: 8,
      backgroundColor: tokens.primary,
      borderRadius: 12,
      paddingVertical: 12,
      alignItems: "center",
    },
    disabled: { opacity: 0.4 },
    buttonLabel: { color: tokens.primaryForeground, fontWeight: "600" },
    voices: { marginTop: 12, borderRadius: 12, borderWidth: 1, borderColor: tokens.border },
    voiceRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      paddingHorizontal: 14,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: tokens.border,
    },
    voiceLabel: { color: native.label },
    check: { color: tokens.success },
  });
}
