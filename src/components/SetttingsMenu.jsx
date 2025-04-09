import React, { useRef, useEffect, useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { FiX, FiLogOut, FiMoon, FiSun, FiHelpCircle, FiCheckCircle } from 'react-icons/fi';
import { IoMdLogIn } from 'react-icons/io';
import { toast } from 'react-hot-toast'; // Assuming you use react-hot-toast
import ExpandedSettingsMenu from './ExpandedSettingsMenu';
import { useTheme, THEMES } from '../context/ThemeContext';

// Import the necessary actions/thunks
import { initiateWhatsAppRelogin } from '../store/slices/onboardingSlice'; // Adjust path as needed

// Placeholder for user avatar - replace with actual image if available
const UserAvatar = ({ name }) => {
  const initials = name ? name.split(' ').map(n => n[0]).join('').toUpperCase() : '?';
  return (
    <div className="w-10 h-10 rounded-full bg-orange-500 flex items-center justify-center text-white font-semibold text-lg mr-3">
      {initials}
    </div>
  );
};


const SettingsMenu = ({ isOpen, onClose }) => {
  const dispatch = useDispatch();
  const menuRef = useRef(null);
  const [showExpandedMenu, setShowExpandedMenu] = useState(false);
  const { theme, toggleTheme, setTheme, isDarkTheme } = useTheme();

  // Get user data from auth slice
  const user = useSelector((state) => state.auth.user);
  const userEmail = user?.email || 'N/A';
  const userFirstName = user?.user_metadata?.first_name || '';
  const userLastName = user?.user_metadata?.last_name || '';
  const userName = `${userFirstName} ${userLastName}`.trim() || 'User';

  // Get connected platforms from onboarding slice
  const connectedPlatforms = useSelector((state) => state.onboarding.connectedPlatforms);
  const accounts = useSelector((state) => state.onboarding.accounts)
  const isWhatsappConnected = accounts.some(account => account.platform === 'whatsapp');

  // Handle click outside to close
  useEffect(() => {
    const handleClickOutside = (event) => {
      // Check if the click is outside the menu
      // Make sure the click didn't originate from the sidebar's settings button itself (passed via event propagation potentially)
      if (isOpen && menuRef.current && !menuRef.current.contains(event.target)) {
          // Check if the click target is the settings button in the sidebar
          // This requires knowing the button's selector or passing the ref down,
          // For simplicity here, we assume any click outside closes it.
          // A more robust solution might involve checking event.target against the button ref.
          if (!event.target.closest('[data-settings-button]')) {
             onClose();
          }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose]);

  // Close expanded menu when settings menu is closed
  useEffect(() => {
    if (!isOpen) {
      setShowExpandedMenu(false);
    }
  }, [isOpen]);

  const handleAccountClick = () => {
    setShowExpandedMenu(true);
  };

  const handleCloseExpandedMenu = () => {
    setShowExpandedMenu(false);
  };

  const handleRelogin = async () => {
    toast.loading('Initiating WhatsApp reconnection...', { id: 'relogin-toast' });
    try {
      await dispatch(initiateWhatsAppRelogin()).unwrap();
      toast.success('WhatsApp reconnection process started. Check your onboarding screen.', { id: 'relogin-toast' });
      // Optionally close the menu after starting relogin
      // onClose();
    } catch (error) {
      console.error("Failed to initiate WhatsApp relogin:", error);
      toast.error(error?.message || 'Failed to start WhatsApp reconnection.', { id: 'relogin-toast' });
    }
  };

  const handleLogout = () => {
     // TODO: Implement actual logout logic using the signOut thunk
    alert("Logout not implemented yet.");
    // dispatch(signOut()); // Example of how to call it
    onClose();
  };

  if (!isOpen) {
    return null;
  }

  return (
    <>
      <div
        ref={menuRef}
        className={`settings-menu fixed top-10 left-[14rem] z-[9000] w-64 rounded-lg shadow-xl border text-sm font-medium theme-transition ${isDarkTheme ? 'bg-neutral-800 border-white/10 text-white' : 'bg-white border-gray-200 text-gray-900'}`}
        // Prevent clicks inside the menu from closing it via the document listener
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()} // Also stop mousedown propagation
      >
        {/* User Info */}
        <div className="p-4 flex items-center">
          <UserAvatar name={userName} />
          <div>
            <div className="font-semibold">{userName}</div>
            <div className="text-xs text-gray-400">{userEmail}</div>
          </div>
        </div>

        {/* Divider */}
        <div className={`border-t mx-4 ${isDarkTheme ? 'border-white/10' : 'border-gray-200'}`}></div>

        {/* Options */}
        <div className="p-2 space-y-1">
          {/* Account Section */}
          <button
            onClick={handleAccountClick}
            className={`w-full px-3 py-2 rounded-md flex justify-between items-center cursor-pointer theme-transition ${isDarkTheme ? 'bg-neutral-700 hover:bg-neutral-600' : 'bg-gray-100 hover:bg-gray-200'}`}
          >
            <span>Account</span>
            {isWhatsappConnected ? (
              <span className="flex items-center text-xs font-semibold bg-green-600/20 text-green-400 px-2 py-0.5 rounded-full">
                <FiCheckCircle size={12} className="mr-1" />
                WhatsApp
              </span>
            ) : (
               <span className="text-xs font-semibold bg-yellow-600/20 text-yellow-400 px-2 py-0.5 rounded-full">
                Pending
              </span>
               // Or show nothing if not connected at all - adjust as needed
            )}
          </button>

           {/* Relogin Button - Only show if WhatsApp was connected at some point maybe? Or always show? */}
           {/* Let's show it if 'whatsapp' exists in PLATFORMS or based on onboarding status */}
            <button
              onClick={handleRelogin}
              className="w-full bg-gradient-to-r from-purple-900/80 to-indigo-900/80 flex items-center space-x-3 px-3 py-2 rounded-md text-white hover:opacity-90 transition-colors"
            >
              <IoMdLogIn className="w-5 h-5 text-white/80" />
              <span>Relogin WhatsApp</span>
            </button>


          {/* Theme Section */}
          <div className={`px-3 py-2 rounded-md flex justify-between items-center cursor-pointer theme-transition ${isDarkTheme ? 'hover:bg-neutral-700' : 'hover:bg-gray-100'}`}>
             <span>Theme</span>
             <div className="flex items-center space-x-1">
                  <button
                    onClick={() => setTheme(THEMES.LIGHT)}
                    className={`p-1 rounded theme-transition ${!isDarkTheme ? `bg-gray-200 text-gray-900` : `hover:bg-neutral-600 text-gray-400`}`}
                    aria-label="Switch to Light Theme"
                  >
                    <FiSun size={16} />
                  </button>
                  <button
                    onClick={() => setTheme(THEMES.DARK)}
                    className={`p-1 rounded theme-transition ${isDarkTheme ? `bg-neutral-600 text-white` : `hover:bg-gray-300 text-gray-500`}`}
                    aria-label="Switch to Dark Theme"
                  >
                    <FiMoon size={16} />
                  </button>
             </div>
          </div>

          {/* Support Section (Static) */}
          <button className="w-full bg-gradient-to-r from-purple-900/80 to-indigo-900/80 flex items-center space-x-3 px-3 py-2 rounded-md text-white hover:opacity-90 transition-colors">
            <FiHelpCircle className="w-5 h-5 text-white/80" />
            <span>Support</span>
          </button>
        </div>

        {/* Divider */}
        <div className={`border-t mx-4 ${isDarkTheme ? 'border-white/10' : 'border-gray-200'}`}></div>

        {/* Logout & Version */}
        <div className="p-2">
          <button
            onClick={handleLogout}
            className="w-full bg-gradient-to-r from-purple-900/80 to-indigo-900/80 flex items-center space-x-3 px-3 py-2 rounded-md text-white hover:opacity-90 transition-colors"
          >
            <FiLogOut className="w-5 h-5 text-white/80" />
            <span>Logout</span>
          </button>
        </div>

        <div className={`px-4 py-2 text-center text-xs ${isDarkTheme ? 'text-gray-500' : 'text-gray-400'}`}>
          Version 1.0.0
        </div>
      </div>

      {/* Expanded Settings Menu */}
      <ExpandedSettingsMenu
        isOpen={showExpandedMenu}
        onClose={handleCloseExpandedMenu}
      />
    </>
  );
};

export default SettingsMenu;