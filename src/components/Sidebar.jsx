import React, { useState, useEffect, useRef } from 'react';
import { FiMessageSquare, FiCompass, FiSettings, FiLogOut, FiX, FiBarChart2, FiUser, FiChevronDown } from 'react-icons/fi';
import { BsFillInboxesFill } from 'react-icons/bs';
import { useNavigate, useLocation } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { useTheme } from '../context/ThemeContext';
import { initiateWhatsAppRelogin } from '../store/slices/onboardingSlice';
import { toast } from 'react-hot-toast';
import ReloginConfirmationModal from './ReloginConfirmationModal';
import LogoutModal from './LogoutModal';
import summaryImage from '../images/summary.png'
import dropImage from '../images/Drop.png'
import priorityImage from '../images/priority.png'
// import { BsFillInboxesFill } from "react-icons/bs";
import { TbHelpSquare } from "react-icons/tb";
import { IoMdLogIn } from "react-icons/io";
import DFLogo from '../images/DF.png'
import SettingsMenu from './SetttingsMenu';
import whatsappIcon from '../images/whatsapp-icon.svg';
import matrixIcon from '../images/matrix-icon.svg';
import telegramIcon from '../images/telegram-icon.svg'; // You'll need to add this image
import '../styles/platformSwitcher.css';

const TutorialModal = ({ isOpen, onClose }) => {
  const modalRef = useRef();

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (modalRef.current && !modalRef.current.contains(event.target)) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const features = [
    {
      description: "For each contact, you can get your daily report of your chat with our personalized AI.",
      imageSrc: summaryImage   // To be added later
    },
    {
      description: "Prioritize your chats by setting the priority in the dropdown available when you open your chat on the top-left.",
      imageSrc: dropImage // To be added later
    },
    {
      description: "Based on your selected priority, a colored indicator appears next to the contact name in the contacts list - red for high priority!",
      imageSrc: priorityImage // To be added later
    }
  ];

  return (
    <div className="fixed inset-0 bg-black/75 flex items-center justify-center z-50">
      <div
        ref={modalRef}
        className="bg-neutral-800 bg-opacity-90 rounded-lg p-6 max-w-2xl w-full mx-4 space-y-6 border border-white/10"
      >
        <div className="flex justify-between items-center border-b border-gray-700 pb-4">
          <h3 className="text-xl font-medium text-white">Features & Tutorial</h3>
          <button
            onClick={onClose}
            className="bg-neutral-900 rounded-full w-auto text-gray-400 hover:text-white transition-colors"
          >
            <FiX className="w-5 h-5" />
          </button>
        </div>


        <div className="space-y-6">
          {features.map((feature, index) => (
            <div
              key={index}
              className="flex items-center gap-4 text-gray-200 p-4 rounded-lg bg-gray-600 bg-opacity-50 hover:bg-neutral-800 transition-colors"
            >
              <div className="flex-1 text-xs">
                {feature.description}
              </div>
              {feature.imageSrc && (
                <img
                  src={feature.imageSrc}
                  alt={`Feature ${index + 1}`}
                  className="h-[2.8em] object-contain"
                />
              )}
            </div>
          ))}
        </div>

        <div className="border-t border-gray-700 pt-4 text-gray-400 text-sm">
          <p className="animate-pulse">New features ahead! Stay tuned!</p>
        </div>
      </div>
    </div>
  );
};

const Sidebar = ({ accounts = [], selectedPlatform, onPlatformSelect, onViewToggle, isAnalyticsView, onConnectPlatform, isCollapsed = false }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const dispatch = useDispatch();
  const { isDarkTheme } = useTheme();
  const [showTutorial, setShowTutorial] = useState(false);
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);
  const [showPlatformMenu, setShowPlatformMenu] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);

  // Get connected and available platforms
  const getConnectedPlatforms = () => {
    return accounts
      .filter(account =>
        // Filter out matrix as it's a protocol, not a messaging platform
        account.platform !== 'matrix' &&
        (account.status === 'active' || account.status === 'pending')
      )
      .map(account => ({
        id: account.platform,
        name: account.name || (account.platform === 'whatsapp' ? 'WhatsApp' :
                              account.platform === 'telegram' ? 'Telegram' : account.platform),
        icon: account.platform === 'whatsapp' ? whatsappIcon :
              account.platform === 'telegram' ? telegramIcon : null,
        isConnected: true
      }));
  };

  const getAvailablePlatforms = () => {
    const connected = getConnectedPlatforms().map(p => p.id);
    const available = [
      { id: 'whatsapp', name: 'WhatsApp', icon: whatsappIcon },
      { id: 'telegram', name: 'Telegram', icon: telegramIcon },
      // { id: 'matrix', name: 'Matrix', icon: matrixIcon }
    ];

    return available.filter(p => !connected.includes(p.id));
  };

  const connectedPlatforms = getConnectedPlatforms();
  const availablePlatforms = getAvailablePlatforms();

  const handlePlatformClick = (platform) => {
    onPlatformSelect(platform);
    setShowPlatformMenu(false);
    // if (platform === 'discord') {
    //   navigate('/discord');
    // }
  };

  const toggleSettingsMenu = (event) => {
    event.stopPropagation();
    setShowSettingsMenu(!showSettingsMenu);
    // Close platform menu if open
    if (showPlatformMenu) setShowPlatformMenu(false);
  };

  const togglePlatformMenu = (event) => {
    event.stopPropagation();
    setShowPlatformMenu(!showPlatformMenu);
    // Close settings menu if open
    if (showSettingsMenu) setShowSettingsMenu(false);
  };

  // Close menus when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (showSettingsMenu && !event.target.closest('[data-settings-button]') && !event.target.closest('.settings-menu')) {
        setShowSettingsMenu(false);
      }
      if (showPlatformMenu && !event.target.closest('[data-platform-button]') && !event.target.closest('.platform-menu')) {
        setShowPlatformMenu(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showSettingsMenu, showPlatformMenu]);

  return (
    <div className={`relative flex flex-col h-full bg-neutral-900 transition-all duration-300 ease-in-out ${isCollapsed ? 'w-16' : 'w-[13rem]'}`}>
      <div className={`p-6 ${isCollapsed ? 'flex justify-center' : ''}`}>
        <div className="flex items-center">
          <img className={`h-8 w-8 rounded-full ${isCollapsed ? '' : 'mr-3'}`} src={DFLogo} alt="DailyFix Logo" />
          {!isCollapsed && (
            <>
              <span className="text-white text-xl font-semibold">Daily</span>
              <span className="text-xl font-semibold ml-0 bg-gradient-to-r from-purple-400 to-pink-600 bg-clip-text text-transparent">Fix</span>
            </>
          )}
        </div>
      </div>

      {/* Platform Switcher */}
      <div className={`${isCollapsed ? 'px-2' : 'px-6'} mb-4`}>
        {connectedPlatforms.length > 0 ? (
          <div className="relative">
            <button
              data-platform-button
              onClick={togglePlatformMenu}
              className={`w-full flex items-center justify-between ${isCollapsed ? 'px-2' : 'px-3'} py-2 rounded-lg transition-colors theme-transition ${isDarkTheme ? 'bg-neutral-800 text-white hover:bg-neutral-700' : 'bg-gray-100 text-gray-900 hover:bg-gray-200'}`}
            >
              <div className="flex items-center">
                {/* Show icon for current platform */}
                {connectedPlatforms.find(p => p.id === selectedPlatform)?.icon && (
                  <img
                    src={connectedPlatforms.find(p => p.id === selectedPlatform)?.icon}
                    alt={connectedPlatforms.find(p => p.id === selectedPlatform)?.name}
                    className={`w-5 h-5 ${isCollapsed ? '' : 'mr-2'}`}
                  />
                )}
                {!isCollapsed && (
                  <span className="text-sm font-medium">
                    {connectedPlatforms.find(p => p.id === selectedPlatform)?.name || selectedPlatform}
                  </span>
                )}
              </div>
              {!isCollapsed && <FiChevronDown className="w-4 h-4" />}
            </button>

            {/* Platform Menu */}
            {showPlatformMenu && (
              <div className={`absolute top-full left-0 w-full mt-1 rounded-lg shadow-lg overflow-hidden z-50 platform-menu theme-transition ${isDarkTheme ? 'bg-neutral-800' : 'bg-white border border-gray-200'}`}>
                {/* Connected Platforms */}
                {connectedPlatforms.length > 0 && (
                  <div className={`px-3 py-1 text-xs theme-transition ${isDarkTheme ? 'text-gray-400' : 'text-gray-500'}`}>
                    Connected
                  </div>
                )}

                {connectedPlatforms.map(platform => (
                  <button
                    key={platform.id}
                    onClick={() => handlePlatformClick(platform.id)}
                    className={`w-full flex items-center px-3 py-2 text-sm theme-transition ${selectedPlatform === platform.id ?
                      (isDarkTheme ? 'bg-neutral-700 text-white' : 'bg-gray-100 text-gray-900') :
                      (isDarkTheme ? 'text-gray-300 hover:bg-neutral-700 hover:text-white' : 'text-gray-700 hover:bg-gray-100')}`}
                  >
                    <img src={platform.icon} alt={platform.name} className="w-5 h-5 mr-2" />
                    <span>{platform.name}</span>
                  </button>
                ))}

                {/* Available Platforms */}
                {availablePlatforms.length > 0 && (
                  <>
                    <div className={`px-3 py-1 text-xs theme-transition ${isDarkTheme ? 'text-gray-400' : 'text-gray-500'}`}>
                      Add Platform
                    </div>

                    {availablePlatforms.map(platform => (
                      <button
                        key={platform.id}
                        onClick={onConnectPlatform}
                        className={`w-full flex items-center px-3 py-2 text-xs bg-neutral-800 theme-transition ${isDarkTheme ? 'text-gray-300 hover:bg-neutral-700 hover:text-white' : 'text-gray-700 hover:bg-gray-100'}`}
                      >
                        <div className="flex items-center bg-neutral-800">
                          <img src={platform.icon} alt={platform.name} className="w-5 h-5 mr-2" />
                          <span>+ Add {platform.name}</span>
                        </div>
                      </button>
                    ))}
                  </>
                )}
              </div>
            )}
          </div>
        ) : (
          <button
            onClick={onConnectPlatform}
            className="w-full flex items-center justify-center px-3 py-3 bg-purple-600 rounded-lg text-white hover:bg-purple-700 transition-colors"
          >
            <span className="text-sm font-medium">Connect Platform</span>
          </button>
        )}
      </div>
      <nav className="flex-1 px-4 space-y-2">
        {/* Analytics/Inbox Toggle Button - Only show when WhatsApp is connected */}
        {accounts.length > 0 && accounts.some(account =>
          account.platform === 'whatsapp' && (account.status === 'active' || account.status === 'pending')
        ) && (
          <button
            onClick={() => onViewToggle(!isAnalyticsView)}
            className={`w-full flex items-center ${isCollapsed ? 'justify-center' : 'space-x-3'} ${isCollapsed ? 'px-2' : 'px-3'} py-2 rounded-lg transition-colors theme-transition ${
              isAnalyticsView
                ? 'bg-purple-600 text-white'
                : isDarkTheme
                  ? 'text-gray-400 bg-neutral-800 hover:bg-neutral-700 hover:text-white'
                  : 'text-gray-600 bg-gray-100 hover:bg-gray-200 hover:text-gray-900'
            }`}
          >
            {isAnalyticsView ? (
              <>
                <BsFillInboxesFill className="w-5 h-5" />
                {!isCollapsed && <span className="text-sm font-medium">Inbox</span>}
              </>
            ) : (
              <>
                <FiBarChart2 className="w-5 h-5" />
                {!isCollapsed && <span className="text-sm font-medium">Analytics</span>}
              </>
            )}
          </button>
        )}

        <button
          onClick={() => navigate('/explore')}
          className={`w-full flex bg-neutral-800 items-center ${isCollapsed ? 'justify-center' : 'space-x-3'} ${isCollapsed ? 'px-2' : 'px-3'} py-2 rounded-lg transition-colors ${
            location.pathname === '/explore'
              ? 'bg-[#25D366] text-white'
              : 'text-gray-400 hover:bg-neutral-700 hover:text-white'
          }`}
        >
          <FiCompass className="w-5 h-5" />
          {!isCollapsed && <span className="text-sm font-medium">Explore</span>}
        </button>

        {/* <button
          onClick={() => navigate('/inbox')}
          className={`w-full flex items-center space-x-3 px-3 py-2 rounded-lg transition-colors bg-neutral-800 ${
            location.pathname === '/inbox'
              ? 'bg-[#25D366] text-white'
              : 'text-gray-400 hover:bg-neutral-700 hover:text-white'
          }`}
        >
          <BsFillInboxesFill className="w-5 h-5" />
          <span className="text-sm font-medium">Inbox</span>
        </button> */}

        {/* Tutorial Button - Using TbHelpSquare again */}
        {/* <button
          onClick={() => setShowTutorial(true)}
          className="w-full flex items-center space-x-3 px-3 py-2 rounded-lg text-gray-400 bg-neutral-800 hover:bg-neutral-700 hover:text-white transition-colors"
        >
          <TbHelpSquare className="w-5 h-5" />
          <span className="text-sm font-medium">Tutorial</span>
        </button> */}
      </nav>

      {/* Bottom Actions */}
      <div className="p-4 border-t border-white/10 space-y-2">
        {/* Settings Button */}
        <button
          data-settings-button
          onClick={toggleSettingsMenu}
          className={`w-full flex items-center space-x-3 px-3 py-2 rounded-lg transition-colors ${
              showSettingsMenu
                ? 'bg-neutral-700 text-white'
                : 'text-gray-400 bg-neutral-800 hover:bg-neutral-700 hover:text-white'
          }`}
        >
          <FiUser className="w-5 h-5" />
          <span className="text-sm font-medium">Settings</span>
        </button>

        {/* Logout Button */}
        <button
          onClick={() => setShowLogoutModal(true)}
          className="w-full flex items-center bg-neutral-800 space-x-3 px-3 py-2 rounded-lg text-gray-400 hover:bg-neutral-700 hover:text-white transition-colors"
        >
          <FiLogOut className="w-5 h-5" />
          <span className="text-sm font-medium">Logout</span>
        </button>
      </div>

      {/* Render Settings Menu conditionally */}
      <SettingsMenu
        isOpen={showSettingsMenu}
        onClose={() => setShowSettingsMenu(false)}
      />

      {/* Tutorial Modal */}
      {showTutorial && (
        <TutorialModal isOpen={showTutorial} onClose={() => setShowTutorial(false)} />
      )}

      {/* Logout Modal */}
      <LogoutModal isOpen={showLogoutModal} onClose={() => setShowLogoutModal(false)} />
    </div>
  );
};

export default Sidebar;
