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
  "M32.6,3.0 C39.6,2.8 45.0,7.6 47.8,14.6 C50.2,20.6 51.2,27.2 51.6,33.6 C52.0,40.6 51.0,47.6 46.6,52.8 C42.2,58.0 34.8,61.4 27.6,60.8 C20.4,60.2 14.2,55.4 11.8,48.6 C9.4,41.8 10.2,34.2 11.6,27.0 C13.0,19.4 15.4,11.4 21.2,6.4 C24.2,3.9 28.6,3.2 32.6,3.0 Z";
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
/** cx, cy, rx, ry — ellipses now, matching the vector mark. */
const EYES: [number, number, number, number][] = [
  [26.4, 29.6, 2.6, 4.1], [38.4, 29.2, 2.6, 4.1],
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
  name: { color: t.brandNavy, fontWeight: "600", letterSpacing: -0.2 },
  /** The .io takes the brand orange #E86A2C, same as the fill now.
   *  2.65:1 on the cream — a brand decision, made with the number
   *  known rather than in spite of it. */
  tld: { color: t.tld, fontWeight: "500" },
});
