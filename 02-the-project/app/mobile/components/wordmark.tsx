import { View, Text, StyleSheet } from "react-native";
import Svg, { Path, Rect } from "react-native-svg";
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
  "M31.8,3.2 C38.4,2.9 43.8,7.4 46.6,14.2 C49.0,20.0 49.8,26.4 50.4,32.6 " +
  "C51.0,39.2 50.6,46.2 46.8,51.8 C42.9,57.6 35.6,61.2 28.6,60.6 " +
  "C21.6,60.0 15.6,55.0 13.2,48.4 C10.8,41.8 11.4,34.4 12.6,27.4 " +
  "C13.9,19.8 16.2,11.6 21.8,6.6 C24.6,4.1 28.0,3.4 31.8,3.2 Z";

/** Fixed. Their unevenness is what makes the shape read as a potato
 *  rather than a bean, so they are not to be re-scattered. */
/** Two upright ovals, not scattered speckles. The pair is what makes
 *  the mark read as a character rather than a stone. */
/** Two ovals, similar size, slightly offset — character without
 *  becoming a face. */
/** Upper half of the form, similar size, slightly offset. */
/** x, y, w, h — capsules, matching the SVG masters. The source artwork
 *  has flat-sided eyes with round ends, and at this size that shape is
 *  the whole character. */
const EYES: [number, number, number, number][] = [
  [22.8, 22.2, 4.5, 10.0], [35.0, 21.6, 4.2, 9.6],
];

export function Wordmark({ size = 17 }: { size?: number }) {
  // The mark is sized to the wordmark's cap height, not to a round
  // number — a mark that is 28px beside 17px type looks like two things
  // that arrived separately.
  const mark = Math.round(size * 1.65);
  return (
    <View style={s.row}>
      <Svg width={mark} height={mark} viewBox="0 0 64 64" style={s.mark}>
        <Path d={BODY} fill={t.markBody} stroke={t.markRim} strokeWidth={1.7}
              strokeLinejoin="round" />
        {EYES.map(([x, y, w, h], i) => (
          <Rect key={i} x={x} y={y} width={w} height={h} rx={w / 2} fill={t.markEye} />
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
  /** The .io takes the brand orange #FF6600, same as the fill now.
   *  2.65:1 on the cream — a brand decision, made with the number
   *  known rather than in spite of it. */
  tld: { color: t.tld, fontWeight: "500" },
});
