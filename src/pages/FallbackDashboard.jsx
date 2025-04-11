import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { FiLogOut, FiMessageSquare } from 'react-icons/fi';
import { signOut } from '../store/slices/authSlice';
import LogoutModal from '../components/LogoutModal';

/**
 * A simplified dashboard that will always render regardless of state
 * This is used as a fallback when the main dashboard fails to render
 */
const FallbackDashboard = () => {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const [showLogoutModal, setShowLogoutModal] = useState(false);

  const handleLogout = async () => {
    try {
      await dispatch(signOut()).unwrap();
      navigate('/login');
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  const handleRefresh = () => {
    window.location.reload();
  };

  return (
    <>
      <LogoutModal isOpen={showLogoutModal} onClose={() => setShowLogoutModal(false)} />
      
      <div className="flex h-screen bg-neutral-900">
        {/* Sidebar */}
        <div className="fixed lg:relative lg:w-[13rem] bg-neutral-900 h-full z-40 border-r border-neutral-800">
          <div className="p-6">
            <div className="flex items-center">
              <div className="h-8 w-8 rounded-full mr-3 bg-purple-600"></div>
              <span className="text-white text-xl font-semibold">Daily</span>
              <span className="text-xl font-semibold ml-0 bg-gradient-to-r from-purple-400 to-pink-600 bg-clip-text text-transparent">Fix</span>
            </div>
          </div>
          
          <nav className="flex-1 px-4 space-y-2 mt-6">
            <div className="w-full flex items-center space-x-3 px-3 py-2 rounded-lg bg-neutral-800 text-white">
              <FiMessageSquare className="w-5 h-5" />
              <span className="text-sm font-medium">Dashboard</span>
            </div>
          </nav>
          
          <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-neutral-800 space-y-2">
            <button
              onClick={() => setShowLogoutModal(true)}
              className="w-full flex items-center bg-neutral-800 space-x-3 px-3 py-2 rounded-lg text-gray-400 hover:bg-neutral-700 hover:text-white transition-colors"
            >
              <FiLogOut className="w-5 h-5" />
              <span className="text-sm font-medium">Logout</span>
            </button>
          </div>
        </div>
        
        {/* Main Content */}
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center p-8 max-w-md">
            <h2 className="text-2xl font-bold text-white mb-4">Dashboard Loading</h2>
            <p className="text-gray-400 mb-6">
              Your session is active, but we're having trouble loading your dashboard content.
              This could be due to connection issues or missing data.
            </p>
            <button
              onClick={handleRefresh}
              className="px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
            >
              Refresh Page
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

export default FallbackDashboard;
