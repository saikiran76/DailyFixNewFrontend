import React, { useRef, useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
// Note: Using FiSun for Appearance since FiPaintBrush doesn't exist in the Feather icon set
import { FiX, FiUser, FiSettings, FiActivity, FiSliders, FiDatabase, FiCheckCircle, FiSun, FiMenu } from 'react-icons/fi';
import { FaWhatsapp } from 'react-icons/fa';

const ExpandedSettingsMenu = ({ isOpen, onClose, activeOption = 'Account' }) => {
  const menuRef = useRef(null);
  const [animationClass, setAnimationClass] = useState('opacity-0 scale-95');
  const [activeTab, setActiveTab] = useState(activeOption);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  
  // Get user data
  const user = useSelector((state) => state.auth.user);
  const userEmail = user?.email || 'user@example.com';
  const userFirstName = user?.user_metadata?.first_name || '';
  const userLastName = user?.user_metadata?.last_name || '';
  const userName = `${userFirstName} ${userLastName}`.trim() || 'User';
  
  // Get connected platforms
  const accounts = useSelector((state) => state.onboarding.accounts || []);
  // Filter out 'matrix' platform
  const filteredAccounts = accounts.filter(account => account.platform !== 'matrix');
  
  // For debugging
  useEffect(() => {
    if (isOpen) {
      console.log('Expanded settings accounts:', filteredAccounts);
    }
  }, [isOpen, filteredAccounts]);
  
  // Handle animation on mount/unmount
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        setAnimationClass('opacity-100 scale-100');
      }, 10);
    } else {
      setAnimationClass('opacity-0 scale-95');
    }
  }, [isOpen]);
  
  // Handle click outside to close
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        handleClose();
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);
  
  const handleClose = () => {
    setAnimationClass('opacity-0 scale-95');
    setTimeout(() => {
      onClose();
    }, 200);
  };

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    setIsMobileMenuOpen(false); // Close mobile menu when tab changes
  };
  
  if (!isOpen) return null;

  const renderContent = () => {
    switch (activeTab) {
      case 'Account':
        return (
          <div className="flex-1 overflow-auto">
            <div className="mb-6">
              <h3 className="text-lg font-semibold text-white mb-4">Connected Platforms</h3>
              
              {filteredAccounts && filteredAccounts.length > 0 ? (
                <div className="space-y-3">
                  {filteredAccounts.map((account, index) => (
                    <div 
                      key={index} 
                      className="flex items-center justify-between p-3 bg-neutral-800 rounded-lg hover:bg-neutral-700 transition-colors"
                    >
                      <div className="flex items-center space-x-3">
                        {account.platform === 'whatsapp' && (
                          <div className="w-10 h-10 flex items-center justify-center bg-green-500 rounded-full">
                            <FaWhatsapp className="text-white text-xl" />
                          </div>
                        )}
                        <div>
                          <p className="text-white font-medium">
                            {account.platform === 'whatsapp' ? 'WhatsApp' : account.platform}
                          </p>
                          <p className="text-gray-400 text-sm">
                            {account.status === 'active' ? 'Connected' : 'active'}
                          </p>
                        </div>
                      </div>
                      {account.status === 'active' && (
                        <FiCheckCircle className="text-green-500 h-5 w-5" />
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-4 bg-neutral-800 rounded-lg text-center">
                  <p className="text-gray-400">No connected platforms</p>
                </div>
              )}
            </div>
            
            <div className="mb-6">
              <h3 className="text-lg font-semibold text-white mb-4">Account Information</h3>
              <div className="p-3 bg-neutral-800 rounded-lg">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-gray-400">Email</span>
                  <span className="text-white">{userEmail}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-400">Name</span>
                  <span className="text-white">{userName}</span>
                </div>
              </div>
            </div>
          </div>
        );
      case 'Appearance':
        return (
          <div className="p-4">
            <h3 className="text-lg font-semibold text-white mb-4">Appearance Settings</h3>
            <p className="text-gray-400">Theme and visual preferences will appear here.</p>
          </div>
        );
      case 'Behavior':
        return (
          <div className="p-4">
            <h3 className="text-lg font-semibold text-white mb-4">Behavior Settings</h3>
            <p className="text-gray-400">Notification and behavior preferences will appear here.</p>
          </div>
        );
      case 'Customize':
        return (
          <div className="p-4">
            <h3 className="text-lg font-semibold text-white mb-4">Customize Interface</h3>
            <p className="text-gray-400">Customization options will appear here.</p>
          </div>
        );
      case 'Data Controls':
        return (
          <div className="p-4">
            <h3 className="text-lg font-semibold text-white mb-4">Data Controls</h3>
            <p className="text-gray-400">Data management and export options will appear here.</p>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div 
      className="fixed inset-0 bg-black/75 flex items-center justify-center z-[9999] transition-opacity duration-200 ease-in-out"
      style={{ backdropFilter: 'blur(2px)' }}
    >
      <div 
        ref={menuRef}
        className={`settings-menu bg-neutral-900 rounded-lg shadow-xl flex overflow-hidden w-[800px] max-w-[95vw] h-[500px] max-h-[85vh] transition-all duration-200 ease-in-out ${animationClass}`}
        style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          transform: `translate(30%, -50%) ${animationClass.includes('scale-95') ? 'scale(0.95)' : 'scale(1)'}`
        }}
      >
        {/* Mobile menu toggle - only on small screens */}
        <button 
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          className="absolute top-4 left-4 md:hidden z-10 bg-neutral-700 rounded-full p-2 text-white"
        >
          <FiMenu className="w-5 h-5" />
        </button>

        {/* Close button - always visible */}
        <button 
          onClick={handleClose}
          className="absolute w-auto top-4 right-4 z-10 bg-neutral-700 rounded-full p-2 text-white"
        >
          <FiX className="w-5 h-5" />
        </button>

        {/* Left sidebar - hidden on mobile unless menu is open */}
        <div className={`
          w-60 bg-neutral-800 p-6 border-r border-neutral-700
          md:block 
          ${isMobileMenuOpen ? 'absolute inset-0 z-20' : 'hidden md:block'}
        `}>
          <div className="pt-12 md:pt-6">
            <h2 className="text-xl font-semibold text-white mb-6">Settings</h2>
            
            <nav className="space-y-2">
              <button 
                onClick={() => handleTabChange('Account')}
                className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg text-white font-medium ${activeTab === 'Account' ? 'bg-neutral-700' : 'bg-neutral-800 text-gray-400 hover:bg-neutral-700'}`}
              >
                <FiUser className="w-5 h-5" />
                <span>Account</span>
              </button>
              
              <button 
                onClick={() => handleTabChange('Appearance')}
                className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg text-white font-medium ${activeTab === 'Appearance' ? 'bg-neutral-700' : 'bg-neutral-800 text-gray-400 hover:bg-neutral-700'}`}
              >
                <FiSun className="w-5 h-5" />
                <span>Appearance</span>
              </button>
              
              <button 
                onClick={() => handleTabChange('Behavior')}
                className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg text-white font-medium ${activeTab === 'Behavior' ? 'bg-neutral-700' : 'bg-neutral-800 text-gray-400 hover:bg-neutral-700'}`}
              >
                <FiActivity className="w-5 h-5" />
                <span>Behavior</span>
              </button>
              
              <button 
                onClick={() => handleTabChange('Customize')}
                className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg text-white font-medium ${activeTab === 'Customize' ? 'bg-neutral-700' : 'bg-neutral-800 text-gray-400 hover:bg-neutral-700'}`}
              >
                <FiSliders className="w-5 h-5" />
                <span>Customize</span>
              </button>
              
              <button 
                onClick={() => handleTabChange('Data Controls')}
                className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg text-white font-medium ${activeTab === 'Data Controls' ? 'bg-neutral-700' : 'bg-neutral-800 text-gray-400 hover:bg-neutral-700'}`}
              >
                <FiDatabase className="w-5 h-5" />
                <span>Data Controls</span>
              </button>
            </nav>
          </div>
        </div>
        
        {/* Right content area - expanded on mobile */}
        <div className="flex-1 p-6 pt-12 md:pt-6 overflow-y-auto">
          {/* Mobile view title */}
          <div className="md:hidden mb-4 text-center">
            <h2 className="text-xl font-semibold text-white">{activeTab}</h2>
          </div>

          {/* User info header */}
          <div className="flex items-center mb-6 pb-4 border-b border-neutral-700">
            <div className="w-12 h-12 rounded-full bg-orange-500 flex items-center justify-center text-white font-bold text-xl mr-4">
              {userName.charAt(0)}
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-white font-semibold truncate">{userName}</h3>
              <p className="text-gray-400 text-sm truncate">{userEmail}</p>
            </div>
            <button className="ml-2 bg-neutral-800 hover:bg-neutral-700 text-white px-4 py-2 rounded-lg transition-colors">
              Manage
            </button>
          </div>
          
          {/* Content based on selected option */}
          {renderContent()}
        </div>
      </div>
    </div>
  );
};

export default ExpandedSettingsMenu; 