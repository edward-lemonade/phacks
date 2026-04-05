"use client";

import { useCallback, useRef } from "react";
import type { GraphData } from "@/lib/types";
import styles from "./GraphToolbar.module.css";

type SavedGraph = {
	graphData: GraphData;
	originalText: string;
};

type Props = {
	graphData: GraphData | null;
	originalText: string;
	onLoad: (saved: SavedGraph) => void;
};

export default function GraphToolbar({ graphData, originalText, onLoad }: Props) {
	const inputRef = useRef<HTMLInputElement>(null);

	const handleDownload = useCallback(() => {
		if (!graphData) return;
		const payload: SavedGraph = { graphData, originalText };
		const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = "argument-map.json";
		a.click();
		URL.revokeObjectURL(url);
	}, [graphData, originalText]);

	const handleUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		if (!file) return;
		const reader = new FileReader();
		reader.onload = (ev) => {
			try {
				const parsed = JSON.parse(ev.target?.result as string) as SavedGraph;
				if (!parsed.graphData?.nodes || !parsed.graphData?.edges) throw new Error("Invalid format");
				onLoad(parsed);
			} catch {
				alert("Could not load graph — invalid file.");
			}
		};
		reader.readAsText(file);
		// reset so the same file can be re-uploaded
		e.target.value = "";
	}, [onLoad]);

	return (
		<div className={styles.toolbar}>
			<button
				type="button"
				className={styles.btn}
				onClick={handleDownload}
				disabled={!graphData}
				title="Download graph as JSON"
				aria-label="Download graph"
			>
				<DownloadIcon />
			</button>
			<button
				type="button"
				className={styles.btn}
				onClick={() => inputRef.current?.click()}
				title="Upload saved graph"
				aria-label="Upload graph"
			>
				<UploadIcon />
			</button>
			<input
				ref={inputRef}
				type="file"
				accept=".json,application/json"
				className={styles.hiddenInput}
				onChange={handleUpload}
			/>
		</div>
	);
}

function DownloadIcon() {
	return (
		<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
			<path d="M8 1v9M5 7l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
			<path d="M2 12h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
			<path d="M2 14h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity=".35" />
		</svg>
	);
}

function UploadIcon() {
	return (
		<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
			<path d="M8 10V1M5 4l3-3 3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
			<path d="M2 12h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
			<path d="M2 14h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity=".35" />
		</svg>
	);
}