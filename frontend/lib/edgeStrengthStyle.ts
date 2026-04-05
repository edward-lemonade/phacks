import { normalizeStrengthLabel } from "@/lib/strengthLabel";

/** Visual weight for the arrow from child → parent (tied to the child’s strength). */
export function edgeStrokeFromChildStrength(s: unknown): {
	strokeOpacity: number;
	strokeWidth: number;
} {
	const label = normalizeStrengthLabel(s);
	switch (label) {
		case "true":
			return { strokeOpacity: 1, strokeWidth: 2.85 };
		case "strong":
			return { strokeOpacity: 0.95, strokeWidth: 2.25 };
		case "weak":
			return { strokeOpacity: 0.28, strokeWidth: 0.95 };
		case "fallacious":
			return { strokeOpacity: 0.38, strokeWidth: 1.05 };
		case "false":
			return { strokeOpacity: 0.26, strokeWidth: 0.9 };
		default:
			return { strokeOpacity: 0.55, strokeWidth: 1.35 };
	}
}

/** Marker size scales slightly with strength so thick edges match arrowheads. */
export function markerSizeFromChildStrength(s: unknown): {
	width: number;
	height: number;
} {
	const label = normalizeStrengthLabel(s);
	switch (label) {
		case "true":
			return { width: 18, height: 18 };
		case "strong":
			return { width: 17, height: 17 };
		case "weak":
			return { width: 12, height: 12 };
		case "fallacious":
			return { width: 13, height: 13 };
		case "false":
			return { width: 12, height: 12 };
		default:
			return { width: 15, height: 15 };
	}
}

export function hexToRgba(hex: string, alpha: number): string {
	const h = hex.replace("#", "").slice(0, 6);
	if (h.length !== 6) return `rgba(74, 74, 85, ${alpha})`;
	const r = parseInt(h.slice(0, 2), 16);
	const g = parseInt(h.slice(2, 4), 16);
	const b = parseInt(h.slice(4, 6), 16);
	return `rgba(${r},${g},${b},${alpha})`;
}
