import type { ReactElement } from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "./context/ThemeContext";
import { SorobanProvider } from "./context/SorobanContext";
import { WalletProvider } from "./context/WalletContext";
import { Layout } from "./components/layout/Layout";
import { Home } from "./pages/Home";
import { FunderDashboard } from "./pages/FunderDashboard";
import { ProgrammeDetail } from "./pages/ProgrammeDetail";
import { RecipientDashboard } from "./pages/RecipientDashboard";
import { VerifierDashboard } from "./pages/VerifierDashboard";
import { FinalizeAwards } from "./pages/FinalizeAwards";
import { ProgrammeDirectory } from "./pages/ProgrammeDirectory";
import { SpendPolicy } from "./pages/SpendPolicy";
import { RegistryAdmin } from "./pages/RegistryAdmin";
import { Standing } from "./pages/Standing";
import { AwardProgress } from "./pages/AwardProgress";
import { ApplicationTimeline } from "./pages/ApplicationTimeline";
import { AdminDashboard } from "./pages/AdminDashboard";
import { AttestationLookup } from "./pages/AttestationLookup";
import { RegisterSchema } from "./pages/RegisterSchema";
import { NotFound } from "./pages/NotFound";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { APP_ROUTES } from "./routes";

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

function App() {
  return (
    <ThemeProvider>
      <WalletProvider>
        <SorobanProvider>
          <ErrorBoundary>
            <Router>
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
            </Router>
          </ErrorBoundary>
        </SorobanProvider>
      </WalletProvider>
    </ThemeProvider>
  );
}

export default App;
