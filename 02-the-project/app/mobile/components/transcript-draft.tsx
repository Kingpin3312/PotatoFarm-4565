import { useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet } from "react-native";
import { ACCEPT_THRESHOLD, MESSAGES, type Draft } from "@/lib/voice";
import { t } from "@/lib/theme";

/**
 * The transcript, before it becomes a note.
 *
 * Transcription of accented English over road noise is wrong often
 * enough that accepting it silently would put invented sentences into a
 * client record — and a lead note is evidence in a dispute about who
 * said what.
 *
 * Same principle as the assistant: **the model drafts, a person
 * commits.**
 *
 * When confidence is low the text is shown but the field is focused for
 * editing rather than pre-accepted, and the agent is told why. The audio
 * stays until they decide, so there is always something true to fall
 * back on.
 */
export function TranscriptDraft({
  draft,
  onAccept,
  onDiscard,
  onPlay,
}: {
  draft: Draft;
  onAccept: (text: string) => void;
  onDiscard: () => void;
  onPlay: () => void;
}) {
  const [text, setText] = useState(draft.text);
  const unsure = draft.confidence < ACCEPT_THRESHOLD;

  return (
    <View style={[s.card, unsure && s.cardUnsure]}>
      <View style={s.head}>
        <Text style={s.kicker}>Voice note</Text>
        <Pressable onPress={onPlay} style={s.play} accessibilityRole="button"
                   accessibilityLabel="Play the recording">
          <Text style={s.playLabel}>{Math.round(draft.durationMs / 1000)}s ▸</Text>
        </Pressable>
      </View>

      {unsure && <Text style={s.warn}>{MESSAGES.low_confidence}</Text>}

      <TextInput
        style={s.input}
        value={text}
        onChangeText={setText}
        multiline
        // Focused when we are unsure, so the agent lands in the text
        // rather than reaching for the accept button out of habit.
        autoFocus={unsure}
        accessibilityLabel="Transcript, editable"
      />

      <View style={s.actions}>
        <Pressable onPress={onDiscard} style={[s.btn, s.btnQuiet]} accessibilityRole="button">
          <Text style={s.btnQuietLabel}>Discard</Text>
        </Pressable>
        <Pressable
          onPress={() => onAccept(text.trim())}
          disabled={!text.trim()}
          style={[s.btn, s.btnGo, !text.trim() && s.off]}
          accessibilityRole="button"
        >
          <Text style={s.btnGoLabel}>Save to the lead</Text>
        </Pressable>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: t.sunk, borderRadius: 14, padding: 16, marginVertical: 12 },
  cardUnsure: { borderLeftWidth: 3, borderLeftColor: t.danger },
  head: { flexDirection: "row", alignItems: "center", marginBottom: 10 },
  kicker: { color: t.ink3, fontSize: 12, letterSpacing: 0.6, textTransform: "uppercase" },
  play: { marginLeft: "auto", minHeight: 44, minWidth: 60, justifyContent: "center", alignItems: "flex-end" },
  playLabel: { color: t.accent, fontWeight: "600", fontSize: 14 },
  warn: { color: t.ink2, fontSize: 13, lineHeight: 19, marginBottom: 10 },
  input: {
    color: t.ink, fontSize: 16, lineHeight: 23, minHeight: 72,
    backgroundColor: t.raised, borderRadius: 10, padding: 12,
  },
  actions: { flexDirection: "row", gap: 10, marginTop: 14 },
  btn: { minHeight: 44, borderRadius: 22, paddingHorizontal: 20, justifyContent: "center" },
  btnQuiet: { borderWidth: 1, borderColor: t.rule },
  btnQuietLabel: { color: t.ink, fontWeight: "500", fontSize: 15 },
  btnGo: { backgroundColor: t.accent, flex: 1, alignItems: "center" },
  btnGoLabel: { color: t.onAccent, fontWeight: "600", fontSize: 15 },
  off: { opacity: 0.4 },
});
