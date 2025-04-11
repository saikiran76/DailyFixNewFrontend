import React, { useState, useEffect } from 'react';
import Sidebar from '../components/Sidebar';
import WhatsAppContactList from '../components/WhatsAppContactList';
import ChatView from '../components/ChatView';
import AnalyticsDashboard from '../components/AnalyticsDashboard';
import AISuggestionFeedback from '../components/AISuggestionFeedback';
import TourPopup from '../components/TourPopup';
import PlatformConnectionModal from '../components/PlatformConnectionModal';
import LogoutModal from '../components/LogoutModal';
import api from '../utils/api';
import { useDispatch, useSelector } from 'react-redux';
import { fetchContacts, selectContactById } from '../store/slices/contactSlice';
import { connect as connectSocket } from '../store/slices/socketSlice';
import { updateAccounts, setWhatsappConnected } from '../store/slices/onboardingSlice';
import { isWhatsAppConnected } from '../utils/connectionStorage';
import { isWhatsAppConnectedDB } from '../utils/connectionStorageDB';
import logger from '../utils/logger';
import { FiMenu, FiX } from 'react-icons/fi';
import { IoArrowBack } from "react-icons/io5";

const AcknowledgmentModal = ({ isOpen, onClose, whatsappConnected, userId }) => {
  const modalRef = React.useRef();
  const [shouldRender, setShouldRender] = useState(false);

  // Check if WhatsApp is connected before rendering
  useEffect(() => {
    // Only render if WhatsApp is connected (from props or localStorage)
    const whatsappConnectedInCache = userId && isWhatsAppConnected(userId);
    setShouldRender(isOpen && (whatsappConnected || whatsappConnectedInCache));
  }, [isOpen, whatsappConnected, userId]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (modalRef.current && !modalRef.current.contains(event.target)) {
        onClose();
      }
    };

    if (shouldRender) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [shouldRender, onClose]);

  if (!shouldRender) return null;

  return (
    <div className="fixed inset-0 bg-black/75 bg-opacity-50 flex items-center justify-center z-50">
      <div
        ref={modalRef}
        className="bg-neutral-900 border border-white/10 p-6 rounded-3xl max-w-xl w-full mx-4"
      >
        <div className="flex justify-between items-center mb-7">
          <div className='flex items-center gap-3'>
            <div>
              <img className='size-10' src="https://media0.giphy.com/media/jU9PVpqUvR0aNc3nvX/giphy.gif?cid=6c09b952prsvlhpto7g95cgdkxbeyvjja133739m5398bj2o&ep=v1_stickers_search&rid=giphy.gif&ct=s" alt="whatsappLoad"/>
            </div>
            <h3 className="text-xl font-medium text-white">WhatsApp Sync Started</h3>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors w-auto h-[2.7rem] ml-3 rounded-full bg-neutral-800 p-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <p className="text-gray-300 mb-6">
          Application started syncing your WhatsApp contacts. If there is a new message for any contact, it will be fetched automatically here.
        </p>

        {/* Guidelines Section */}
        <div className="bg-neutral-700 border border-white/10 rounded-lg p-4">
          <h4 className="text-white font-medium mb-4">Guidelines:</h4>
          <div className="space-y-4 text-sm">
            <div className="flex items-start gap-3">
              <span className="text-white bg-[#1e6853] rounded-full w-6 h-6 flex items-center justify-center flex-shrink-0">1</span>
              <p className="text-white">Your incoming messages of the contacts will be tracked here</p>
            </div>
            <div className="flex items-start gap-3">
              <span className="text-white bg-[#1e6853] rounded-full w-6 h-6 flex items-center justify-center flex-shrink-0">2</span>
              <p className="text-white">Try sending a message to a contact or try receiving a message from a contact such that app will start syncing your contacts here real-time.</p>
            </div>
            <div className="flex items-start gap-3">
              <span className="text-white bg-[#1e6853] rounded-full w-6 h-6 flex items-center justify-center flex-shrink-0">3</span>
              <p className="text-white">Hit the refresh icon in the list to get your contacts when/once you have the incoming messages or you've sent any message to a contact.</p>
            </div>
            <div className="flex items-start gap-3">
              <span className="text-white bg-[#1e6853] rounded-full w-6 h-6 flex items-center justify-center flex-shrink-0">4</span>
              <p className="text-white">From there on, your contacts will be synced here whenever your contacts have incoming messages will be here in the application, so that you could use our AI based features.</p>
            </div>
            {/* <div className="flex items-start gap-3">
              <span className="text-white bg-[#1e6853] rounded-full w-6 h-6 flex items-center justify-center flex-shrink-0">5</span>
              <p className="text-white">Check the help/tutorial in the left to checkout the current features.</p>
            </div> */}
          </div>
        </div>
      </div>
    </div>
  );
};

const Dashboard = () => {
  const dispatch = useDispatch();
  // Get contacts from Redux store
  const { items: contacts } = useSelector(state => state.contacts);
  const { connected: socketConnected } = useSelector(state => state.socket);
  const { whatsappConnected, accounts: storeAccounts } = useSelector(state => state.onboarding);
  const { session } = useSelector(state => state.auth);
  const [selectedPlatform, setSelectedPlatform] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [selectedContactId, setSelectedContactId] = useState(null);
  // Initialize showAcknowledgment based on WhatsApp connection status
  const [showAcknowledgment, setShowAcknowledgment] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  // Initialize showTourPopup based on WhatsApp connection status
  const [showTourPopup, setShowTourPopup] = useState(false);
  // Track if component is mounted to ensure proper rendering
  const [isMounted, setIsMounted] = useState(false);

  // Set mounted state on component mount
  useEffect(() => {
    setIsMounted(true);

    // CRITICAL FIX: Initialize accounts if WhatsApp is connected
    if (whatsappConnected && accounts.length === 0) {
      setAccounts([{
        id: 'whatsapp',
        platform: 'whatsapp',
        name: 'WhatsApp',
        status: 'active'
      }]);
      setSelectedPlatform('whatsapp');
    }

    return () => setIsMounted(false);
  }, [whatsappConnected, accounts]);
  const [showConnectionModal, setShowConnectionModal] = useState(false);
  const [isContactListVisible, setIsContactListVisible] = useState(true);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [showFixButton, setShowFixButton] = useState(false);

  // State for toggling between WhatsApp view and Analytics Dashboard
  const [isAnalyticsView, setIsAnalyticsView] = useState(false);
  // State for controlling the feedback popup
  const [showFeedbackPopup, setShowFeedbackPopup] = useState(false);

  // Show feedback popup when analytics view is enabled (with a delay)
  useEffect(() => {
    let timeoutId;
    if (isAnalyticsView) {
      timeoutId = setTimeout(() => {
        setShowFeedbackPopup(true);
      }, 2000);
    } else {
      setShowFeedbackPopup(false);
    }

    return () => clearTimeout(timeoutId);
  }, [isAnalyticsView]);

  // Get the latest contact data from Redux store
  const selectedContact = useSelector(state =>
    selectedContactId ? selectContactById(state, selectedContactId) : null
  );

  // Initialize accounts from Redux store
  useEffect(() => {
    const initializeFromStore = async () => {
      // CRITICAL FIX: Add loop detection
      const now = Date.now();
      const lastInitTime = parseInt(sessionStorage.getItem('dashboard_last_init') || '0');
      const timeSinceLastInit = now - lastInitTime;

      // If we're initializing too frequently (less than 2 seconds apart), we might be in a loop
      if (lastInitTime > 0 && timeSinceLastInit < 2000) {
        const loopCount = parseInt(sessionStorage.getItem('dashboard_init_loop_count') || '0') + 1;
        sessionStorage.setItem('dashboard_init_loop_count', loopCount.toString());

        // If we detect more than 3 rapid initializations, we're probably in a loop
        if (loopCount > 3) {
          logger.error('[Dashboard] Infinite loop detected, breaking out');
          sessionStorage.removeItem('dashboard_init_loop_count');
          // REMOVED: setLoading(false) - causing errors
          return; // Break out of the initialization
        }
      } else {
        // Reset loop counter if enough time has passed
        sessionStorage.setItem('dashboard_init_loop_count', '0');
      }

      // Update last init time
      sessionStorage.setItem('dashboard_last_init', now.toString());

      // Check if we have a valid session
      if (!session || !session.user || !session.user.id) {
        logger.warn('[Dashboard] No valid session found, cannot initialize');
        return;
      }

      // Check IndexedDB and localStorage for WhatsApp connection status
      const userId = session.user.id;
      const whatsappConnectedInCache = userId && await isWhatsAppConnectedDB(userId);

      if (whatsappConnectedInCache) {
        logger.info('[Dashboard] Found WhatsApp connection in persistent storage');
        dispatch(setWhatsappConnected(true));

        // Save WhatsApp connection status in auth data for persistence
        try {
          const authDataStr = localStorage.getItem('dailyfix_auth');
          if (authDataStr) {
            const authData = JSON.parse(authDataStr);
            authData.whatsappConnected = true;
            localStorage.setItem('dailyfix_auth', JSON.stringify(authData));
            logger.info('[Dashboard] Updated auth data with WhatsApp connection status');
          }
        } catch (error) {
          logger.error('[Dashboard] Error updating auth data with WhatsApp connection:', error);
        }
      }

      // CRITICAL FIX: Always ensure we have a WhatsApp account if connected
      if (whatsappConnectedInCache && (!accounts.length || !accounts.some(acc => acc.platform === 'whatsapp'))) {
        logger.info('[Dashboard] Setting up WhatsApp account after connection detected');
        const whatsappAccount = {
          id: 'whatsapp',
          platform: 'whatsapp',
          name: 'WhatsApp',
          status: 'active'
        };

        setAccounts([whatsappAccount]);
        setSelectedPlatform('whatsapp');

        // Also update Redux store
        dispatch(updateAccounts([whatsappAccount]));
      }

      // CRITICAL FIX: If whatsappConnected is true but no WhatsApp account in storeAccounts, add it
      if (whatsappConnected && storeAccounts) {
        const hasWhatsappAccount = storeAccounts.some(acc =>
          acc.platform === 'whatsapp' && (acc.status === 'active' || acc.status === 'pending'));

        if (!hasWhatsappAccount) {
          logger.info('[Dashboard] WhatsApp is connected but missing from accounts, adding it');
          const updatedAccounts = [...storeAccounts, {
            id: 'whatsapp',
            platform: 'whatsapp',
            name: 'WhatsApp',
            status: 'active'
          }];
          dispatch(updateAccounts(updatedAccounts));
          setAccounts(updatedAccounts);
          setSelectedPlatform('whatsapp');
          return;
        }
      }

      // Determine if we should show the tour popup or acknowledgment modal
      // Only show tour popup if no WhatsApp account is connected
      const hasWhatsappAccount = storeAccounts && storeAccounts.some(acc =>
        acc.platform === 'whatsapp' && (acc.status === 'active' || acc.status === 'pending')
      );

      const isWhatsappConnected = hasWhatsappAccount || whatsappConnected || whatsappConnectedInCache;

      // Show tour popup only if WhatsApp is not connected
      setShowTourPopup(!isWhatsappConnected);

      // Show acknowledgment modal only if WhatsApp is connected
      setShowAcknowledgment(isWhatsappConnected);

      if (storeAccounts && storeAccounts.length > 0) {
        logger.info('[Dashboard] Using accounts from Redux store:', storeAccounts);

        // Check if WhatsApp is in the accounts with status 'active' or 'pending'
        const whatsappAccount = storeAccounts.find(acc =>
          acc.platform === 'whatsapp' && (acc.status === 'active' || acc.status === 'pending'));

        if (whatsappAccount) {
          logger.info('[Dashboard] Found WhatsApp account with status:', whatsappAccount.status);
          // Use the accounts from Redux store directly
          setAccounts(storeAccounts);
          setSelectedPlatform('whatsapp');

          // Initialize socket connection
          if (!socketConnected) {
            logger.info('[Dashboard] Initializing socket connection');
            try {
              dispatch(connectSocket('whatsapp')); // Specify the platform
              logger.info('[Dashboard] Socket connection established');
            } catch (error) {
              logger.error('[Dashboard] Socket connection failed:', error);
            }
          }
        } else {
          // No WhatsApp account found, but we still have other accounts
          logger.info('[Dashboard] No WhatsApp account found in Redux store');
          setAccounts(storeAccounts);
        }

        // Fetch contacts if needed
        if (contacts.length === 0) {
          logger.info('[Dashboard] Fetching contacts for connected platforms');
          try {
            dispatch(fetchContacts());
          } catch (error) {
            logger.error('[Dashboard] Failed to fetch contacts:', error);
          }
        }
      } else {
        // No accounts in Redux store, fallback to API check
        logger.info('[Dashboard] No accounts in Redux store, checking API');

        // CRITICAL FIX: Check Redux state first for WhatsApp connection status
        if (whatsappConnected) {
          logger.info('[Dashboard] WhatsApp connected according to Redux state');
          setAccounts([{
            id: 'whatsapp',
            platform: 'whatsapp',
            name: 'WhatsApp',
            status: 'active'
          }]);
          setSelectedPlatform('whatsapp');

          // Initialize socket connection
          if (!socketConnected) {
            logger.info('[Dashboard] Initializing socket connection');
            try {
              dispatch(connectSocket('whatsapp')); // Specify the platform
              logger.info('[Dashboard] Socket connection established');
            } catch (error) {
              logger.error('[Dashboard] Socket connection failed:', error);
            }
          }
        } else {
          // CRITICAL FIX: Add a button to fix WhatsApp connection status
          logger.info('[Dashboard] WhatsApp not connected, showing fix button');
          setShowFixButton(true);

          // Fallback to API check if Redux state says not connected
          try {
            logger.info('[Dashboard] Checking connected platforms via API');
            const response = await api.get('/api/v1/matrix/whatsapp/status');

            if (response.data && response.data.status === 'active') {
              logger.info('[Dashboard] WhatsApp platform connected via API check');
              setAccounts([{
                id: 'whatsapp',
                platform: 'whatsapp',
                name: 'WhatsApp',
                status: 'active'
              }]);
              setSelectedPlatform('whatsapp');
              setShowFixButton(false);

              // Initialize socket connection
              if (!socketConnected) {
                logger.info('[Dashboard] Initializing socket connection');
                try {
                  dispatch(connectSocket('whatsapp')); // Specify the platform
                  logger.info('[Dashboard] Socket connection established');
                } catch (error) {
                  logger.error('[Dashboard] Socket connection failed:', error);
                }
              }
            } else {
              // No WhatsApp platform connected, show empty state
              // Note: 'matrix' alone is not considered a connected platform for UI purposes
              // We'll still include it in accounts for backend purposes
              setAccounts([{
                id: 'matrix',
                platform: 'matrix',
                name: 'Matrix',
                status: 'active'
              }]);
              logger.info('[Dashboard] Only Matrix connected, no WhatsApp');
            }
          } catch (error) {
            logger.error('[Dashboard] Error checking connected platforms:', error);
            setAccounts([]);
          }
        }
      }
    };

    initializeFromStore();
  }, [dispatch, socketConnected, whatsappConnected, contacts.length, storeAccounts, session]);

  // useEffect(() => {
  //   // Initialize with WhatsApp account if connected
  //   const initializeAccounts = async () => {
  //     try {
  //       const response = await api.get('/matrix/whatsapp/status');
  //       if (response.data.status === 'connected') {
  //         setAccounts([
  //           {
  //             id: 'whatsapp',
  //             platform: 'whatsapp',
  //             name: 'WhatsApp'
  //           }
  //         ]);
  //         setSelectedPlatform('whatsapp');
  //       }
  //     } catch (error) {
  //       logger.error('[Dashboard] Error fetching WhatsApp status:', error);
  //     }
  //   };

  //   initializeAccounts();
  // }, []);

  // Ensure socket connection is established after page refresh
  useEffect(() => {
    // If we have a WhatsApp account but no socket connection, initialize it
    const hasWhatsappAccount = accounts.some(acc => acc.platform === 'whatsapp');

    // CRITICAL FIX: If whatsappConnected is true but accounts array is empty, add WhatsApp account
    if (whatsappConnected && accounts.length === 0) {
      logger.info('[Dashboard] WhatsApp is connected but accounts array is empty, adding WhatsApp account');
      setAccounts([{
        id: 'whatsapp',
        platform: 'whatsapp',
        name: 'WhatsApp',
        status: 'active'
      }]);
      setSelectedPlatform('whatsapp');
    }

    // CRITICAL FIX: Always initialize socket connection if WhatsApp is connected
    if ((hasWhatsappAccount || whatsappConnected) && !socketConnected) {
      logger.info('[Dashboard] Initializing socket connection after page refresh');
      try {
        dispatch(connectSocket('whatsapp'));
        logger.info('[Dashboard] Socket connection initialized after page refresh');
      } catch (error) {
        logger.error('[Dashboard] Error initializing socket connection after page refresh:', error);
      }
    }
  }, [accounts, socketConnected, selectedPlatform, dispatch, whatsappConnected]);

  const handlePlatformSelect = (platform) => {
    setSelectedPlatform(platform);
    // Reset selected contact when platform changes
    setSelectedContactId(null);
  };

  const handleContactSelect = (contact) => {
    logger.info('[Dashboard] Contact selected:', contact);
    setSelectedContactId(contact.id);
    // Hide contact list on mobile when a contact is selected
    setIsContactListVisible(false);
  };

  const handleBackToContacts = () => {
    setIsContactListVisible(true);
    setSelectedContactId(null);
  };

  const handleViewToggle = (showAnalytics) => {
    setIsAnalyticsView(showAnalytics);
    logger.info(`[Dashboard] Switched to ${showAnalytics ? 'Analytics' : 'Messaging'} view`);
  };

  // Handle tour popup actions
  const handleStartTour = () => {
    setShowTourPopup(false);
    setShowConnectionModal(true);
  };

  const handleSkipTour = () => {
    setShowTourPopup(false);
  };

  // Handle platform connection modal actions
  const handleConnectionComplete = () => {
    // Refresh contacts after connection is complete
    dispatch(fetchContacts());
  };



  // Only render when component is mounted and initialized
  if (!isMounted) {
    return (
      <div className="flex h-screen bg-neutral-900 items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-white mb-4">Loading Dashboard...</h2>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Tour popup - Only show when no WhatsApp is connected */}
      {showTourPopup && !whatsappConnected && !isWhatsAppConnected(session?.user?.id) && (
        <TourPopup
          onStartTour={handleStartTour}
          onSkipTour={handleSkipTour}
        />
      )}

      {/* Platform connection modal */}
      <PlatformConnectionModal
        isOpen={showConnectionModal}
        onClose={() => setShowConnectionModal(false)}
        onConnectionComplete={handleConnectionComplete}
      />

      <AcknowledgmentModal
        isOpen={showAcknowledgment}
        onClose={() => setShowAcknowledgment(false)}
        whatsappConnected={whatsappConnected}
        userId={session?.user?.id}
      />

      {/* AI Suggestion Feedback Popup */}
      <AISuggestionFeedback
        isOpen={showFeedbackPopup}
        onClose={() => setShowFeedbackPopup(false)}
      />

      {/* Logout Modal */}
      <LogoutModal isOpen={showLogoutModal} onClose={() => setShowLogoutModal(false)} />

      <div className="flex h-screen bg-dark">
        {/* Mobile Menu Button */}
        <button
          onClick={() => setIsSidebarOpen(!isSidebarOpen)}
          className={`lg:hidden w-auto fixed top-4 left-4 z-50 p-2 bg-neutral-800 rounded-lg text-white ${
            (selectedContactId && !isContactListVisible) || isAnalyticsView ? 'hidden' : 'block'
          }`}
        >
          {isSidebarOpen ? <FiX className='w-5 h-5' /> : <FiMenu className='w-5 h-5' />}
        </button>

        {/* Sidebar */}
        <div className={`fixed lg:relative lg:w-[13rem] bg-neutral-900 h-full transition-transform duration-300 ease-in-out z-40 ${
          isSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}>
          <Sidebar
            accounts={accounts}
            selectedPlatform={selectedPlatform}
            onPlatformSelect={handlePlatformSelect}
            onViewToggle={handleViewToggle}
            isAnalyticsView={isAnalyticsView}
            onConnectPlatform={() => setShowConnectionModal(true)}
          />
        </div>

        {/* Main Content Area - Conditionally render based on connected platforms and view mode */}
        {/* CRITICAL FIX: Simplified condition to ensure something always renders */}
        {!whatsappConnected && !accounts.some(account => account.platform === 'whatsapp') ? (
          // No platforms connected or no WhatsApp account - Show connect platform message
          <div className="flex-1 flex items-center justify-center bg-neutral-900">
            <div className="text-center p-8 max-w-md">
              {showFixButton ? (
                <>
                  <h2 className="text-2xl font-bold text-white mb-4">WhatsApp Connection Issue</h2>
                  <p className="text-gray-400 mb-6 text-center">
                    We detected that your WhatsApp connection status is not properly reflected.
                    Click the button below to fix this issue.
                  </p>
                  <button
                    onClick={() => setShowConnectionModal(true)}
                    className="px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
                  >
                    Connect WhatsApp
                  </button>
                </>
              ) : (
                <>
                  <h2 className="text-2xl font-bold text-white mb-4">Connect a Messaging Platform</h2>
                  <p className="text-gray-400 mb-6">You need to connect a messaging platform to start using DailyFix.</p>
                  <button
                    onClick={() => setShowConnectionModal(true)}
                    className="px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
                  >
                    Connect WhatsApp
                  </button>
                </>
              )}
            </div>
          </div>
        ) : isAnalyticsView ? (
          // Analytics Dashboard View
          <div className="flex-1 overflow-auto bg-neutral-900 p-4">
            <AnalyticsDashboard />
          </div>
        ) : (
          // WhatsApp Interface (Contact List + Chat View)
          <>
            {/* Contact List Panel */}
            <div className={`fixed lg:relative lg:w-[23.5rem] bg-neutral-900 h-full transition-transform duration-300 ease-in-out z-30 w-full ${
              !selectedContactId || isContactListVisible ? 'translate-x-0' : 'translate-x-[-100%] lg:translate-x-0'
            } ${isSidebarOpen ? 'translate-x-[13rem] lg:translate-x-0' : 'translate-x-0'}`}>
              <div className="h-full flex flex-col">
                <div className="flex-1 overflow-y-auto w-full">
                  <WhatsAppContactList
                    onContactSelect={handleContactSelect}
                    selectedContactId={selectedContactId}
                  />
                </div>
              </div>
            </div>

            {/* Chat Content Area */}
            <div className={`fixed lg:relative flex-1 flex flex-col bg-neutral-900 transition-transform duration-300 ease-in-out w-full lg:w-auto h-full z-30 ${
              selectedContactId && !isContactListVisible ? 'translate-x-0' : 'translate-x-[100%] lg:translate-x-0'
            }`}>
              {/* Mobile Back Button */}
              {selectedContactId && !isContactListVisible && (
                <div className="lg:hidden sticky top-0 left-0 right-0 p-4 bg-neutral-900 border-b border-white/10 flex items-center">
                  <button
                    onClick={handleBackToContacts}
                    className="p-2 bg-neutral-800 rounded-lg text-white flex items-center gap-3"
                  >
                    <IoArrowBack size={20} />
                    <span className="text-sm font-medium">Back to contacts</span>
                  </button>
                </div>
              )}

              {/* Chat View */}
              <div className="flex-1 overflow-hidden">
                <ChatView selectedContact={selectedContact} />
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}

export default Dashboard;
