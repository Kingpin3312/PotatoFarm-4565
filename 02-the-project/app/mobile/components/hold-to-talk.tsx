import { useState, useRef } from "react";
import { View, Text, Pressable, StyleSheet, Animated, Vibration } from "react-native";
import { start, stop, cancel, MESSAGES, type Recording } from "@/lib/voice";
import { t } from "@/lib/theme";

/**
 * Hold to record.
 *
 * Three things here are not decoration.
 *
 * **Slide up to cancel.** Borrowed from WhatsApp, because every agent
 * already knows it. A recording somebody wants to abandon mid-sentence
 * must be abandonable without lifting their thumb and tapping a bin
 * icon, which is exactly when they drop the phone.
 *
 * **Haptic on start, not on stop.** They need to know it is listening.
 * They can see that it stopped.
 *
 * **The duration counts up in the button.** Silent recording with no
 * feedback is how somebody talks for four minutes into a file nobody
 * will transcribe.
 */
export function HoldToTalk({
  onRecorded,
  disabled,
}: {
  onRecorded: (r: Recording) => void;
  disabled?: boolean;
}) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const startY = useRef(0);
  const scale = useRef(new Animated.Value(1)).current;

  const begin = async (y: number) => {
    const res = await start();
    if (!res.ok) {
      setError(MESSAGES[res.reason as keyof typeof MESSAGES] ?? null);
      return;
    }
    startY.current = y;
    setError(null);
    setRecording(true);
    setSeconds(0);
    Vibration.vibrate(12);
    Animated.spring(scale, { toValue: 1.15, useNativeDriver: true }).start();
    timer.current = setInterval(() => setSeconds((s) => s + 1), 1000);
  };

  const end = async () => {
    if (timer.current) clearInterval(timer.current);
    Animated.spring(scale, { toValue: 1, useNativeDriver: true }).start();
    setRecording(false);

    if (cancelling) {
      setCancelling(false);
      await cancel();
      return;
    }
    const rec = await stop();
    // Null means under a second — a mis-tap. Discarded silently, because
    // explaining it would be more annoying than the mistake.
    if (rec) onRecorded(rec);
  };

  return (
    <View style={s.wrap}>
      {error && <Text style={s.error}>{error}</Text>}

      {recording && (
        <Text style={[s.hint, cancelling && s.hintCancel]}>
          {cancelling ? "Release to cancel" : "Slide up to cancel"}
        </Text>
      )}

      <Pressable
        disabled={disabled}
        onPressIn={(e) => void begin(e.nativeEvent.pageY)}
        onPressOut={() => void end()}
        onTouchMove={(e) => {
          // 60pt of travel. Far enough not to trigger on a shaky thumb
          // in a moving car, near enough to reach without repositioning.
          const moved = startY.current - e.nativeEvent.pageY;
          setCancelling(recording && moved > 60);
        }}
        accessibilityRole="button"
        accessibilityLabel={recording ? "Recording, release to save" : "Hold to record a note"}
        accessibilityHint="Slide up while holding to cancel"
      >
        <Animated.View
          style={[
            s.button,
            { transform: [{ scale }] },
            recording && s.recording,
            cancelling && s.cancelling,
            disabled && s.off,
          ]}
        >
          <Text style={s.label}>
            {recording ? fmt(seconds) : "Hold to talk"}
          </Text>
        </Animated.View>
      </Pressable>
    </View>
  );
}

const fmt = (s: number) =>
  `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

const st = StyleSheet.create;
const s = st({
  wrap: { alignItems: "center", paddingVertical: 12 },
  // 56pt, comfortably above the 44pt minimum, because this is used with
  // one thumb while walking.
  button: {
    minHeight: 56, minWidth: 200, paddingHorizontal: 28, borderRadius: 28,
    backgroundColor: t.accent, alignItems: "center", justifyContent: "center",
  },
  recording: { backgroundColor: t.surface },
  cancelling: { backgroundColor: t.danger },
  off: { opacity: 0.4 },
  label: { color: t.onAccent, fontWeight: "600", fontSize: 16 },
  hint: { color: t.ink3, fontSize: 13, marginBottom: 10 },
  hintCancel: { color: t.danger, fontWeight: "600" },
  error: { color: t.danger, fontSize: 14, textAlign: "center", marginBottom: 10, maxWidth: 280 },
});
