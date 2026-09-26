import type { ReactElement } from "react";
import { Suspense, lazy } from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "./context/ThemeContext";
import { SorobanProvider } from "./context/SorobanContext";
import { WalletProvider } from "./context/WalletContext";
import { Layout } from "./components/layout/Layout";
import { Skeleton } from "./components/state/AsyncStates";
import { Home } from "./pages/Home";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { APP_ROUTES } from "./routes";

// Route chunks load on navigation, not up front. The shell (providers,
// layout) and the landing page (`Home`, the most-visited route and the one
// that needs the least code) stay in the initial chunk; every app route
// splits into its own chunk behind `React.lazy`. Baseline (all eager):
// 869,340 uncompressed JS bytes; budget allows +5%.
const ProgrammeDirectory = lazy(() =>
  import("./pages/ProgrammeDirectory").then((m) => ({ default: m.ProgrammeDirectory })),
);
const ProgrammeDetail = lazy(() =>
  import("./pages/ProgrammeDetail").then((m) => ({ default: m.ProgrammeDetail })),
);
const FunderDashboard = lazy(() =>
  import("./pages/FunderDashboard").then((m) => ({ default: m.FunderDashboard })),
);
const RecipientDashboard = lazy(() =>
  import("./pages/RecipientDashboard").then((m) => ({ default: m.RecipientDashboard })),
);
const Standing = lazy(() => import("./pages/Standing").then((m) => ({ default: m.Standing })));
const AwardProgress = lazy(() =>
  import("./pages/AwardProgress").then((m) => ({ default: m.AwardProgress })),
);
const ApplicationTimeline = lazy(() =>
  import("./pages/ApplicationTimeline").then((m) => ({ default: m.ApplicationTimeline })),
);
const VerifierDashboard = lazy(() =>
  import("./pages/VerifierDashboard").then((m) => ({ default: m.VerifierDashboard })),
);
const FinalizeAwards = lazy(() =>
  import("./pages/FinalizeAwards").then((m) => ({ default: m.FinalizeAwards })),
);
const SpendPolicy = lazy(() =>
  import("./pages/SpendPolicy").then((m) => ({ default: m.SpendPolicy })),
);
const RegistryAdmin = lazy(() =>
  import("./pages/RegistryAdmin").then((m) => ({ default: m.RegistryAdmin })),
);
const AdminDashboard = lazy(() =>
  import("./pages/AdminDashboard").then((m) => ({ default: m.AdminDashboard })),
);
const AttestationLookup = lazy(() =>
  import("./pages/AttestationLookup").then((m) => ({ default: m.AttestationLookup })),
);
const RegisterSchema = lazy(() =>
  import("./pages/RegisterSchema").then((m) => ({ default: m.RegisterSchema })),
);
const NotFound = lazy(() => import("./pages/NotFound").then((m) => ({ default: m.NotFound })));

// Keyed by the same paths as APP_ROUTES, so the header Menu (built from that
// list) can never point at a path this router does not also serve.
const ROUTE_ELEMENTS: Record<string, ReactElement> = {
  "/directory": <ProgrammeDirectory />,
  "/programme": <ProgrammeDetail />,
  "/funders": <FunderDashboard />,
  "/recipients": <RecipientDashboard />,
  "/recipients/standing": <Standing />,
  "/recipients/award-progress": <AwardProgress />,
  "/recipients/application-timeline": <ApplicationTimeline />,
  "/verifiers": <VerifierDashboard />,
  "/finalize": <FinalizeAwards />,
  "/policy": <SpendPolicy />,
  "/admin": <RegistryAdmin />,
  "/admin/standing": <AdminDashboard />,
  "/attestations": <AttestationLookup />,
  "/schemas/register": <RegisterSchema />,
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
        <SorobanProvider>
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
                    <Route path="*" element={<NotFound />} />
                  </Route>
                </Routes>
              </Suspense>
            </Router>
          </ErrorBoundary>
        </SorobanProvider>
      </WalletProvider>
    </ThemeProvider>
  );
}

export default App;
