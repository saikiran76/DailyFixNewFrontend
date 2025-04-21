import React, { useState, useEffect } from 'react';
import { Provider } from 'react-redux';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { PersistGate } from 'redux-persist/integration/react';
import store, { persistor } from './store/store';
import AppRoutes from './routes/AppRoutes';
import { Toaster } from 'react-hot-toast';
import LoadingSpinner from './components/LoadingSpinner';
import SessionManager from './components/SessionManager';
import SessionExpirationHandler from './components/SessionExpirationHandler';
import { ThemeProvider } from './context/ThemeContext';
// Matrix initializer is now only used when connecting to Telegram
import DirectAuthCallback from './components/DirectAuthCallback';
import SessionExpiredModal from './components/SessionExpiredModal';
import logger from './utils/logger';
import './styles/theme.css';

const App = () => {
  // State to control the session expired modal
  const [showSessionExpiredModal, setShowSessionExpiredModal] = useState(false);
  // We don't need to track the reason for session expiration

  // Listen for the custom sessionExpired event
  useEffect(() => {
    const handleSessionExpired = (event) => {
      logger.info('[App] Session expired event received:', event.detail);
      setShowSessionExpiredModal(true);
    };

    // Add event listener
    window.addEventListener('sessionExpired', handleSessionExpired);

    // Cleanup
    return () => {
      window.removeEventListener('sessionExpired', handleSessionExpired);
    };
  }, []);

  // Handle modal close
  const handleModalClose = () => {
    setShowSessionExpiredModal(false);
  };

  return (
    <Provider store={store}>
      <PersistGate loading={<LoadingSpinner />} persistor={persistor}>
        <ThemeProvider>
          <BrowserRouter>
            {/* Session expired modal */}
            <SessionExpiredModal
              isOpen={showSessionExpiredModal}
              onClose={handleModalClose}
            />

            <Toaster position="top-right" />
            <Routes>
              <Route path="/auth/callback" element={<DirectAuthCallback />} />
              <Route path="/auth/google/callback" element={<DirectAuthCallback />} />
              <Route path="*" element={
                <SessionManager>
                  {/* Add SessionExpirationHandler to handle session expiration */}
                  <SessionExpirationHandler />
                  {/* Only render MatrixInitializer when needed for Telegram */}
                  <AppRoutes />
                </SessionManager>
              } />
            </Routes>
          </BrowserRouter>
        </ThemeProvider>
      </PersistGate>
    </Provider>
  );
};

export default App;
