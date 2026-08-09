import { client, draftClient } from "./client";
import { draftMode } from "next/headers";

/**
 * One fetch helper for the whole site.
 *
 * Content is cached forever and cleared by tag when something is
 * published. That means no time-based revalidation, no stale window, and
 * no needless refetching — an edit appears within a second or two of
 * being published and not before.
 */
export async function sanityFetch<T>({
  query,
  params = {},
  tags,
}: {
  query: string;
  params?: Record<string, unknown>;
  tags: string[];
}): Promise<T> {
  const isDraft = (await draftMode()).isEnabled;

  if (isDraft) {
    if (!process.env.SANITY_API_READ_TOKEN) {
      throw new Error("Draft mode is on but SANITY_API_READ_TOKEN is not set.");
    }
    return draftClient.fetch<T>(query, params, { cache: "no-store" });
  }

  return client.fetch<T>(query, params, {
    next: { revalidate: false, tags },
  });
}
