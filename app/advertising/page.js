import FloatingNav from '../components/FloatingNav';

export default function AdvertisingPage() {
  return (
    <main style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--bg-color)', color: 'var(--text-primary)' }}>
      <FloatingNav />
      <h1>Advertising</h1>
      <p style={{ marginTop: '20px', color: 'var(--text-secondary)' }}>
        This page is currently under construction. Please check back later.
      </p>
    </main>
  );
}
