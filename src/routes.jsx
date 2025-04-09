import React from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useSelector } from 'react-redux';
import Login from './pages/Login';
import Onboarding from './pages/Onboarding';
import Dashboard from './pages/Dashboard';
// import WhatsAppConnection from './components/WhatsAppConnection';
// import TelegramConnection from './components/TelegramConnection';
// import DiscordConnection from './components/DiscordConnection';
// import DiscordCallback from './components/DiscordCallback';
// import DiscordView from './components/discord/DiscordView';
// import MainEntitiesView from './components/discord/MainEntitiesView';
// import ServerDetailsView from './components/discord/ServerDetailsView';
// import ReportGenerationView from './components/discord/ReportGenerationView';
import ProtectedRoute from './components/ProtectedRoute';
import logger from './utils/logger';

const AppRoutes = () => {
  const { error: authError } = useSelector(state => state.auth);
  const { error: onboardingError } = useSelector(state => state.onboarding);

  // Log any routing-related errors
  React.useEffect(() => {
    if (authError) {
      logger.info('[Routes] Auth error:', authError);
    }
    if (onboardingError) {
      logger.info('[Routes] Onboarding error:', onboardingError);
    }
  }, [authError, onboardingError]);

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      {/* <Route path="/oauth/discord/callback" element={<DiscordCallback />} /> */}
      <Route 
        path="/dashboard/*" 
        element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        }
      >
        {/* <Route index element={<Navigate to="discord" replace />} />
        <Route path="discord" element={<DiscordView />}>
          <Route index element={<MainEntitiesView />} />
          <Route path="servers/:serverId" element={<ServerDetailsView />} />
          <Route path="servers/:serverId/report" element={<ReportGenerationView />} />
        </Route> */}
      </Route>
      <Route 
        path="/onboarding/*" 
        element={
          <ProtectedRoute>
            <Onboarding />
          </ProtectedRoute>
        }
      />
      {/* <Route 
        path="/connect/*" 
        element={
          <ProtectedRoute>
            <Routes>
              <Route path="discord" element={<DiscordConnection />} />
              <Route path="telegram" element={<TelegramConnection />} />
              <Route path="whatsapp" element={<WhatsAppConnection />} />
            </Routes>
          </ProtectedRoute>
        }
      /> */}
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
};

export default AppRoutes; 