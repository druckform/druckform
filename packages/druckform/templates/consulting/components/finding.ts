import { type Component, type RenderCtx, Tex, raw, sanitizeLabelId } from "@druckform/core";
import { z } from "zod";

export const schema = z.object({
  severity: z.enum(["critical", "high", "medium", "low"]),
  /** Author-assigned identity, e.g. "F-01". Deliberately not a LaTeX counter:
   *  consulting ids are quoted in tickets and must not renumber when a finding
   *  is inserted. Referenced as :ref[F-01]{kind=finding}. */
  id: z.string(),
  title: z.string(),
});

export const meta = {
  name: "finding",
  description: "An audit finding: severity, id, title, and nested impact/evidence/recommendation.",
  acceptsChildren: true,
  example:
    ':::finding{severity="high" id="F-01" title="Secrets recoverable from CI logs"}\n' +
    ":::impact\nCredentials are recoverable by anyone with read access.\n:::\n:::",
  // Declared explicitly: the token name is resolved from a map at render time,
  // so doctor's literal-string scan of ctx.token calls cannot derive them.
  requiredTokens: ["severityCritical", "severityHigh", "severityMedium", "severityLow"],
};

// A finding has no LaTeX counter (ids are author-assigned strings, not
// \refstepcounter'd), so plain \label leaves \@currentlabel unset and
// :ref[...]{kind=finding} would silently print nothing (not even "??",
// since the label itself does exist). A finding's id IS its display name
// (unlike figure, where the author never types the number \ref supplies),
// so \druckcurrentfindinglabel sets the current label to the finding's own
// (already-escaped) id immediately before \label is called, and \ref prints
// that id back. Page numbers remain available via the ordinary \pageref.
// The assignment is \def inside a \begingroup rather than \gdef: \label
// expands \@currentlabel at the point of call, so the group is enough, and a
// global assignment would outlive the finding and be inherited by any later
// \label that is not preceded by a counter-stepping command.
export const preamble = `\\makeatletter
\\newcommand{\\druckcurrentfindinglabel}[1]{\\def\\@currentlabel{#1}}
\\makeatother`;

const SEVERITY_TOKEN = {
  critical: "severityCritical",
  high: "severityHigh",
  medium: "severityMedium",
  low: "severityLow",
} as const;

const SEVERITY_LABEL = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
} as const;

export const render: Component<typeof schema> = (params, children, ctx: RenderCtx) => {
  const colour = ctx.token(SEVERITY_TOKEN[params.severity]);
  const severity = SEVERITY_LABEL[params.severity];
  // Sanitised through the same helper ref uses, so :ref[...]{kind=finding}
  // resolves to a byte-identical label argument. See sdk/tex.ts.
  const label = sanitizeLabelId(params.id);
  // params.id and params.title are user input and go through Tex's
  // auto-escaping; colour, severity and label are trusted/already-sanitised
  // and are wrapped in raw() to skip it. children arrives already rendered
  // (see ref.ts's comment on the same convention). params.id is interpolated
  // a second time (still auto-escaped by Tex) as the argument that becomes
  // \@currentlabel, so \ref{finding:...} prints the escaped id, not \thepage.
  return Tex`\par\vspace{0.8em}
{${raw(colour)}\rule{\linewidth}{1.2pt}}\par
\noindent{${raw(colour)}\bfseries ${params.id}\quad ${raw(severity)}}\quad{\bfseries ${params.title}}\par
\begingroup\druckcurrentfindinglabel{${params.id}}\label{finding:${raw(label)}}\endgroup
\addcontentsline{fnd}{finding}{\protect\findingentry{${params.id}}{${raw(severity)}}{${params.title}}}
\smallskip
${raw(children)}
\par\vspace{0.8em}`;
};
