import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { handleError, ErrorTypes, AppError } from '../utils/errorHandler';
import api from '../utils/api';
import { toast } from 'react-hot-toast';
import ProtocolSelection from '../components/ProtocolSelection';
import WhatsAppBridgeSetup from '../components/WhatsAppBridgeSetup';
import { useDispatch, useSelector } from 'react-redux';
import { 
  fetchOnboardingStatus, 
  updateOnboardingStep,
  setOnboardingError,
  selectOnboardingState,
  ONBOARDING_ROUTES 
} from '../store/slices/onboardingSlice';
import { onboardingService } from '../services/onboardingService';
import stepOne from '../images/Guide1.png'
import stepTwo from '../images/Guide2.png'
import stepThree from '../images/Guide3.png'
import stepFour from '../images/Guide4.png'
import stepFive from '../images/Guide5.png'
import stepSix from '../images/Guide6.png'
import stepSeven from '../images/Guide7.png'
import { FiX } from 'react-icons/fi';
import bgLeft from '../images/loginbg.png'
import bgRight from '../images/loginbg2.png'




// Onboarding steps configuration
const ONBOARDING_STEPS = {
  WELCOME: 'welcome',
  PROTOCOL_SELECTION: 'protocol_selection',
  MATRIX: 'matrix',
  WHATSAPP: 'whatsapp',
  COMPLETE: 'complete'
};

// Add step metadata
const STEP_METADATA = {
  [ONBOARDING_STEPS.WELCOME]: {
    title: 'Welcome to DailyFix',
    description: 'Let\'s get you set up with a secure messaging protocol.',
    nextSteps: ['protocol_selection']
  },
  [ONBOARDING_STEPS.PROTOCOL_SELECTION]: {
    title: 'Select Your Protocol',
    description: 'Choose Matrix as your secure messaging protocol.',
    nextSteps: ['matrix']
  },
  [ONBOARDING_STEPS.MATRIX]: {
    title: 'Connect Matrix',
    description: 'Set up your Matrix account for secure messaging.',
    nextSteps: ['whatsapp']
  },
  [ONBOARDING_STEPS.WHATSAPP]: {
    title: 'Connect WhatsApp',
    description: 'Link your WhatsApp account to start syncing messages through Matrix.',
    nextSteps: ['complete']
  },
  [ONBOARDING_STEPS.COMPLETE]: {
    title: 'Setup Complete',
    description: 'You\'re all set! Redirecting to dashboard...',
    nextSteps: []
  }
};

// Step validation
const isValidStep = (step) => Object.values(ONBOARDING_STEPS).includes(step);

const getNextStep = (currentStep, connectedPlatforms = []) => {
  switch (currentStep) {
    case ONBOARDING_STEPS.WELCOME:
      return ONBOARDING_STEPS.PROTOCOL_SELECTION;
    case ONBOARDING_STEPS.PROTOCOL_SELECTION:
      return ONBOARDING_STEPS.MATRIX;
    case ONBOARDING_STEPS.MATRIX:
      return connectedPlatforms.includes('matrix') ? ONBOARDING_STEPS.WHATSAPP : ONBOARDING_STEPS.MATRIX;
    case ONBOARDING_STEPS.WHATSAPP:
      return connectedPlatforms.includes('whatsapp') ? ONBOARDING_STEPS.COMPLETE : ONBOARDING_STEPS.WHATSAPP;
    case ONBOARDING_STEPS.COMPLETE:
      return null;
    default:
      return ONBOARDING_STEPS.WELCOME;
  }
};

// Default Matrix homeserver URL
const DEFAULT_MATRIX_HOMESERVER = 'https://dfix-hsbridge.duckdns.org';
const MATRIX_SERVER_DOMAIN = 'dfix-hsbridge.duckdns.org';

// Step components
const WelcomeStep = ({ onNext }) => {
  const { loading } = useSelector(selectOnboardingState);
  const { user } = useSelector(state => state.auth);
  const [transProg, setTransProg] = useState(false)

  // Always show the Get Started button
  const showGetStarted = true;
  
  console.log('WelcomeStep state log-2: ', { showGetStarted, loading });

  return (
    <div className="max-w-2xl bg-transparent backdrop-blur-sm p-8 mx-auto text-center">
      <h1 className="text-4xl font-bold mb-6">{STEP_METADATA[ONBOARDING_STEPS.WELCOME].title}</h1>
      <p className="text-xl mb-8">{STEP_METADATA[ONBOARDING_STEPS.WELCOME].description}</p>
      {showGetStarted && (
      <button
          onClick={() => {
            setTransProg(true)
            onNext(ONBOARDING_STEPS.PROTOCOL_SELECTION)
          }
        }
        className="bg-gradient-to-r from-purple-400 to-pink-600 duration-300 ease-in-out hover:bg-gradient-to-r hover:from-lime-500 delay-100 hover:to-lime-600 text-white font-bold py-3 px-6 rounded-lg transition-colors"
        >
          {!transProg ? 'Get Started' : 'Getting Started.. Hold on!'}
        </button>
      )}
    </div>
  );
};

// const GuideModal = ({ isOpen, onClose }) => {
//   const modalRef = useRef();
//   const [currentStep, setCurrentStep] = useState(1);

//   useEffect(() => {
//     const handleClickOutside = (event) => {
//       if (modalRef.current && !modalRef.current.contains(event.target)) {
//         onClose();
//       }
//     };

//     if (isOpen) {
//       document.addEventListener('mousedown', handleClickOutside);
//     }

//     return () => {
//       document.removeEventListener('mousedown', handleClickOutside);
//     };
//   }, [isOpen, onClose]);

//   const steps = [
//     {
//       image: stepOne,
//       description: "Click 'Sign In' on the Element website at the top of the page"
//     },
//     {
//       image: stepTwo,
//       description: "Select 'Element-web' from the available options"
//     },
//     {
//       image: stepThree,
//       description: "Click 'Create Matrix Account' to start the registration process"
//     },
//     {
//       image: stepFour,
//       description: "Replace the default homeserver with 'https://dfix-hsbridge.duckdns.org' and click 'Continue'"
//     },
//     {
//       image: stepFive,
//       description: "Enter your desired username and password, then register. You can click 'Cancel' when it tries to create keys"
//     },
//     {
//       image: stepSix,
//       description: "Once logged in to Element-web, select your profile from the top-left corner"
//     },
//     {
//       image: stepSeven,
//       description: "Copy your full username by clicking the copy icon as shown, then paste it here to login"
//     }
//   ];

//   if (!isOpen) return null;

//   return (
//     <div className="fixed inset-0 bg-black/75 flex items-center justify-center z-50 p-4 overflow-y-auto">
//       <div 
//         ref={modalRef}
//         className="bg-[#24283b] rounded-lg p-6 max-w-4xl w-full mx-auto my-8 space-y-6"
//       >
//         <div className="flex justify-between items-center border-b border-gray-700 pb-4">
//           <h3 className="text-xl font-medium text-white">Matrix Account Creation Guide</h3>
//           <button
//             onClick={onClose}
//             className="text-gray-400 hover:text-white transition-colors"
//           >
//             <FiX className="w-5 h-5" />
//           </button>
//         </div>

//         <div className="space-y-8">
//           {/* Step indicator */}
//           <div className="flex justify-center gap-2">
//             {steps.map((_, index) => (
//               <button
//                 key={index}
//                 onClick={() => setCurrentStep(index + 1)}
//                 className={`w-3 h-3 rounded-full transition-colors ${
//                   currentStep === index + 1 
//                     ? 'bg-blue-500' 
//                     : 'bg-gray-600 hover:bg-gray-500'
//                 }`}
//               />
//             ))}
//           </div>

//           {/* Current step content */}
//           <div className="space-y-4">
//             <div className="relative aspect-video rounded-lg overflow-hidden bg-black/50">
//               <img 
//                 src={steps[currentStep - 1].image} 
//                 alt={`Step ${currentStep}`}
//                 className="w-full h-full object-contain"
//               />
//             </div>
//             <div className="flex items-center justify-between">
//               <button
//                 onClick={() => setCurrentStep(prev => Math.max(1, prev - 1))}
//                 disabled={currentStep === 1}
//                 className="px-4 py-2 text-gray-400 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed"
//               >
//                 Previous
//               </button>
//               <div className="text-center">
//                 <div className="text-lg font-medium text-white mb-2">
//                   Step {currentStep} of {steps.length}
//                 </div>
//                 <p className="text-gray-300">
//                   {steps[currentStep - 1].description}
//                 </p>
//               </div>
//               <button
//                 onClick={() => setCurrentStep(prev => Math.min(steps.length, prev + 1))}
//                 disabled={currentStep === steps.length}
//                 className="px-4 py-2 text-gray-400 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed"
//               >
//                 Next
//       </button>
//             </div>
//           </div>
//         </div>

//         <div className="border-t border-gray-700 pt-4 mt-6 text-center">
//           <p className="text-gray-300 text-sm">
//             Still encountering issues? Send a account creation helpline request at{' '}
//             <a 
//               href="mailto:ksknew76105@gmail.com" 
//               className="text-blue-400 hover:text-blue-300"
//             >
//               ksknew76105@gmail.com
//             </a>
//             <br />
//             Our team will create an account for you and send the credentials to your email soon. Thanks!
//           </p>
//         </div>
//       </div>
//     </div>
//   );
// };

const MatrixSetupStep = ({ onNext }) => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { loading, error, connectedPlatforms } = useSelector(state => state.onboarding);
  const { session } = useSelector(state => state.auth);
  const [matrixCredentials, setMatrixCredentials] = useState({
    userId: '',
    password: '',
    homeserver: DEFAULT_MATRIX_HOMESERVER
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState(null);
  const [showGuide, setShowGuide] = useState(false);

  // Clear form error when credentials change
  useEffect(() => {
    if (formError) {
      setFormError(null);
    }
  }, [matrixCredentials]);

  // const handleBack = async () => {
  //   try {
  //     setFormError(null);
  //     await dispatch(updateOnboardingStep({ 
  //       step: ONBOARDING_STEPS.PROTOCOL_SELECTION 
  //     })).unwrap();
  //     navigate('/onboarding/protocol_selection');
  //     } catch (error) {
  //     console.error('Navigation error:', error);
  //     toast.error('Failed to navigate back. Please try again.');
  //   }
  // };

  // const validateForm = () => {
  //   if (!matrixCredentials.userId.trim()) {
  //     setFormError('Matrix User ID is required');
  //     return false;
  //   }
  //   if (!matrixCredentials.userId.includes(':')) {
  //     setFormError('Invalid Matrix User ID format. Should be like @user:domain.com');
  //     return false;
  //   }
  //   if (!matrixCredentials.password) {
  //     setFormError('Password is required');
  //     return false;
  //   }
  //   if (!matrixCredentials.homeserver.startsWith('http')) {
  //     setFormError('Invalid homeserver URL. Should start with http:// or https://');
  //     return false;
  //   }
  //   return true;
  // };

  // const handleSubmit = async (e) => {
  //   e.preventDefault();
    
  //   // Clear previous errors
  //   setFormError(null);
    
  //   // Validate form
  //   if (!validateForm()) {
  //     return;
  //   }

  //   try {
  //     if (!session?.user?.id) {
  //       throw new Error('No valid session found');
  //     }

  //     setIsSubmitting(true);
  //     const loadingToast = toast.loading('Connecting to Matrix...');

  //     const response = await api.post('/matrix/initialize', {
  //       userId: matrixCredentials.userId,
  //       password: matrixCredentials.password,
  //       homeserver: matrixCredentials.homeserver
  //     });

  //     if (response.data.status === 'active') {
  //       // The backend will handle updating the step to 'whatsapp'
  //       // We just need to navigate to the next step
  //       toast.success('Matrix connection successful!');
  //       toast.dismiss(loadingToast);
  //       navigate('/onboarding/whatsapp');
  //     } else {
  //       setFormError(response.data.message || 'Failed to connect to Matrix. Please check your credentials.');
  //       toast.error(response.data.message || 'Connection failed');
  //       toast.dismiss(loadingToast);
  //     }
  //   } catch (error) {
  //     logger.error('[MatrixSetupStep] Error:', error);
  //     setFormError(error.message || 'Failed to connect to Matrix');
  //     toast.error(error.message || 'Connection failed');
  //     toast.dismiss(loadingToast);
  //   } finally {
  //     setIsSubmitting(false);
  //   }
  // };

  return (
    // <div className="max-w-2xl mx-auto p-8">
    //   <div className="mt-8 text-center border-2 border-gray-200 rounded-lg p-4 mb-2">
    //     <p className="text-sm text-gray-200">
    //       Your Matrix account will be used to bridge with other messaging platforms.
    //       Make sure you have access to the Matrix homeserver.
    //     </p>
    //     <div className="flex items-center gap-6 mt-5 ml-2">
    //       <div>
    //         <img src="https://element.io/blog/content/images/2020/07/Logomark---white-on-green.png" alt="Element" className="w-24 h-10" />
    //       </div>
    //     <ol className="list-decimal text-left list-inside mb-8 space-y-4 text-gray-400 ml-4">
    //         <li>You can get your own Matrix account here: <a href="https://element.io/" target="_blank" rel="noopener noreferrer" className="text-primary hover:text-primary-dark">Click here and go to Signin, Element-web to create</a> with the given homeServer: <span className='text-lime-300'>https://dfix-hsbridge.duckdns.org</span></li>
    //         <li>Create a Matrix account or sign in directly below with your userID, password directly below 🙂</li>
    //         <li>Keep Element open to receive the invitation</li>
    //         <li>You could come here right after you have created your Matrix account and proceed seamlessly ✨</li>
    //         <li className='font-semibold text-red-500'><span className='font-bold mr-1'>Important:</span>After creating an account, DO NOT TRY CONNECTING TO MATRIX DIRECTLY AFTER YOU CREATE YOUR ACCOUNT! Please email us your userName of your account at 'ksknew76105@gmail.com', so that our team could provision your whatsapp permissions accordingly. After we confirm your allocation through  revert on email, You could start connecting here.</li>
    //       </ol>

    //       <button 
    //         className='text-lg font-semibold p-4 rounded-lg bg-blue-500 text-gray-200 hover:bg-blue-600 transition-colors' 
    //         onClick={() => setShowGuide(true)}
    //       >
    //         Still Confused? Click here!
    //       </button>
    //     </div>
    //   </div>
    //   <div className="flex items-center justify-between mb-6 mt-4">
    //       <button
    //       onClick={handleBack}
    //       className="flex items-center text-gray-400 hover:text-white transition-colors w-auto"
    //       disabled={isSubmitting}
    //     >
    //       <svg
    //         xmlns="http://www.w3.org/2000/svg"
    //         className="h-5 w-5 mr-2"
    //         viewBox="0 0 20 20"
    //         fill="currentColor"
    //       >
    //         <path
    //           fillRule="evenodd"
    //           d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z"
    //           clipRule="evenodd"
    //         />
    //       </svg>
    //       Back to Protocol Selection
    //       </button>
    //     <h2 className="text-2xl font-bold text-white">Matrix Protocol Setup</h2>
    //   </div>
      
    //   {formError && (
    //     <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
    //       <div className="flex items-center text-red-500">
    //         <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
    //           <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
    //         </svg>
    //         <span>{formError}</span>
    //       </div>
    //       <p className="mt-2 text-sm text-red-400">
    //         Please check your credentials and try again. Make sure you can log into Element with these credentials.
    //       </p>
    //     </div>
    //   )}
      
    //   <form onSubmit={handleSubmit} className="space-y-6">
    //     <div>
    //       <label className="block text-sm font-medium text-gray-400 mb-2">
    //         Matrix User ID
    //       </label>
    //       <input
    //         type="text"
    //         value={matrixCredentials.userId}
    //         onChange={(e) => setMatrixCredentials(prev => ({
    //           ...prev,
    //           userId: e.target.value
    //         }))}
    //         className={`w-full p-3 bg-dark-lighter border rounded-lg text-white transition-colors ${
    //           formError && !matrixCredentials.userId ? 'border-red-500' : 'border-gray-700'
    //         }`}
    //         placeholder="@username:example.com"
    //         disabled={isSubmitting}
    //         required
    //       />
    //     </div>

    //     <div>
    //       <label className="block text-sm font-medium text-gray-400 mb-2">
    //         Password
    //       </label>
    //       <input
    //         type="password"
    //         value={matrixCredentials.password}
    //         onChange={(e) => setMatrixCredentials(prev => ({
    //           ...prev,
    //           password: e.target.value
    //         }))}
    //         className={`w-full p-3 bg-dark-lighter border rounded-lg text-white transition-colors ${
    //           formError && !matrixCredentials.password ? 'border-red-500' : 'border-gray-700'
    //         }`}
    //         placeholder="Enter your password"
    //         disabled={isSubmitting}
    //         required
    //       />
    //     </div>

    //     <div>
    //       <label className="block text-sm font-medium text-gray-400 mb-2">
    //         Homeserver URL
    //       </label>
    //       <input
    //         type="text"
    //         value={matrixCredentials.homeserver}
    //         onChange={(e) => setMatrixCredentials(prev => ({
    //           ...prev,
    //           homeserver: e.target.value
    //         }))}
    //         className={`w-full p-3 bg-dark-lighter border rounded-lg text-white transition-colors ${
    //           formError && !matrixCredentials.homeserver.startsWith('http') ? 'border-red-500' : 'border-gray-700'
    //         }`}
    //         placeholder="https://matrix.example.com"
    //         disabled={isSubmitting}
    //         required
    //       />
    //     </div>

    //     <button
    //       type="submit"
    //       disabled={isSubmitting}
    //       className={`w-full py-3 px-4 rounded-lg font-medium ${
    //         isSubmitting
    //           ? 'bg-primary/50 cursor-not-allowed'
    //           : 'bg-primary hover:bg-primary/90'
    //       } text-white transition-colors flex items-center justify-center`}
    //     >
    //       {isSubmitting ? (
    //         <>
    //           <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
    //             <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
    //             <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
    //           </svg>
    //           Connecting...
    //         </>
    //       ) : (
    //         'Connect to Matrix'
    //       )}
    //     </button>
    //   </form>

    //   <GuideModal 
    //     isOpen={showGuide} 
    //     onClose={() => setShowGuide(false)} 
    //   />
    // </div>
    <div className='max-w-2xl mx-auto p-8'>
      <h1>Preparing everything!!, Setting up Whatsapp.</h1>
    </div>
  );
};

// const PlatformSelectionStep = ({ onNext }) => {
//   const navigate = useNavigate();
//   const [isConnecting, setIsConnecting] = useState(false);
//   const [selectedPlatform, setSelectedPlatform] = useState(null);
//   const { session } = useSelector(state => state.auth);

//   const platforms = [
//     { id: 'whatsapp', name: 'WhatsApp', icon: '📱', requiresQR: true },
//     { id: 'telegram', name: 'Telegram', icon: '✈️', requiresToken: true },
//     { id: 'slack', name: 'Slack', icon: '💬', requiresOAuth: true },
//     { id: 'discord', name: 'Discord', icon: '🎮', requiresOAuth: true }
//   ];

//   const handlePlatformSelect = async (platform) => {
//     try {
//       setIsConnecting(true);
//       setSelectedPlatform(platform);

//       // Show immediate loading toast
//       const loadingToast = toast.loading(`Connecting to ${platform.name}...`);

//       // Ensure auth token is set
//       const token = session?.access_token;
//       if (!token) {
//         throw new Error('No authentication token available');
//       }

//       // Store fresh token
//       localStorage.setItem('auth_token', token);

//       // Set auth header
//       api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      
//       // For OAuth platforms, generate and store state
//       let requestData = {};
//       if (platform.requiresOAuth) {
//         // Generate state
//         const state = crypto.randomUUID();
        
//         // Store state in multiple locations for redundancy
//         sessionStorage.setItem('discordOAuthState', state);
//         localStorage.setItem('discordOAuthState', state);
//         document.cookie = `discordOAuthState=${state};path=/;max-age=300`; // 5 minutes expiry
        
//         // Store metadata
//         const stateData = {
//           state,
//           timestamp: new Date().toISOString(),
//           origin: window.location.origin,
//           initiatedFrom: window.location.href
//         };
//         localStorage.setItem('discordOAuthMetadata', JSON.stringify(stateData));
        
//         // Add state to request
//         requestData = { 
//           state,
//           redirect_uri: `${window.location.origin}/oauth/discord/callback`
//         };
        
//         console.debug('OAuth state generated:', {
//           state,
//           platform: platform.id,
//           timestamp: new Date().toISOString()
//         });
//       }
      
//       // Initiate platform connection
//       const response = await api.post(`connect/${platform.id}/initiate`, requestData);
//       console.log('Platform initiation response:', response.data);

//       // Dismiss loading toast
//       toast.dismiss(loadingToast);

//       if (platform.requiresOAuth && response.data.url) {
//         // For OAuth platforms (like Discord), redirect to auth URL
//         window.location.href = response.data.url;
//         return;
//       }

//       // For non-OAuth platforms
//       if (response.data.status === 'pending' || response.data.status === 'initializing') {
//         if (platform.requiresQR) {
//           navigate('/connect/whatsapp');
//         } else if (platform.requiresToken) {
//           navigate('/connect/telegram');
//         }
//       } else if (response.data.status === 'connected') {
//         toast.success(`Successfully connected to ${platform.name}`);
//         navigate('/dashboard');
//       } else {
//         throw new Error(`Unexpected status: ${response.data.status}`);
//       }
//     } catch (error) {
//       console.error(`${platform.name} connection error:`, error);
      
//       // Clean up OAuth state on error
//       if (platform.requiresOAuth) {
//         sessionStorage.removeItem('discordOAuthState');
//         localStorage.removeItem('discordOAuthState');
//         localStorage.removeItem('discordOAuthMetadata');
//         document.cookie = 'discordOAuthState=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
//       }
      
//       toast.error(error.response?.data?.message || `Failed to connect to ${platform.name}. Please try again.`);
//     } finally {
//       setIsConnecting(false);
//       setSelectedPlatform(null);
//     }
//   };

//   return (
//     <div className="max-w-2xl mx-auto p-8">
//       <h2 className="text-2xl font-bold mb-6">Choose Your Messaging Platform</h2>
//       <div className="grid grid-cols-2 gap-4">
//         {platforms.map(platform => (
//           <button
//             key={platform.id}
//             onClick={() => handlePlatformSelect(platform)}
//             disabled={isConnecting}
//             className={`p-4 border border-gray-700 rounded-lg hover:border-primary transition-colors text-left relative ${
//               isConnecting && selectedPlatform?.id === platform.id ? 'opacity-50' : ''
//             }`}
//           >
//             <span className="text-2xl mr-2">{platform.icon}</span>
//             <span className="font-medium">{platform.name}</span>
//             {isConnecting && selectedPlatform?.id === platform.id && (
//               <div className="absolute inset-0 bg-dark/50 flex items-center justify-center">
//                 <div className="flex flex-col items-center space-y-2">
//                   <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full"></div>
//                   <span className="text-sm text-gray-300">Initializing...</span>
//                 </div>
//               </div>
//             )}
//           </button>
//         ))}
//       </div>
//     </div>
//   );
// };

const WhatsAppSetupStep = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { loading, error, matrixConnected, whatsappConnected, currentStep, isReloginFlow } = useSelector(selectOnboardingState);
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    let mounted = true;

    const checkStatus = async () => {
      try {
        const onboardingStatus = await dispatch(fetchOnboardingStatus()).unwrap();
        console.log('[WhatsAppSetupStep] Status check:', onboardingStatus);
        
        if (!mounted) return;

        // Only redirect if explicitly not connected and not in relogin flow
        if (onboardingStatus.matrixConnected === false && !isReloginFlow) {
          dispatch(setOnboardingError('Matrix connection is required'));
            await dispatch(updateOnboardingStep({ step: 'matrix' })).unwrap();
          navigate(ONBOARDING_ROUTES.MATRIX, { replace: true });
          return;
        }
      } catch (error) {
        console.error('Error checking status:', error);
        if (mounted) {
          dispatch(setOnboardingError('Failed to check connection status. Please try again.'));
        }
      } finally {
        if (mounted) {
          setIsChecking(false);
        }
      }
    };

    checkStatus();
    return () => {
      mounted = false;
    };
  }, [dispatch, navigate, isReloginFlow]);

  const handleComplete = async () => {
    try {
      await dispatch(updateOnboardingStep({ 
        step: 'complete',
        data: { 
          whatsappConnected: true,
          matrixConnected: true,
          isComplete: true,
          isReloginFlow: false,
          connectedPlatforms: ['matrix', 'whatsapp']
        }
      })).unwrap();

      navigate(ONBOARDING_ROUTES.COMPLETE, { replace: true });
    } catch (error) {
      logger.error('[WhatsAppSetupStep] Error completing setup:', error);
      dispatch(setOnboardingError('Failed to complete setup. Please try again.'));
    }
  };

  if (isChecking) {
    return (
      <div className="max-w-lg mx-auto text-center p-8">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4"></div>
        <p className="text-gray-300">Checking connection status...</p>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto p-8">
      <h2 className="text-2xl font-bold mb-4">
        {isReloginFlow ? 'Reconnect WhatsApp' : STEP_METADATA[ONBOARDING_STEPS.WHATSAPP].title}
      </h2>
      <p className="text-gray-300 mb-8">
        {isReloginFlow 
          ? 'Scan the QR code to reconnect your WhatsApp account'
          : STEP_METADATA[ONBOARDING_STEPS.WHATSAPP].description}
      </p>
      
      {whatsappConnected ? (
        <div className="text-center">
          <div className="text-green-500 mb-4">✓</div>
          <p className="text-green-400 mb-4">WhatsApp connected successfully!</p>
          <button
            onClick={handleComplete}
            className="px-6 py-2 bg-primary text-white rounded hover:bg-primary-dark transition-colors"
          >
            Continue
          </button>
        </div>
      ) : (
        <WhatsAppBridgeSetup onComplete={handleComplete} />
      )}
    </div>
  );
};

const CompletionStep = () => {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const [hasAttempted, setHasAttempted] = useState(false);

  useEffect(() => {
    const redirectToDashboard = async () => {
      console.log('[CompletionStep] Redirecting to dashboard...');
      
      // Immediate redirect attempt
      navigate('/dashboard', { replace: true });
      
      // Safety timeout to ensure redirect happens
      const timeoutId = setTimeout(() => {
        console.log('[CompletionStep] Timeout triggered, forcing redirect...');
        window.location.href = '/dashboard';
      }, 3000);
      
      // If we've already attempted to update, just exit
      if (hasAttempted) {
        console.log('[CompletionStep] Already attempted update, skipping...');
        return () => clearTimeout(timeoutId);
      }

      try {
        setHasAttempted(true);
        console.log('[CompletionStep] Updating onboarding step to complete...');
        
        // Update onboarding step to complete with all necessary data
        await dispatch(updateOnboardingStep({ 
          step: 'complete',
          data: { 
            whatsappConnected: true,
            matrixConnected: true,
            isComplete: true,
            connectedPlatforms: ['matrix', 'whatsapp']
          }
        })).unwrap();
        
        console.log('[CompletionStep] Update successful, navigating to dashboard...');
      } catch (error) {
        // Log error but continue to dashboard
        console.error('[CompletionStep] Error in completion step:', error);
        // Single error toast instead of multiple
        toast.error('Note: Failed to save onboarding status, but continuing to dashboard...');
      }
      
      return () => clearTimeout(timeoutId);
    };

    redirectToDashboard();
  }, [dispatch, navigate, hasAttempted]);

  return (
    <div className="max-w-lg mx-auto text-center p-8">
      <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4"></div>
      <p className="text-gray-300">Completing setup and redirecting to dashboard...</p>
    </div>
  );
};

const Onboarding = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const dispatch = useDispatch();
  const { session } = useSelector(state => state.auth);
  const { currentStep, isComplete } = useSelector(state => state.onboarding);
  const navigationAttemptedRef = useRef(false);

  useEffect(() => {
    const checkAndRedirect = async () => {
      if (!session) {
        navigate('/login');
        return;
      }

      try {
        const statusResponse = await onboardingService.getOnboardingStatus(true);
        
        // Handle both response formats
        const status = statusResponse.data || statusResponse;
        
        // Log what we're receiving
        console.log('[Onboarding] Status check response:', statusResponse);
        
        // Check for completion in both formats
        const isCompleted = 
          status.is_complete === true || 
          status.isComplete === true || 
          statusResponse.is_complete === true || 
          statusResponse.isComplete === true;
        
        console.log('[Onboarding] Is onboarding complete?', isCompleted);
        
        // If onboarding is complete, redirect to dashboard
        if (isCompleted) {
          console.log('[Onboarding] Redirecting to dashboard - onboarding complete');
          navigate('/dashboard', { replace: true });
          return;
        }

        // If we have a current step but are at root onboarding, redirect
        const currentStepValue = status.current_step || status.currentStep;
        if (currentStepValue && location.pathname === '/onboarding') {
          navigate(`/onboarding/${currentStepValue}`, { replace: true });
          return;
        }

        // Get step from URL
        const urlStep = location.pathname.split('/').pop();
        
        // Validate step and redirect if needed
        if (!isValidStep(urlStep)) {
          const validStep = currentStepValue || ONBOARDING_STEPS.WELCOME;
          navigate(`/onboarding/${validStep}`, { replace: true });
        }
      } catch (error) {
        console.error('Error in onboarding check:', error);
        toast.error('Failed to check onboarding status. Please try again.');
      }
    };

    checkAndRedirect();
  }, [session, location.pathname, navigate]);

  // Reset navigation attempt ref when component unmounts
  useEffect(() => {
    return () => {
      navigationAttemptedRef.current = false;
    };
  }, []);

  const handleStepChange = async (nextStep) => {
    try {
      await dispatch(updateOnboardingStep({ step: nextStep })).unwrap();
      if (nextStep === 'complete') {
        navigationAttemptedRef.current = true;
        navigate('/dashboard', { replace: true });
      } else {
        navigate(`/onboarding/${nextStep}`);
      }
    } catch (error) {
      console.error('Error changing step:', error);
      toast.error('Failed to proceed to next step. Please try again.');
    }
  };

  const renderStep = () => {
    switch (currentStep) {
      case ONBOARDING_STEPS.WELCOME:
        return <WelcomeStep onNext={handleStepChange} />;
      case ONBOARDING_STEPS.PROTOCOL_SELECTION:
        return <ProtocolSelection onNext={() => handleStepChange(ONBOARDING_STEPS.MATRIX)} />;
      case ONBOARDING_STEPS.MATRIX:
        return <MatrixSetupStep onNext={() => handleStepChange(ONBOARDING_STEPS.WHATSAPP)} />;
      case ONBOARDING_STEPS.WHATSAPP:
        return <WhatsAppSetupStep />;
      case ONBOARDING_STEPS.COMPLETE:
        return <CompletionStep />;
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-[#000000] text-white relative">
      <div
        className="absolute left-0 top-0 bottom-0 w-[30%]"
        style={{
          backgroundImage: `url(${bgLeft})`,
          backgroundRepeat: 'no-repeat',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      ></div>

      <div
        className="absolute right-0 top-0 bottom-0 w-[30%]"
        style={{
          backgroundImage: `url(${bgRight})`,
          backgroundRepeat: 'no-repeat',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      ></div>
      <div className="container mx-auto py-12 z-10 relative">
        {renderStep()}
      </div>
    </div>
  );
};

export default Onboarding;
