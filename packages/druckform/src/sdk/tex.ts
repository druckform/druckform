const SPECIAL_RE = /[&%_#${}~^\\]/g;

const ESCAPE_MAP: Record<string, string> = {
  "&": "\\&",
  "%": "\\%",
  _: "\\_",
  "#": "\\#",
  $: "\\$",
  "{": "\\{",
  "}": "\\}",
  "~": "\\textasciitilde{}",
  "^": "\\textasciicircum{}",
  "\\": "\\textbackslash{}",
};

export function escapeTeX(text: string): string {
  return text.replace(SPECIAL_RE, (ch) => ESCAPE_MAP[ch] ?? ch);
}

/** Raw LaTeX — inserted without escaping. Use only for trusted values (tokens, rendered children). */
export class RawTeX {
  constructor(public readonly value: string) {}
}

export const raw = (value: string) => new RawTeX(value);

/**
 * Tagged template literal that auto-escapes string interpolations.
 * Wrap a value in raw() to skip escaping (for tokens and rendered children).
 *
 * @example
 * Tex`\textbf{${userTitle}}`          // userTitle is escaped
 * Tex`\color{${raw(tokenMacro)}}{}`   // tokenMacro inserted as-is
 */
export function Tex(strings: TemplateStringsArray, ...values: Array<string | RawTeX>): string {
  let out = "";
  for (let i = 0; i < strings.length; i++) {
    out += strings.raw[i];
    if (i < values.length) {
      const v = values[i];
      out += v instanceof RawTeX ? v.value : escapeTeX(String(v));
    }
  }
  return out;
}

// Every run of characters outside this class collapses to a single hyphen.
const LABEL_UNSAFE_RUN_RE = /[^A-Za-z0-9:-]+/g;

/**
 * Sanitises a user-supplied identifier for use inside a LaTeX `\label{}`/`\ref{}`
 * argument (figure/ref ids), so the defining side (raw id) and the referencing
 * side (already `escapeTeX`-ed id) produce byte-identical labels.
 *
 * `escapeTeX` turns each unsafe character into an unsafe *sequence* built only
 * from other unsafe characters (e.g. `_` → `\_`, both outside [A-Za-z0-9:-]).
 * Collapsing every contiguous run of unsafe characters to one hyphen therefore
 * gives the same result whether it runs over the raw id or its escaped form —
 * that is what keeps `figure`'s `\label{fig:...}` and `ref`'s `\ref{fig:...}`
 * arguments in agreement for ids containing underscores, spaces, or other
 * TeX-special punctuation. See figure.ts and ref.ts, the two call sites.
 */
export function sanitizeLabelId(id: string): string {
  return id.replace(LABEL_UNSAFE_RUN_RE, "-");
}
