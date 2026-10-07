import { Navigate, Route, Routes } from 'react-router-dom';
import FitStage from './components/FitStage';
import Dashboard from './pages/Dashboard';
import Player from './pages/Player';
import Quiz from './pages/Quiz';
import LabLauncher from './pages/LabLauncher';
import Setup from './pages/Setup';
import Guided from './pages/Guided';
import Results from './pages/Results';
import Admin from './pages/Admin';
import Verify from './pages/Verify';

export default function App() {
  return (
    <FitStage>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/learn" element={<Player />} />
        <Route path="/quiz" element={<Quiz />} />
        <Route path="/labs" element={<LabLauncher />} />
        <Route path="/setup" element={<Setup />} />
        <Route path="/guided" element={<Guided />} />
        <Route path="/results" element={<Results />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="/verify/:id" element={<Verify />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </FitStage>
  );
}
