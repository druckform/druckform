/**
 * Parse the text INSIDE a generic-directives `{ … }` attribute block (no braces)
 * into a flat map. Matches the micromark/remark-directive model:
 *   #foo        -> id=foo (last id wins)
 *   .a .b       -> class="a b" (classes combine)
 *   key=val / key="v" / key='v' / bare key (=> "true")
 * Whitespace-separated. Empty input -> {}.
 */
export function parseDirectiveAttributes(attrStr: string): Record<string, string> {
  const out: Record<string, string> = {};
  const classes: string[] = [];
  // token: #id | .class | key="v" | key='v' | key=val | bareKey
  const re = /([#.])([\w-]+)|([\w-]+)(?:=(?:"([^"]*)"|'([^']*)'|([^\s]+)))?/g;
  for (let m = re.exec(attrStr); m !== null; m = re.exec(attrStr)) {
    if (m[1] === "#") {
      out.id = m[2] ?? "";
    } else if (m[1] === ".") {
      if (m[2]) classes.push(m[2]);
    } else if (m[3]) {
      const val = m[4] ?? m[5] ?? m[6];
      out[m[3]] = val ?? "true";
    }
  }
  if (classes.length > 0) out.class = classes.join(" ");
  return out;
}
