import type { ReactNode } from "react";
import styles from "./PageLayout.module.css";

type Props = {
	sidebar: ReactNode;
	children: ReactNode;
};

export default function PageLayout({ sidebar, children }: Props) {
	return (
		<div className={styles.shell}>
			{sidebar}
			<main className={styles.canvas} aria-label="Argument map canvas">
				{children}
			</main>
		</div>
	);
}
