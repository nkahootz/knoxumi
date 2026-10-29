import Image from "next/image";
import styles from "./page.module.css";

export default function HomePage() {
  return (
    <main className={styles.main}>
      <Image
        className={styles.logo}
        src="/images/knoxumi-welcome.png"
        alt="Knoxumi cat mascot waving hello"
        width={367}
        height={500}
        priority
      />
      <h1 className={styles.title}>
        <span className={styles.brand}>Knoxumi Waiver</span> is coming soon!
      </h1>
      <p className={styles.tagline}>
        Simple, secure digital waivers for your business. We&apos;re putting on the finishing touches.
      </p>
    </main>
  );
}
