import { View, Text, StyleSheet } from "react-native";
import Svg, { Path, Ellipse } from "react-native-svg";
import { t } from "@/lib/theme";

/**
 * The lockup.
 *
 * The mark was a rounded chip reading "PF" — a placeholder from before
 * the potato existed, which survived here after every other surface had
 * moved. One mark, drawn from the same geometry as `logo/mark.svg`;
 * duplicated as coordinates because React Native cannot import an SVG
 * file, not because there are two marks.
 *
 * The `.io` is lighter and sits inside the same `Text` node as the name,
 * so the two kern against each other. On the web this had to be forced —
 * a flex container made them separate boxes and the browser drew a gap
 * between them.
 */

const BODY =
  "M33,4 C42,4.5 48,11 50,20 C52,29 50,37 48,44 " +
  "C45,53 38,60 30,60 C21,60 15,54 13,45 " +
  "C11,35 12,24 16,15 C20,7 26,3.5 33,4 Z";

/** Fixed. Their unevenness is what makes the shape read as a potato
 *  rather than a bean, so they are not to be re-scattered. */
/** Two upright ovals, not scattered speckles. The pair is what makes
 *  the mark read as a character rather than a stone. */
/** Two ovals, similar size, slightly offset — character without
 *  becoming a face. */
/** Upper half of the form, similar size, slightly offset. */
const EYES: [number, number, number, number][] = [
  [25.5, 25, 3.2, 4.9], [38.5, 24.2, 3.1, 4.8],
];

export function Wordmark({ size = 17 }: { size?: number }) {
  // The mark is sized to the wordmark's cap height, not to a round
  // number — a mark that is 28px beside 17px type looks like two things
  // that arrived separately.
  const mark = Math.round(size * 1.65);
  return (
    <View style={s.row}>
      <Svg width={mark} height={mark} viewBox="0 0 64 64" style={s.mark}>
        <Path d={BODY} fill={t.accent} />
        {EYES.map(([cx, cy, rx, ry], i) => (
          <Ellipse key={i} cx={cx} cy={cy} rx={rx} ry={ry} fill={t.markEye} />
        ))}
      </Svg>
      <Text style={[s.name, { fontSize: size }]}>
        PotatoFarm<Text style={s.tld}>.io</Text>
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center" },
  mark: { marginRight: 9 },
  name: { color: t.ink, fontWeight: "600", letterSpacing: -0.2 },
  /** Type, so it takes the deeper orange — 5.56:1. The fill orange is
   *  3.12:1 and unreadable at this size. */
  tld: { color: t.tld, fontWeight: "500" },
});
