import { useState, useRef } from "react";
import { View, TextInput, Pressable, Text, StyleSheet, Keyboard } from "react-native";
import { enqueue } from "@/lib/queue";
import { t } from "@/lib/theme";

/**
 * The in-app reply bar.
 *
 * This is the **fallback** path, not the primary one. Most replies
 * should happen from the notification without the app opening at all —
 * see lib/notifications.ts. This exists for the agent who is already in
 * a thread, and for the reply the lock screen refused.
 *
 * Being explicit about that ordering matters. If we build this first and
 * best, we will optimise it, and then we will have built the same
 * fifteen-second interaction every competitor has.
 */
export function ReplyBar({
  conversationId,
  windowOpen,
  hoursLeft,
  onTemplate,
}: {
  conversationId: string;
  windowOpen: boolean;
  hoursLeft: number | null;
  onTemplate: () => void;
}) {
  const [draft, setDraft] = useState("");
  const input = useRef<TextInput>(null);

  /**
   * Replaced, not disabled.
   *
   * Outside the reply window a free-form message is accepted by Meta
   * and never delivered. A greyed-out box leaves an agent typing into
   * nothing and concluding the buyer is ignoring them — the exact silent
   * failure this whole product is built to prevent.
   */
  if (!windowOpen) {
    return (
      <View style={s.closed}>
        <Text style={s.closedTitle}>Quiet for more than 24 hours</Text>
        <Text style={s.closedBody}>
          WhatsApp only allows an approved template until they reply. That&rsquo;s Meta&rsquo;s
          rule for every business, not ours.
        </Text>
        <Pressable style={s.templateBtn} onPress={onTemplate} accessibilityRole="button">
          <Text style={s.templateLabel}>Send a follow-up template</Text>
        </Pressable>
      </View>
    );
  }

  const send = async () => {
    const body = draft.trim();
    if (!body) return;

    // Cleared immediately. The queue owns it from here, and the
    // timestamp travels with it — an agent replying at 21:04 in a
    // basement is recorded at 21:04, not at whenever it syncs.
    setDraft("");
    Keyboard.dismiss();
    await enqueue({
      kind: "conversation.send",
      conversationId,
      body,
      createdAt: new Date().toISOString(),
    });
  };

  return (
    <View style={s.wrap}>
      {hoursLeft !== null && hoursLeft <= 4 && (
        // Only shown when it is nearly out. A permanent countdown is
        // noise; one that appears at four hours is information.
        <Text style={s.warn}>Reply window closes in {hoursLeft}h</Text>
      )}
      <View style={s.row}>
        <TextInput
          ref={input}
          style={s.input}
          value={draft}
          onChangeText={setDraft}
          placeholder="Reply…"
          placeholderTextColor={t.ink3}
          multiline
          // Blue rather than the default, so the keyboard matches the app.
          keyboardAppearance="light"
          accessibilityLabel="Reply to this lead"
        />
        <Pressable
          onPress={send}
          disabled={!draft.trim()}
          // 44pt minimum, in the base style rather than remembered per
          // instance. An agent with one thumb in a car is the primary
          // case, not an accessibility afterthought.
          style={[s.send, !draft.trim() && s.sendOff]}
          accessibilityRole="button"
          accessibilityLabel="Send"
        >
          <Text style={s.sendLabel}>Send</Text>
        </Pressable>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { borderTopWidth: 1, borderTopColor: t.rule, backgroundColor: t.ground, padding: 12 },
  warn: { color: t.accent, fontSize: 11, letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 8 },
  row: { flexDirection: "row", alignItems: "flex-end", gap: 10 },
  input: {
    flex: 1, minHeight: 44, maxHeight: 120, paddingHorizontal: 14, paddingVertical: 11,
    fontSize: 16, color: t.ink, backgroundColor: t.sunk, borderRadius: 22,
  },
  send: {
    minHeight: 44, minWidth: 44, paddingHorizontal: 18, borderRadius: 22,
    backgroundColor: t.accent, alignItems: "center", justifyContent: "center",
  },
  sendOff: { opacity: 0.4 },
  sendLabel: { color: t.onAccent, fontWeight: "600", fontSize: 15 },

  closed: { borderTopWidth: 1, borderTopColor: t.rule, backgroundColor: t.sunk, padding: 16 },
  closedTitle: { color: t.ink, fontWeight: "600", fontSize: 15, marginBottom: 4 },
  closedBody: { color: t.ink2, fontSize: 14, lineHeight: 20, marginBottom: 12 },
  templateBtn: {
    minHeight: 44, borderRadius: 22, backgroundColor: t.accent,
    alignItems: "center", justifyContent: "center", paddingHorizontal: 18,
  },
  templateLabel: { color: t.onAccent, fontWeight: "600", fontSize: 15 },
});
