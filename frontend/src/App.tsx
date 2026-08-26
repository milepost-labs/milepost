import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { ThemeProvider } from './context/ThemeContext';
import { SorobanProvider } from './context/SorobanContext';
import { WalletProvider } from './context/WalletContext';
import { Layout } from './components/layout/Layout';
import { TransactionAnnouncer } from './components/state/TransactionAnnouncer';
import { Home } from './pages/Home';
import { FunderDashboard } from './pages/FunderDashboard';
import { CreateProgramme } from './pages/CreateProgramme';
import { PayeeManager } from './pages/PayeeManager';
import { RecipientDashboard } from './pages/RecipientDashboard';
import { VerifierDashboard } from './pages/VerifierDashboard';

function App() {
  return (
    <ThemeProvider>
      <WalletProvider>
        <SorobanProvider>
        <Router>
          <TransactionAnnouncer />
          <Routes>
            <Route path="/" element={<Layout />}>
              <Route index element={<Home />} />
              <Route path="funders" element={<FunderDashboard />} />
              <Route path="funders/create" element={<CreateProgramme />} />
              <Route path="funders/payees" element={<PayeeManager />} />
              <Route path="recipients" element={<RecipientDashboard />} />
              <Route path="verifiers" element={<VerifierDashboard />} />
            </Route>
          </Routes>
        </Router>
      </SorobanProvider>
      </WalletProvider>
    </ThemeProvider>
  );
}

export default App;
