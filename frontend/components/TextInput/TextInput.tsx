"use client";

import styles from "./TextInput.module.css";

type Props = {
	onSubmit: (text: string) => void;
	loading: boolean;
	value?: string;
	onChange?: (text: string) => void;
};

export default function TextInput({ onSubmit, loading, value, onChange }: Props) {
	return (
		<form
			className={styles.form}
			onSubmit={(e) => {
				e.preventDefault();
				const fd = new FormData(e.currentTarget);
				onSubmit(String(fd.get("text") ?? ""));
			}}
		>
			<label className={styles.label} htmlFor="argument-text">
				Paste text to map its argument structure
			</label>
			<textarea
				id="argument-text"
				name="text"
				placeholder="A paragraph, talk outline, or short essay…"
				rows={4}
				className={styles.area}
				value={value}
				defaultValue={value === undefined ? "" : undefined}
				onChange={onChange ? (e) => onChange(e.target.value) : undefined}
			/>
			<button type="submit" className={styles.submit} disabled={loading}>
				{loading ? "Analyzing…" : "Analyze"}
			</button>
		</form>
	);
}