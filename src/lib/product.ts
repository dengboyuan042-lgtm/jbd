/**
 * Product identity lives here and nowhere else. Renaming the product is a
 * one-file change; no feature module references the name directly.
 */
export const product = {
  name: process.env.NEXT_PUBLIC_APP_NAME || 'AskSia Pro',
  shortName: 'Workspace',
  tagline: 'Your material, understood.',
  description:
    'An AI workspace for documents, recordings, notes and research — with citations you can trust.',
} as const;
