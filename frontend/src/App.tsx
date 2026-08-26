import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { ThemeProvider } from './context/ThemeContext';
import { SorobanProvider } from './context/SorobanContext';
import { WalletProvider } from './context/WalletContext';
import { Layout } from './components/layout/Layout';
import { Home } from './pages/Home';
import { FunderDashboard } from './pages/FunderDashboard';
import { ProgrammeDetail } from './pages/ProgrammeDetail';
import { RecipientDashboard } from './pages/RecipientDashboard';
import { VerifierDashboard } from './pages/VerifierDashboard';
import { FinalizeAwards } from './pages/FinalizeAwards';

function App() {
  return (
    <ThemeProvider>
      <WalletProvider>
        <SorobanProvider>
        <Router>
          <Routes>
            <Route path="/" element={<Layout />}>
              <Route index element={<Home />} />
              <Route path="funders" element={<FunderDashboard />} />
              <Route path="programme" element={<ProgrammeDetail />} />
              <Route path="programme/:programmeId" element={<ProgrammeDetail />} />
              <Route path="recipients" element={<RecipientDashboard />} />
              <Route path="verifiers" element={<VerifierDashboard />} />
              <Route path="finalize" element={<FinalizeAwards />} />
            </Route>
          </Routes>
        </Router>
      </SorobanProvider>
      </WalletProvider>
    </ThemeProvider>
  );
}

export default App;
