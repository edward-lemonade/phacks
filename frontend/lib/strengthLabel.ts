export type StrengthLabel =
	| "true"
	| "strong"
	| "weak"
	| "fallacious"
	| "false";

const LABELS = new Set<string>([
	"true",
	"strong",
	"weak",
	"fallacious",
	"false",
]);

/** Map legacy numeric strength to a label when needed */
export function normalizeStrengthLabel(v: unknown): StrengthLabel {
	if (v === null || v === undefined) return "weak";
	if (typeof v === "number") {
		if (v >= 0.9) return "true";
		if (v >= 0.75) return "strong";
		if (v >= 0.45) return "weak";
		if (v >= 0.2) return "fallacious";
		return "false";
	}
	const s = String(v).toLowerCase().trim();
	if (LABELS.has(s)) return s as StrengthLabel;
	return "weak";
}

/** Visual weight for node opacity on canvas */
export function strengthLabelOpacity(label: StrengthLabel): number {
	switch (label) {
		case "true":
			return 1;
		case "strong":
			return 0.94;
		case "weak":
			return 0.78;
		case "fallacious":
			return 0.72;
		case "false":
			return 0.62;
		default:
			return 0.78;
	}
}

export const STRENGTH_DISPLAY: Record<
	StrengthLabel,
	{ title: string; hint: string }
> = {
	true: { title: "True", hint: "Treated as logically true (e.g. axioms)." },
	strong: {
		title: "Strong",
		hint: "Well supported; at most one counterclaim in the text.",
	},
	weak: {
		title: "Weak",
		hint: "More than one counterclaim or objection found.",
	},
	fallacious: {
		title: "Fallacious",
		hint: "Reasoning offered is flawed; not necessarily false.",
	},
	false: {
		title: "False",
		hint: "Logically or verifiably false in context.",
	},
};
