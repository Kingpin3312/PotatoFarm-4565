import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FlatCompat } from "@eslint/eslintrc";

/**
 * Next's own rules, including React's rules of hooks.
 *
 * `npm run lint` was declared with no linter behind it: `next lint`
 * stopped at an interactive "how would you like to configure ESLint?"
 * prompt, so the `eslint-disable` comments in the code were suppressing
 * a tool that never ran. Core web vitals rather than the TypeScript
 * preset: the type checker already runs in strict mode, and the value
 * here is the hooks and Next.js rules a type checker cannot see.
 */
const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) });

export default [
  { ignores: [".next/**", ".tmp/**", "node_modules/**", "manual-assets/**", "public/**", "next-env.d.ts"] },
  ...compat.extends("next/core-web-vitals"),
];
