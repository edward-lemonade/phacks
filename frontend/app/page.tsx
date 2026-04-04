"use client";

import dynamic from "next/dynamic";
import { useCallback, useId, useState } from "react";
import TextInput from "@/components/TextInput";
import { apiUrl } from "@/lib/api";
import type { GraphData } from "@/lib/types";

const GraphCanvas = dynamic(() => import("@/components/GraphCanvas"), {
	ssr: false,
	loading: () => (
		<div className="canvas-loading">
			<span>Loading graph…</span>
		</div>
	),
});

const BRAND = "haxiom";

export default function HomePage() {
	const sidebarId = useId();
	const [sidebarOpen, setSidebarOpen] = useState(true);
	const [graphData, setGraphData] = useState<GraphData | null>(null);
	const [originalText, setOriginalText] = useState("");
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const handleSubmit = async (text: string) => {
		setLoading(true);
		setError(null);
		setOriginalText(text);
		try {
			const res = await fetch(apiUrl("/api/analyze"), {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ text }),
			});
			if (!res.ok) {
				const body = (await res.json().catch(() => ({}))) as {
					detail?: unknown;
				};
				const d = body.detail;
				const msg =
					typeof d === "string"
						? d
						: Array.isArray(d)
							? "Invalid request"
							: "Backend error";
				throw new Error(msg);
			}
			const data = (await res.json()) as GraphData;
			setGraphData(data);
		} catch (e) {
			setError(
				e instanceof Error
					? e.message
					: "Failed to analyze. Is the backend running?"
			);
		} finally {
			setLoading(false);
		}
	};

	const toggleSidebar = useCallback(() => {
		setSidebarOpen((o) => !o);
	}, []);

	return (
		<div className="app-shell">
			<aside
				id={sidebarId}
				className={`sidebar${sidebarOpen ? "" : " sidebar--collapsed"}`}
				aria-label="Input panel"
			>
				<button
					type="button"
					className="sidebar-toggle"
					onClick={toggleSidebar}
					aria-expanded={sidebarOpen}
					aria-controls={sidebarId}
					title={sidebarOpen ? "Collapse panel" : "Expand panel"}
				>
					<span className="sidebar-toggle-icon" aria-hidden>
						{sidebarOpen ? "‹" : "›"}
					</span>
				</button>

				<div className="sidebar-inner">
					<h1 className="sidebar-brand" aria-label={BRAND}>
						{BRAND.split("").map((ch, i) => (
							<span key={i} className="sidebar-brand-char">
								{ch}
							</span>
						))}
					</h1>

					<div className="sidebar-expanded-block">
						<p className="sidebar-tagline">
							Paste text → explore claims & counterarguments
						</p>
						<TextInput onSubmit={handleSubmit} loading={loading} />
						{error && <p className="sidebar-error">{error}</p>}
					</div>
				</div>
			</aside>

			<main className="canvas-full" aria-label="Argument map canvas">
				{graphData ? (
					<GraphCanvas
						graphData={graphData}
						originalText={originalText}
					/>
				) : (
					<div className="canvas-empty" />
				)}
			</main>
		</div>
	);
}
