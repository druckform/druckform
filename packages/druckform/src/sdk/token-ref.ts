import { z } from "zod";

// Non-enumerable marker carried on a zod string schema produced by tokenRef().
// Read back by the TS component loader to derive requiredTokens. Property-based
// (not module-identity-based) so it survives esbuild bundling + the src/dist split.
const TOKEN_MARK = "__druckToken";

/**
 * A string parameter that also declares the style token it resolves, e.g.
 *   schema = z.object({ accent: tokenRef("accent") })
 * Validates as a string at runtime; the loader derives `requiredTokens` from it,
 * so a TS component no longer needs to hand-maintain `meta.requiredTokens`.
 */
export function tokenRef(name: string): z.ZodString {
  const schema = z.string();
  Object.defineProperty(schema, TOKEN_MARK, { value: name, enumerable: false });
  return schema;
}

/** Returns the token name a tokenRef() schema carries, or undefined. */
export function tokenRefName(schema: unknown): string | undefined {
  return (schema as Record<string, unknown> | null)?.[TOKEN_MARK] as string | undefined;
}
