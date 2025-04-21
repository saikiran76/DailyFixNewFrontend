import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiAlertTriangle, FiLogOut, FiX } from 'react-icons/fi';
import logger from '../utils/logger';
import authService from '../services/authService';

/**
 * A modal that appears when the user's session has expired
 * Provides a smooth, non-jarring experience with a countdown before logout
 */
const SessionExpiredModal = ({ isOpen, onClose }) => {
  const [countdown, setCountdown] = useState(10);
  const navigate = useNavigate();
  const modalRef = useRef(null);
  const intervalRef = useRef(null);

  // Handle logout and redirect
  const handleLogout = useCallback(async () => {
    try {
      logger.info('[SessionExpiredModal] Performing logout due to session expiration');

      // CRITICAL FIX: Close the modal first to ensure it doesn't block the login page
      if (onClose) {
        onClose();
      }

      // Use authService directly instead of Redux action
      await authService.signOut();

      // Store current URL to redirect back after login
      try {
        localStorage.setItem('auth_redirect', window.location.pathname);
      } catch (e) {
        logger.error('[SessionExpiredModal] Error storing redirect URL:', e);
      }

      // Navigate to login page
      navigate('/login', { replace: true });
    } catch (error) {
      logger.error('[SessionExpiredModal] Error during logout:', error);
      // Force navigation to login as fallback
      window.location.href = '/login';
    }
  }, [navigate, onClose]);

  // Handle immediate logout button click
  const handleLogoutNow = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    handleLogout();
  }, [handleLogout]);

  // Handle countdown and automatic logout
  useEffect(() => {
    if (isOpen) {
      // Start countdown
      intervalRef.current = setInterval(() => {
        setCountdown(prev => {
          if (prev <= 1) {
            // When countdown reaches 0, clear interval and perform logout
            clearInterval(intervalRef.current);
            handleLogout();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      // Clear interval and reset countdown when modal is closed
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      setCountdown(10);
    }

    // Cleanup on unmount
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isOpen, handleLogout]);

  // Handle click outside modal to close it
  useEffect(() => {
    const handleClickOutside = (event) => {
      // CRITICAL FIX: Allow closing the modal by clicking outside
      // This ensures users can access the login page if needed
      if (modalRef.current && !modalRef.current.contains(event.target) && onClose) {
        onClose();
      }
    };

    if (isOpen && modalRef.current) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-70 backdrop-blur-sm">
      <div
        ref={modalRef}
        className="bg-neutral-800 rounded-lg shadow-xl p-6 max-w-md w-full mx-4 border border-neutral-700 animate-fadeIn"
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center">
            <div className="bg-yellow-500 bg-opacity-20 p-3 rounded-full mr-4">
              <FiAlertTriangle className="text-yellow-500 text-2xl" />
            </div>
            <h2 className="text-xl font-semibold text-white">Session Expired</h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors p-2"
            aria-label="Close modal"
          >
            <FiX size={24} />
          </button>
        </div>

        <p className="text-neutral-300 mb-6">
          Your session has expired due to inactivity. You will be automatically logged out in <span className="font-bold text-white">{countdown}</span> seconds.
        </p>

        <p className="text-neutral-400 text-sm mb-6">
          For your security, please log in again to continue using the application.
        </p>

        <div className="flex justify-end space-x-4">
          <button
            onClick={handleLogoutNow}
            className="flex items-center px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
          >
            <FiLogOut className="mr-2" />
            Logout Now
          </button>
        </div>
      </div>
    </div>
  );
};

export default SessionExpiredModal;
