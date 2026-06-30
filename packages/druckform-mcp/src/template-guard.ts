// Authoring tools may only address templates by a bare name inside
// DRUCKFORM_TEMPLATES_DIR — never a path. Reject separators and traversal.
export function assertSafeTemplateName(name: string): void {
  if (!name || /[\\/]/u.test(name) || name.includes("..") || name.startsWith(".")) {
    throw new Error(`Invalid template name: '${name}'`);
  }
}
