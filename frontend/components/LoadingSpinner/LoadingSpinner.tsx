import styles from "./LoadingSpinner.module.css";

type Props = { visible: boolean };

export default function LoadingSpinner({ visible }: Props) {
	if (!visible) return null;
	return (
		<div className={styles.overlay}>
			<div className={styles.pill}>
				<div className={styles.ring} />
				<span className={styles.text}>Reasoning...</span>
			</div>
		</div>
	);
}