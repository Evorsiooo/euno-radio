'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import styles from './FloatingNav.module.css';

export default function FloatingNav() {
  const [isAdmin, setIsAdmin] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    const token = localStorage.getItem('adminToken');
    if (token) {
      // Validate token silently
      fetch('/api/config', {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      .then(res => {
        if (res.ok) {
          setIsAdmin(true);
        } else {
          localStorage.removeItem('adminToken');
        }
      })
      .catch(() => {});
    }
  }, []);

  return (
    <nav className={styles.navContainer}>
      <Link href="/#radio" className={styles.navLink}>
        Radio
      </Link>
      <Link href="/#links" className={styles.navLink}>
        Links
      </Link>
      <Link href="/advertising" className={styles.navLink}>
        Advertising
      </Link>
      {isAdmin && pathname !== '/panel' && (
        <Link href="/panel" className={`${styles.navLink} ${styles.panelBtn}`}>
          Panel
        </Link>
      )}
    </nav>
  );
}
