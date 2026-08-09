import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Merge Tailwind classes without letting duplicates fight each other. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
