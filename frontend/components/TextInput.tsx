"use client";

type Props = {
	onSubmit: (text: string) => void;
	loading: boolean;
};

export default function TextInput({ onSubmit, loading }: Props) {
	return (
		<form
			className="text-form"
			onSubmit={(e) => {
				e.preventDefault();
				const fd = new FormData(e.currentTarget);
				onSubmit(String(fd.get("text") ?? ""));
			}}
		>
			<label className="text-label" htmlFor="argument-text">
				Paste text to map its argument structure
			</label>
			<textarea
				id="argument-text"
				name="text"
				placeholder="A paragraph, talk outline, or short essay…"
				rows={4}
				className="text-area"
			/>
			<button type="submit" className="text-submit" disabled={loading}>
				{loading ? "Analyzing…" : "Analyze"}
			</button>
		</form>
	);
}
