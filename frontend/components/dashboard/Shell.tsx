"use client";

import Link from "next/link";
import Nav from "@/components/Nav";
import styles from "@/app/dashboard/dashboard.module.css";

export function Shell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <Nav />
      <main className={styles.page}>
        <div className={styles.header}>
          <div>
            <h1 className={styles.title}>{title}</h1>
            {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
          </div>
          <Link href="/" className={styles.backHome}>← back to site</Link>
        </div>
        <div className={styles.shellMain}>{children}</div>
      </main>
    </>
  );
}
