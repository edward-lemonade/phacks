"use client";

import dynamic from "next/dynamic";
import { useCallback, useId, useState } from "react";
import PageLayout from "@/components/PageLayout";
import Sidebar from "@/components/Sidebar";
import TextInput from "@/components/TextInput";
import { apiUrl } from "@/lib/api";
import type { GraphData } from "@/lib/types";
import pageStyles from "./page.module.css";

const GraphCanvas = dynamic(() => import("@/components/GraphCanvas"), {
	ssr: false,
	loading: () => (
		<div className={pageStyles.canvasLoading}>
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
		<PageLayout
			sidebar={
				<Sidebar
					id={sidebarId}
					open={sidebarOpen}
					onToggle={toggleSidebar}
					brand={BRAND}
					tagline="Paste text → explore claims & counterarguments"
					error={error}
				>
					<TextInput onSubmit={handleSubmit} loading={loading} />
				</Sidebar>
			}
		>
			{graphData ? (
				<GraphCanvas
					graphData={graphData}
					originalText={originalText}
				/>
			) : (
				<div className={pageStyles.canvasEmpty} />
			)}
		</PageLayout>
	);
}
