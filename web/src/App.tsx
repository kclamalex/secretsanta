import type { ReactNode } from "react";
import { Link } from "./components/Link.tsx";
import { AmbientSnow } from "./effects/AmbientSnow.tsx";
import { AdminPage } from "./features/admin/AdminPage.tsx";
import { HomePage } from "./features/home/HomePage.tsx";
import { JoinPage } from "./features/join/JoinPage.tsx";
import { paths } from "./features/shared/paths.ts";
import { TestPage } from "./features/test/TestPage.tsx";
import { matchRoute, usePath, type Route } from "./lib/router.ts";

const routes: Route<ReactNode>[] = [
  [/^\/s\/([A-Za-z0-9]+)\/?$/, ([code]) => <JoinPage code={code.toUpperCase()} />],
  [/^\/admin\/([A-Za-z0-9]+)\/?$/, ([code]) => <AdminPage code={code.toUpperCase()} />],
  // Hidden; only works with TEST_MODE=1.
  [/^\/test(?:\/([A-Za-z0-9]+))?\/?$/, ([code]) => <TestPage code={code?.toUpperCase() ?? null} />],
];

export function App() {
  const path = usePath();
  return (
    <>
      <AmbientSnow />
      <main>
        <header className="site-header">
          <Link href={paths.home} className="brand">
            <span className="brand-seal" aria-hidden />
            Secret Santa
          </Link>
        </header>
        {matchRoute(path, routes, () => <HomePage />)}
      </main>
    </>
  );
}
