import { createClient } from "next-sanity";

export const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID!;
export const dataset = process.env.NEXT_PUBLIC_SANITY_DATASET ?? "production";
const apiVersion = "2026-07-01";

/**
 * Published content, served from Sanity's CDN. Cached indefinitely and
 * cleared by the webhook in /api/revalidate — so a publish appears within
 * a second or two and nothing is refetched in between.
 */
export const client = createClient({
  projectId,
  dataset,
  apiVersion,
  useCdn: true,
  perspective: "published",
});

/**
 * Drafts, for preview. Never cached, never used in a normal page render.
 * The token is server-only — if it ever reaches the browser, anyone can
 * read unpublished content.
 */
export const draftClient = createClient({
  projectId,
  dataset,
  apiVersion,
  useCdn: false,
  perspective: "previewDrafts",
  token: process.env.SANITY_API_READ_TOKEN,
});
