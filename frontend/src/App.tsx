import type { ComponentType, ReactElement } from "react";
import { Suspense } from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "./context/ThemeContext";
import { WalletProvider } from "./context/WalletContext";
import { Layout } from "./components/layout/Layout";
import { Skeleton } from "./components/state/AsyncStates";
import { Home } from "./pages/Home";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { APP_ROUTES } from "./routes";
import { lazyWithRetry } from "./lib/lazyWithRetry";

/**
 * An app route that reads the chain: its page and the contract clients are
 * separate chunks, fetched together when the route is first opened. The clients
 * (and the Stellar SDK behind them) are not mounted at the root, so the landing
 * page, which only reads the index's JSON, loads none of it. Navigating from
 * `/` to an app route costs one parallel fetch, not two in a row.
 */
function inSoroban(load: () => Promise<{ default: ComponentType }>) {
  return lazyWithRetry(async () => {
    const [{ SorobanProvider }, { default: Page }] = await Promise.all([import("./context/SorobanContext"), load()]);
    const InSoroban = () => (
      <SorobanProvider>
        <Page />
      </SorobanProvider>
    );
    return { default: InSoroban };
  });
}

// Route chunks load on navigation, not up front. The shell (providers,
// layout) and the landing page (`Home`, the most-visited route and the one
// that needs the least code) stay in the initial chunk; every app route
// splits into its own chunk behind `React.lazy`. Baseline (all eager):
// 869,340 uncompressed JS bytes; budget allows +5%.
//
// `lazyWithRetry` rather than `React.lazy` directly: after a deploy, an open
// tab's route chunks 404 against the old build's file hashes. This recovers
// with one automatic reload instead of leaving the raw import error to hit
// `ErrorBoundary` as an ordinary crash.
const ProgrammeDirectory = inSoroban(() =>
  import("./pages/ProgrammeDirectory").then((m) => ({ default: m.ProgrammeDirectory })),
);
const ProgrammeDetail = inSoroban(() =>
  import("./pages/ProgrammeDetail").then((m) => ({ default: m.ProgrammeDetail })),
);
const FunderDashboard = inSoroban(() =>
  import("./pages/FunderDashboard").then((m) => ({ default: m.FunderDashboard })),
);
const ReceiptLookup = inSoroban(() =>
  import("./pages/ReceiptLookup").then((m) => ({ default: m.ReceiptLookup })),
);
const ProposeProgramme = inSoroban(() =>
  import("./pages/ProposeProgramme").then((m) => ({ default: m.ProposeProgramme })),
);
const RecipientDashboard = inSoroban(() =>
  import("./pages/RecipientDashboard").then((m) => ({ default: m.RecipientDashboard })),
);
const Standing = inSoroban(() => import("./pages/Standing").then((m) => ({ default: m.Standing })));
const AwardProgress = inSoroban(() =>
  import("./pages/AwardProgress").then((m) => ({ default: m.AwardProgress })),
);
const ApplicationTimeline = inSoroban(() =>
  import("./pages/ApplicationTimeline").then((m) => ({ default: m.ApplicationTimeline })),
);
const AwardDetail = inSoroban(() =>
  import("./pages/AwardDetail").then((m) => ({ default: m.AwardDetail })),
);
const VerifierDashboard = inSoroban(() =>
  import("./pages/VerifierDashboard").then((m) => ({ default: m.VerifierDashboard })),
);
const FinalizeAwards = inSoroban(() =>
  import("./pages/FinalizeAwards").then((m) => ({ default: m.FinalizeAwards })),
);
const SpendPolicy = inSoroban(() =>
  import("./pages/SpendPolicy").then((m) => ({ default: m.SpendPolicy })),
);
const RegistryAdmin = inSoroban(() =>
  import("./pages/RegistryAdmin").then((m) => ({ default: m.RegistryAdmin })),
);
const AdminStanding = inSoroban(() =>
  import("./pages/AdminStanding").then((m) => ({ default: m.AdminStanding })),
);
const AttestationLookup = inSoroban(() =>
  import("./pages/AttestationLookup").then((m) => ({ default: m.AttestationLookup })),
);
const RegisterSchema = inSoroban(() =>
  import("./pages/RegisterSchema").then((m) => ({ default: m.RegisterSchema })),
);
const Keepalive = inSoroban(() =>
  import("./pages/Keepalive").then((m) => ({ default: m.Keepalive })),
);
const PayeeManagement = inSoroban(() =>
  import("./pages/PayeeManagement").then((m) => ({ default: m.PayeeManagement })),
);
const IndexStatus = inSoroban(() =>
  import("./pages/IndexStatus").then((m) => ({ default: m.IndexStatus })),
);
const AboutDeployment = inSoroban(() =>
  import("./pages/AboutDeployment").then((m) => ({ default: m.AboutDeployment })),
);
// Development builds only. Vite replaces `import.meta.env.DEV` with `false` in a
// production build, so this import and its chunk are dropped entirely.
const ComponentGallery = import.meta.env.DEV
  ? inSoroban(() =>
      import("./pages/dev/ComponentGallery").then((m) => ({ default: m.ComponentGallery })),
    )
  : null;
const NotFound = lazyWithRetry(() => import("./pages/NotFound").then((m) => ({ default: m.NotFound })));

// Keyed by the same paths as APP_ROUTES, so the header Menu (built from that
// list) can never point at a path this router does not also serve.
const ROUTE_ELEMENTS: Record<string, ReactElement> = {
  "/directory": <ProgrammeDirectory />,
  "/programme": <ProgrammeDetail />,
  "/funders": <FunderDashboard />,
  "/funders/receipt": <ReceiptLookup />,
  "/funders/propose": <ProposeProgramme />,
  "/recipients": <RecipientDashboard />,
  "/recipients/standing": <Standing />,
  "/recipients/award-progress": <AwardProgress />,
  "/recipients/application-timeline": <ApplicationTimeline />,
  "/award": <AwardDetail />,
  "/verifiers": <VerifierDashboard />,
  "/finalize": <FinalizeAwards />,
  "/policy": <SpendPolicy />,
  "/admin": <RegistryAdmin />,
  "/admin/standing": <AdminStanding />,
  "/attestations": <AttestationLookup />,
  "/schemas/register": <RegisterSchema />,
  "/keepalive": <Keepalive />,
  "/admin/payees": <PayeeManagement />,
  "/status": <IndexStatus />,
  "/about": <AboutDeployment />,
};

/**
 * What a route chunk shows while it loads: the same card-shaped skeleton
 * the screens use for reads, not a bare spinner — so navigating feels like
 * the content resolving rather than the app restarting.
 */
function RouteFallback() {
  return (
    <div aria-busy="true">
      <Skeleton variant="card" label="Loading this section" />
    </div>
  );
}

function App() {
  return (
    <ThemeProvider>
      <WalletProvider>
        <ErrorBoundary>
          <Router>
            <Suspense fallback={<RouteFallback />}>
              <Routes>
                <Route path="/" element={<Layout />}>
                  <Route index element={<Home />} />
                  {APP_ROUTES.map(({ path }) => (
                    <Route
                      key={path}
                      path={path.slice(1)}
                      element={ROUTE_ELEMENTS[path]}
                    />
                  ))}
                  <Route
                    path="programme/:programmeId"
                    element={<ProgrammeDetail />}
                  />
                  <Route
                    path="award/:programmeId/:recipient"
                    element={<AwardDetail />}
                  />
                  {ComponentGallery && <Route path="dev/ui" element={<ComponentGallery />} />}
                  <Route path="*" element={<NotFound />} />
                </Route>
              </Routes>
            </Suspense>
          </Router>
        </ErrorBoundary>
      </WalletProvider>
    </ThemeProvider>
  );
}

export default App;
