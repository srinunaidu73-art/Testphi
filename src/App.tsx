import React from 'react';
import { Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import LandingPage from './pages/LandingPage';
import DashboardPage from './pages/DashboardPage';
import RequirementsPage from './pages/RequirementsPage';
import PlannerPage from './pages/PlannerPage';
import TestCasesPage from './pages/TestCasesPage';
import TestCaseDetailPage from './pages/TestCaseDetailPage';
import ValidationPage from './pages/ValidationPage';
import SuitesPage from './pages/SuitesPage';
import ExecutionPage from './pages/ExecutionPage';
import FlakyPage from './pages/FlakyPage';
import CICDPage from './pages/CICDPage';
import ReportsPage from './pages/ReportsPage';
import DefectsPage from './pages/DefectsPage';
import SettingsPage from './pages/SettingsPage';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/project/:projectId" element={<Layout><DashboardPage /></Layout>} />
      <Route path="/project/:projectId/requirements" element={<Layout><RequirementsPage /></Layout>} />
      <Route path="/project/:projectId/planner" element={<Layout><PlannerPage /></Layout>} />
      <Route path="/project/:projectId/test-cases" element={<Layout><TestCasesPage /></Layout>} />
      <Route path="/project/:projectId/test-cases/:caseId" element={<Layout><TestCaseDetailPage /></Layout>} />
      <Route path="/project/:projectId/validation" element={<Layout><ValidationPage /></Layout>} />
      <Route path="/project/:projectId/suites" element={<Layout><SuitesPage /></Layout>} />
      <Route path="/project/:projectId/execution" element={<Layout><ExecutionPage /></Layout>} />
      <Route path="/project/:projectId/flaky" element={<Layout><FlakyPage /></Layout>} />
      <Route path="/project/:projectId/cicd" element={<Layout><CICDPage /></Layout>} />
      <Route path="/project/:projectId/reports" element={<Layout><ReportsPage /></Layout>} />
      <Route path="/project/:projectId/defects" element={<Layout><DefectsPage /></Layout>} />
      <Route path="/project/:projectId/settings" element={<Layout><SettingsPage /></Layout>} />
    </Routes>
  );
}
