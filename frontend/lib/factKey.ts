export type FactKind = "counterargument" | "further_support";

export function factKey(kind: FactKind, index: number): string {
	return `${kind}:${index}`;
}
