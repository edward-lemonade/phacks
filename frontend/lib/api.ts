const API_BASE = (
	process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"
).replace(/\/$/, "");

export function apiUrl(path: string): string {
    console.log("Fetching: ", `${API_BASE}${path.startsWith("/") ? path : `/${path}`}`)
	return `${API_BASE}${path.startsWith("/") ? path : `/${path}`}`;
}
