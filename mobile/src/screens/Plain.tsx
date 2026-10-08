/**
 * The app's own screens, all one shape: the mark, a line or two, a button.
 * Plain on purpose (8 October 2026): the founder designs them later.
 */
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import type { Palette } from "../theme";

const MARK = require("../../assets/splash-icon.png");
const MARK_DARK = require("../../assets/splash-icon-dark.png");

export interface PlainAction {
  readonly label: string;
  readonly onPress: () => void;
  readonly quiet?: boolean;
}

export function PlainScreen(props: {
  readonly palette: Palette;
  readonly title: string;
  readonly body?: string;
  readonly note?: string | undefined;
  readonly busy?: boolean;
  readonly actions?: readonly PlainAction[];
}) {
  const { palette } = props;
  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: palette.ground }]} edges={["top", "bottom"]}>
      <View style={styles.middle}>
        <Image source={palette.scheme === "dark" ? MARK_DARK : MARK} style={styles.mark} accessibilityIgnoresInvertColors />
        <Text style={[styles.title, { color: palette.ink }]} accessibilityRole="header">{props.title}</Text>
        {props.body == null ? null : <Text style={[styles.body, { color: palette.quiet }]}>{props.body}</Text>}
        {props.note == null ? null : <Text style={[styles.note, { color: palette.ink }]}>{props.note}</Text>}
      </View>
      <View style={styles.actions}>
        {props.busy === true ? <ActivityIndicator color={palette.quiet} style={styles.busy} /> : null}
        {(props.actions ?? []).map((action) => (
          <Pressable
            key={action.label}
            onPress={action.onPress}
            accessibilityRole="button"
            style={({ pressed }) => [action.quiet === true ? styles.quietButton : [styles.button, { backgroundColor: palette.button }], pressed ? styles.pressed : null]}
          >
            <Text style={[styles.buttonText, { color: action.quiet === true ? palette.quiet : palette.buttonInk }]}>{action.label}</Text>
          </Pressable>
        ))}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: 28 },
  middle: { flex: 1, alignItems: "center", justifyContent: "center" },
  mark: { width: 72, height: 72, marginBottom: 28 },
  title: { fontSize: 28, fontWeight: "600", textAlign: "center", letterSpacing: -0.4 },
  body: { fontSize: 17, lineHeight: 24, textAlign: "center", marginTop: 12, maxWidth: 320 },
  note: { fontSize: 15, lineHeight: 21, textAlign: "center", marginTop: 16, maxWidth: 320 },
  actions: { paddingBottom: 24, gap: 12 },
  busy: { marginBottom: 12 },
  button: { height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center" },
  quietButton: { height: 44, alignItems: "center", justifyContent: "center" },
  buttonText: { fontSize: 17, fontWeight: "600" },
  pressed: { opacity: 0.7 },
});
