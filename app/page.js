import Game from "./Game";
import { LINKS } from "./links";

export default function Home() {
  return (
    <main className="home">
      <Game links={LINKS} />
      <h1 className="title">euno</h1>
      <nav className="links" aria-label="Links">
        {LINKS.map((l) => (
          <a key={l.href} href={l.href}>
            {l.label}
          </a>
        ))}
      </nav>
      <style>{`
        .home { position: fixed; inset: 0; overflow: hidden; }
        .title {
          position: absolute; top: 28px; left: 0; right: 0; margin: 0;
          text-align: center; font-size: 14px; font-weight: 400;
          letter-spacing: 0.5em; text-indent: 0.5em; color: var(--accent);
          pointer-events: none;
        }
        .links {
          position: absolute; bottom: 24px; left: 0; right: 0;
          display: flex; justify-content: center; gap: 28px; flex-wrap: wrap;
          padding: 0 16px; font-size: 13px;
        }
        .links a { text-decoration: none; opacity: 0.7; padding: 8px 4px; }
        .links a:hover, .links a:focus-visible { opacity: 1; text-decoration: underline; }
      `}</style>
    </main>
  );
}
