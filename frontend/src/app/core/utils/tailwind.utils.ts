import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merge conditional class names and resolve Tailwind utility conflicts.
 * shadcn-style helper used by the `shared/ui` primitives and feature
 * components alike — pass any mix of strings, arrays, and conditional
 * objects; `clsx` flattens them and `twMerge` deduplicates conflicting
 * Tailwind utilities (e.g. a later `rounded-3xl` wins over `rounded-md`).
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
