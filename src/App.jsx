import React from 'react';
import { Provider } from 'react-redux';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { PersistGate } from 'redux-persist/integration/react';
import store, { persistor } from './store/store';
import AppRoutes from './routes/AppRoutes';
import { Toaster } from 'react-hot-toast';
import LoadingSpinner from './components/LoadingSpinner';
import SessionManager from './components/SessionManager';
import { ThemeProvider } from './context/ThemeContext';
import DirectAuthCallback from './components/DirectAuthCallback';
import './styles/theme.css';

const App = () => {
  return (
    <Provider store={store}>
      <PersistGate loading={<LoadingSpinner />} persistor={persistor}>
        <ThemeProvider>
          <BrowserRouter>
            <Toaster position="top-right" />
            <Routes>
              <Route path="/auth/callback" element={<DirectAuthCallback />} />
              <Route path="/auth/google/callback" element={<DirectAuthCallback />} />
              <Route path="*" element={
                <SessionManager>
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
