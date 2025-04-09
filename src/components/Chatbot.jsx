import React, { useState, useEffect, useRef } from 'react';
import { useSelector } from 'react-redux';
import api from '../utils/api';
import { FiMessageSquare, FiX, FiSend, FiBarChart2, FiClock, FiCalendar, FiCheck, FiArrowLeft } from 'react-icons/fi';
import { toast } from 'react-hot-toast';
import logger from '../utils/logger';
import { motion, AnimatePresence } from 'framer-motion';
import DFSpin from '../images/DF.png'

// Array of fun facts for the loading state
const SOCIAL_MEDIA_FUN_FACTS = [
  "WhatsApp processes over 65 billion messages daily.",
  "The average person spends over 2 hours on social media every day.",
  "Facebook was originally called 'TheFacebook' when it launched in 2004.",
  "Instagram was purchased by Facebook for $1 billion in 2012.",
  "Twitter's (Xs infact) original name was 'twttr' - vowels were added later.",
  "The first YouTube video was uploaded on April 23, 2005, titled 'Me at the zoo'.",
  "LinkedIn was founded in 2002, making it one of the oldest social networks.",
  "Over 500 hours of video are uploaded to YouTube every minute.",
  "WhatsApp was acquired by Facebook for $19 billion in 2014.",
  "TikTok reached 1 billion users faster than any other platform.",
  "The average time spent reading a tweet is just 1.5 seconds.",
  "Instagram's most-liked photo was of an egg, with over 55 million likes.",
  "The 'Stories' format was originally created by Snapchat before being adopted by other platforms.",
  "Discord was originally created for gamers but expanded to other communities.",
  "The first hashtag on Twitter was used in 2007."
];

// Time picker options
const HOURS = Array.from({ length: 12 }, (_, i) => (i + 1).toString());
const MINUTES = Array.from({ length: 60 }, (_, i) => i.toString().padStart(2, '0'));
const PERIODS = ['AM', 'PM'];

// Common timezones with labels
const TIMEZONES = [
  { value: 'Asia/Kolkata', label: 'IST (India)' },
  { value: 'America/New_York', label: 'EST (New York)' },
  { value: 'America/Los_Angeles', label: 'PST (Los Angeles)' },
  { value: 'Europe/London', label: 'GMT (London)' },
  { value: 'Europe/Paris', label: 'CET (Paris)' },
  { value: 'Asia/Tokyo', label: 'JST (Tokyo)' },
  { value: 'Asia/Singapore', label: 'SGT (Singapore)' },
  { value: 'Australia/Sydney', label: 'AEST (Sydney)' }
];

// Utility function for handling API errors consistently
const handleApiError = (error, setMessages, customMessage = null) => {
  logger.error('API call error:', error);

  // Remove any loading messages
  setMessages(prev => prev.filter(msg => !msg.isLoading));

  let errorMessage = customMessage || 'Sorry, there was an error processing your request.';

  // Add specific error info if available
  if (!error.response) {
    // Network error (status 0) - no response received
    errorMessage = 'Unable to connect to the server. Please check your connection and try again.';
  } else if (error.response) {
    // Handle Redis connection issues (service temporarily unavailable)
    if (error.response.status === 503) {
      errorMessage = 'The scheduling service is temporarily unavailable. Please try again in a few moments.';
    }
    // Handle API error messages
    else if (error.response.data && error.response.data.error && error.response.data.error.message) {
      errorMessage = `Error: ${error.response.data.error.message}`;
    }
  } else if (error.code === 'ECONNABORTED') {
    errorMessage = 'The request timed out. Please try again.';
  } else if (!navigator.onLine) {
    errorMessage = 'You appear to be offline. Please check your internet connection.';
  }

  // Add error message to chat
  setMessages(prev => [...prev, {
    text: errorMessage,
    isUser: false,
    isError: true
  }]);

  // Show toast notification for better visibility
  toast.error(errorMessage.replace('Error: ', ''));

  return errorMessage;
};

/**
 * Time Picker Component
 */
const TimePicker = ({ hour, minute, period, onChange }) => {
  const setHour = (h) => onChange({ hour: h, minute, period });
  const setMinute = (m) => onChange({ hour, minute: m, period });
  const setPeriod = (p) => onChange({ hour, minute, period: p });

  // Track if dropdown menus are open
  const [showHourDropdown, setShowHourDropdown] = useState(false);
  const [showMinuteDropdown, setShowMinuteDropdown] = useState(false);

  // Refs for click outside detection
  const hourDropdownRef = useRef(null);
  const minuteDropdownRef = useRef(null);

  // Create hour and minute option arrays
  const hourOptions = HOURS;
  const minuteOptions = Array.from({ length: 12 }, (_, i) => (i * 5).toString().padStart(2, '0'));

  // Handle clicks outside the dropdowns
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (hourDropdownRef.current && !hourDropdownRef.current.contains(event.target)) {
        setShowHourDropdown(false);
      }
      if (minuteDropdownRef.current && !minuteDropdownRef.current.contains(event.target)) {
        setShowMinuteDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  return (
    <div className="bg-neutral-800 rounded-lg p-4 shadow-lg">
      <h3 className="text-center text-white mb-4 font-medium">SELECT TIME</h3>

      <div className="flex items-center justify-center text-center">
        {/* Hour with dropdown */}
        <div className="relative w-20 mx-2" ref={hourDropdownRef}>
          <div
            className="bg-neutral-700 border border-neutral-600 rounded-lg overflow-hidden cursor-pointer"
            onClick={() => setShowHourDropdown(!showHourDropdown)}
          >
            <div className="w-full text-center text-4xl font-bold py-4 bg-transparent text-white">
              {hour}
            </div>
            <label className="block text-gray-400 text-xs mt-1">Hour</label>
          </div>

          {/* Hour dropdown */}
          {showHourDropdown && (
            <div className="absolute top-full left-0 w-full mt-1 bg-neutral-700 rounded-lg shadow-lg max-h-48 overflow-y-auto z-10">
              {hourOptions.map((h) => (
                <div
                  key={h}
                  className={`p-2 cursor-pointer hover:bg-neutral-600 ${h === hour ? 'bg-purple-600 text-white' : 'text-white'}`}
                  onClick={() => {
                    setHour(h);
                    setShowHourDropdown(false);
                  }}
                >
                  {h}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="text-white text-4xl font-bold">:</div>

        {/* Minute with dropdown */}
        <div className="relative w-20 mx-2" ref={minuteDropdownRef}>
          <div
            className="bg-neutral-700 border border-neutral-600 rounded-lg overflow-hidden cursor-pointer"
            onClick={() => setShowMinuteDropdown(!showMinuteDropdown)}
          >
            <div className="w-full text-center text-4xl font-bold py-4 bg-transparent text-white">
              {minute}
            </div>
            <label className="block text-gray-400 text-xs mt-1">Minute</label>
          </div>

          {/* Minute dropdown */}
          {showMinuteDropdown && (
            <div className="absolute top-full left-0 w-full mt-1 bg-neutral-700 rounded-lg shadow-lg max-h-48 overflow-y-auto z-10">
              {minuteOptions.map((m) => (
                <div
                  key={m}
                  className={`p-2 cursor-pointer hover:bg-neutral-600 ${m === minute ? 'bg-purple-600 text-white' : 'text-white'}`}
                  onClick={() => {
                    setMinute(m);
                    setShowMinuteDropdown(false);
                  }}
                >
                  {m}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* AM/PM */}
        <div className="flex flex-col ml-2">
          {PERIODS.map((p) => (
            <button
              key={p}
              className={`w-16 py-2 my-1 rounded ${period === p ? 'bg-purple-600 text-white' : 'bg-neutral-700 text-gray-300'}`}
              onClick={() => setPeriod(p)}
            >
              {p}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

/**
 * Scheduling UI Component
 */
const ScheduleMessageUI = ({
  step,
  message,
  date,
  time,
  timezone,
  onMessageChange,
  onDateChange,
  onTimeChange,
  onTimezoneChange,
  onBack,
  onSchedule,
  error,
  onValidateDate,
  onValidateTime
}) => {
  // Format today's date for min date in picker
  const today = new Date().toISOString().split('T')[0];

  // Helper to render the sparkle icon with animation
  const SparkleIcon = () => (
    <motion.div
      className="text-purple-500"
      animate={{
        scale: [1, 1.2, 1],
        opacity: [0.5, 1, 0.5]
      }}
      transition={{
        duration: 2,
        repeat: Infinity,
        repeatType: "reverse"
      }}
    >
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 2L15 9H22L16 14L18 21L12 17L6 21L8 14L2 9H9L12 2Z" fill="url(#paint0_linear)" />
        <defs>
          <linearGradient id="paint0_linear" x1="2" y1="2" x2="22" y2="21" gradientUnits="userSpaceOnUse">
            <stop stopColor="#8B5CF6" />
            <stop offset="1" stopColor="#3B82F6" />
          </linearGradient>
        </defs>
      </svg>
    </motion.div>
  );

  // Render different UI based on current step
  switch (step) {
    case 'message':
      return (
        <div className="p-7 bg-neutral-800 rounded-lg w-[110%]">
          <div className="flex items-center gap-4 justify-between mb-2">
            <h3 className="text-sm font-medium text-white">Schedule a Message</h3>
            <button onClick={onBack} className="text-gray-400 hover:text-white p-1 w-auto bg-neutral-800 rounded-lg">
              <FiX size={12} />
            </button>
          </div>

          <textarea
            value={message}
            onChange={(e) => onMessageChange(e.target.value)}
            placeholder="Type your message here..."
            className="w-full p-2 bg-neutral-700 text-white rounded-lg min-h-[100px] text-sm"
          />

          {error && <p className="text-red-400 text-xs mt-2">{error}</p>}

          <div className="flex justify-end mt-4">
            <button
              onClick={() => onDateChange(new Date())}
              disabled={!message.trim()}
              className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm flex items-center disabled:opacity-50"
            >
              Next <FiArrowLeft className="ml-2 transform rotate-180" />
            </button>
          </div>
        </div>
      );

    case 'date':
      return (
        <div className="p-4 bg-neutral-800 rounded-lg">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-white">Select Date</h3>
            <button onClick={() => onBack()} className="text-gray-700 hover:text-white p-1 bg-neutral-800 rounded-lg w-auto">
              <FiArrowLeft size={16} />
            </button>
          </div>

          <div className="flex flex-col items-center">
            <div className="flex items-center justify-center mb-4">
              <FiCalendar className="text-purple-400 mr-2" size={18} />
              <span className="text-white text-sm">When to send?</span>
            </div>

            <input
              type="date"
              min={today}
              value={date ? date.toISOString().split('T')[0] : ''}
              onChange={(e) => {
                if (e.target.value) {
                  const newDate = new Date(e.target.value);
                  onDateChange(newDate);
                  // Validate the date immediately for feedback
                  onValidateDate(newDate);
                }
              }}
              className="w-full p-2 bg-neutral-700 text-white rounded-lg mb-4"
            />

            {error && <p className="text-red-400 text-xs mt-2">{error}</p>}

            <div className="flex justify-end mt-4 w-full">
              <button
                onClick={() => {
                  if (onValidateDate(date)) {
                    // If date is valid, then proceed to time selection with default time
                    const defaultTime = { hour: '7', minute: '00', period: 'PM' };
                    onTimeChange(defaultTime);
                  }
                }}
                disabled={!date}
                className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm flex items-center disabled:opacity-50"
              >
                Next <FiArrowLeft className="ml-2 transform rotate-180" />
              </button>
            </div>
          </div>
        </div>
      );

    case 'time':
      return (
        <div className="p-4 bg-neutral-800 rounded-lg">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-white">Select Time</h3>
            <button onClick={() => onBack()} className="text-gray-400 hover:text-white p-1 w-auto">
              <FiArrowLeft size={16} />
            </button>
          </div>

          <TimePicker
            hour={time?.hour || '7'}
            minute={time?.minute || '00'}
            period={time?.period || 'PM'}
            onChange={onTimeChange}
          />

          {error && <p className="text-red-400 text-xs mt-2">{error}</p>}

          <div className="flex justify-between mt-4">
            <div className="flex items-center">
              <label className="text-xs text-gray-300 mr-2">Timezone:</label>
              <select
                value={timezone}
                onChange={(e) => onTimezoneChange(e.target.value)}
                className="bg-neutral-700 text-white text-xs p-1 rounded"
              >
                {TIMEZONES.map((tz) => (
                  <option key={tz.value} value={tz.value}>
                    {tz.label}
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={onSchedule}
              className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm flex items-center"
            >
              Schedule <FiCheck className="ml-2" />
            </button>
          </div>
        </div>
      );

    case 'success':
      return (
        <div className="p-4 bg-neutral-800 rounded-lg">
          <div className="flex items-center justify-center flex-col">
            <div className="flex items-center mb-3">
              <SparkleIcon />
              <h3 className="text-lg font-medium text-white ml-2">Scheduled!</h3>
              <SparkleIcon />
            </div>

            <p className="text-sm text-center text-gray-300 mb-4">
              Your message has been scheduled successfully.
            </p>

            <div className="bg-neutral-700 rounded-lg p-3 w-full mb-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-gray-400">Message:</span>
              </div>
              <p className="text-sm text-white">{message}</p>
            </div>

            <div className="flex items-center justify-between w-full text-xs text-gray-300">
              <div className="flex items-center">
                <FiCalendar className="mr-1 text-purple-400" />
                <span>{date?.toLocaleDateString()}</span>
              </div>
              <div className="flex items-center">
                <FiClock className="mr-1 text-purple-400" />
                <span>{`${time?.hour}:${time?.minute} ${time?.period}`}</span>
              </div>
            </div>

            <button
              onClick={onBack}
              className="mt-4 px-4 py-2 bg-neutral-700 text-white rounded-lg text-sm"
            >
              Done
            </button>
          </div>
        </div>
      );

    default:
      return null;
  }
};

/**
 * Chatbot component for interacting with the AI service
 * @param {Object} props - Component props
 * @param {number} props.contactId - ID of the selected contact
 */
const Chatbot = ({ contactId }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [currentFunFact, setCurrentFunFact] = useState('');
  const [actionType, setActionType] = useState('');
  const [showScheduler, setShowScheduler] = useState(false);
  const [schedulingStep, setSchedulingStep] = useState('message'); // message, date, time, timezone
  const [scheduledMessage, setScheduledMessage] = useState('');
  const [scheduledDate, setScheduledDate] = useState(null);
  const [scheduledTime, setScheduledTime] = useState(null);
  const [scheduledTimezone, setScheduledTimezone] = useState('Asia/Kolkata'); // IST by default
  const [schedulingError, setSchedulingError] = useState('');
  const messagesEndRef = useRef(null);
  const { user } = useSelector(state => state.auth.session);

  // New state variables for speech functionality
  const [isListening, setIsListening] = useState(false);
  const [selectedVoice, setSelectedVoice] = useState(null);
  const [voiceOptions, setVoiceOptions] = useState([]);
  const [showVoiceModal, setShowVoiceModal] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [isProcessingVoice, setIsProcessingVoice] = useState(false);
  const audioRef = useRef(null);
  const [currentVoiceIndex, setCurrentVoiceIndex] = useState(0);
  const [currentVoice, setCurrentVoice] = useState(null);
  const [isPreviewingVoice, setIsPreviewingVoice] = useState(false);
  const [voiceFlowState, setVoiceFlowState] = useState('idle'); // 'idle', 'speaking', 'listening', 'processing'
  const [interimTranscript, setInterimTranscript] = useState('');
  const [isSpeechDetected, setIsSpeechDetected] = useState(false);
  const [noSpeechTimeout, setNoSpeechTimeout] = useState(null);
  const [hasFinalTranscript, setHasFinalTranscript] = useState(false);
  const [lastSpeechTime, setLastSpeechTime] = useState(null);
  const speechInactivityTimerRef = useRef(null);
  const continuousActivityRef = useRef(false); // Track if we've had continuous activity

  // Add a ref to track speech detection that can be mutated synchronously
  const speechDetectedRef = useRef(false);

  // Add this to preserve the transcript across recognition sessions
  const recognizedTextRef = useRef('');

  // Load initial suggestions when contact changes
  useEffect(() => {
    if (contactId) {
      fetchSuggestions();
    }
  }, [contactId]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Update fun fact when loading state changes
  useEffect(() => {
    if (isLoading && actionType) {
      const randomIndex = Math.floor(Math.random() * SOCIAL_MEDIA_FUN_FACTS.length);
      setCurrentFunFact(SOCIAL_MEDIA_FUN_FACTS[randomIndex]);
    }
  }, [isLoading, actionType]);

  // Reset scheduling flow when it's closed
  useEffect(() => {
    if (!showScheduler) {
      setSchedulingStep('message');
      setScheduledMessage('');
      setScheduledDate(null);
      setScheduledTime(null);
      setSchedulingError('');
    }
  }, [showScheduler]);

  // Fetch action suggestions from AI service
  const fetchSuggestions = async () => {
    try {
      // This will be routed to the AI service through the gateway
      const response = await api.get(`/api/v1/ai/chatbot/suggestions/${contactId}`);
      if (response.data?.data?.response?.suggestions) {
        setSuggestions(response.data.data.response.suggestions);
      }
    } catch (error) {
      logger.error('Error fetching suggestions:', error);
      // Don't show error toast here to avoid disrupting user experience
    }
  };

  // Handle form submission (sending a message to AI)
  const handleSubmit = async (e, voiceText = null) => {
    e.preventDefault();

    const messageText = voiceText || inputValue.trim();
    if (!messageText) return;

    if (!voiceText) {
    setInputValue('');
    }

    const userMessage = messageText;
    setMessages(prev => [...prev, { text: userMessage, isUser: true }]);
    setIsLoading(true);
    setActionType(''); // Reset action type for normal chat

    try {
      // This will be routed to the AI service through the gateway
      const response = await api.post(`/api/v1/ai/chatbot/message/${contactId}`, {
        message: userMessage,
        userId: user?.id
      });

      const aiMessage = response.data?.data?.response?.message || 'Sorry, I couldn\'t process that.';
      const actions = response.data?.data?.response?.actions || [];

      setMessages(prev => [...prev, {
        text: aiMessage,
        isUser: false,
        actions: actions
      }]);
    } catch (error) {
      logger.error('Error sending message to AI:', error);
      toast.error('Failed to get a response from AI');
      setMessages(prev => [...prev, {
        text: 'Sorry, there was an error processing your request.',
        isUser: false
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  // Handle action buttons (e.g., generate daily report, set priority)
  const handleActionClick = async (actionType) => {
    console.log(`Action clicked: ${actionType}`);

    try {
      setActionType(actionType);

      // Display loading message
      let loadingMessage = 'Processing...';
      let responseHeader = '';

      switch (actionType) {
        case 'daily_report':
          console.log("Processing daily report action");
          loadingMessage = 'Generating daily report...';
          responseHeader = '**Daily Report**';
          setIsLoading(true);

          // Show loading state
          setMessages(prev => [...prev, {
            text: loadingMessage,
            isLoading: true,
            isUser: false
          }]);

          // This will be routed to the AI service through the gateway
          const reportResponse = await api.get(`/api/v1/ai/chatbot/suggestions/daily-report/${contactId}`);

          // Remove the loading message
          setMessages(prev => prev.filter(msg => !msg.isLoading));

          // Add the response with header
          const reportMessage = reportResponse.data?.data?.response?.message || 'No summary available';
          const fullMessage = `${responseHeader}\n\n${reportMessage}`;

          setMessages(prev => [...prev, {
            text: fullMessage,
            isUser: false
          }]);

          break;

        case 'key_decisions':
          console.log("Processing key decisions action");
          loadingMessage = 'Analyzing key decisions...';
          responseHeader = '**Key Decisions**';
          setIsLoading(true);

          // Show loading state
          setMessages(prev => [...prev, {
            text: loadingMessage,
            isLoading: true,
            isUser: false
          }]);

          // This will be routed to the AI service through the gateway
          const decisionsResponse = await api.get(`/api/v1/ai/chatbot/suggestions/key-decisions/${contactId}`);

          // Remove the loading message
          setMessages(prev => prev.filter(msg => !msg.isLoading));

          // Add the response with header
          const decisionsMessage = decisionsResponse.data?.data?.response?.message || 'No key decisions found';
          setMessages(prev => [...prev, {
            text: `${responseHeader}\n\n${decisionsMessage}`,
            isUser: false
          }]);
          break;

        case 'schedule_message':
          console.log("Processing schedule message action");
          // Reset scheduling state
          setShowScheduler(true);
          setSchedulingStep('message');
          setScheduledMessage('');
          setScheduledDate(null);
          setScheduledTime(null);
          setSchedulingError(''); // Clear any previous errors

          // Add message to chat indicating we're starting scheduling
          setMessages(prev => [...prev, {
            text: "Let's schedule a message. What would you like to send?",
            isUser: false,
            scheduling: true
          }]);
          break;

        default:
          console.warn('Unknown action type:', actionType);
          toast.error("Unknown action type. Please try again.");
      }
    } catch (error) {
      console.error('Error executing action:', error);
      toast.error('Failed to execute action');

      // Remove any loading messages
      setMessages(prev => prev.filter(msg => !msg.isLoading));

      // Add error message
      setMessages(prev => [...prev, {
        text: 'Sorry, there was an error processing your request.',
        isUser: false
      }]);
    } finally {
      // Don't reset loading state for schedule_message action
      // as it will be managed by the scheduling flow
      if (actionType !== 'schedule_message') {
        setIsLoading(false);
        setActionType('');
      }
    }
  };

  // Handle suggestion click
  const handleSuggestionClick = (suggestion) => {
    setInputValue(suggestion);
  };

  // Button animation variants - updated for new design
  const buttonVariants = {
    initial: { y: 0 },
    animate: {
      y: [0, -5, 0],
      transition: {
        y: {
          duration: 1.5,
          repeat: Infinity,
          repeatType: "mirror",
          ease: "easeInOut"
        }
      }
    },
    tap: { scale: 0.95 },
    hover: { scale: 1.05 }
  };

  // Expanded button animation variants
  const expandedButtonVariants = {
    initial: { width: "48px", borderRadius: "50%" },
    expanded: {
      width: "auto",
      borderRadius: "9999px",
      transition: {
        type: "spring",
        damping: 20,
        stiffness: 300
      }
    }
  };

  // Glow effect animation variants
  const glowVariants = {
    initial: { opacity: 0 },
    hover: {
      opacity: 1,
      transition: { duration: 0.3 }
    }
  };

  // Chat panel animation variants
  const chatPanelVariants = {
    hidden: { opacity: 0, y: 20, scale: 0.9 },
    visible: {
      opacity: 1,
      y: 0,
      scale: 1,
      transition: {
        type: "spring",
        damping: 20,
        stiffness: 300
      }
    },
    exit: {
      opacity: 0,
      y: 20,
      scale: 0.9,
      transition: {
        duration: 0.2
      }
    }
  };

  // Spinning logo animation variants
  const spinVariants = {
    animate: {
      rotate: 360,
      transition: {
        repeat: Infinity,
        duration: 1.5,
        ease: "linear"
      }
    }
  };

  // Typing dots animation variant
  const typingDotsVariants = {
    animate: {
      opacity: [0.4, 1, 0.4],
      transition: {
        repeat: Infinity,
        duration: 1.2,
        ease: "easeInOut"
      }
    }
  };

  // Handle scheduling a new message
  const scheduleMessage = async () => {
    try {
      // Client-side validations
      if (!scheduledMessage.trim()) {
        setSchedulingError('Please enter a message to schedule');
        return;
      }

      if (!scheduledDate) {
        setSchedulingError('Please select a date');
        return;
      }

      if (!scheduledTime) {
        setSchedulingError('Please select a time');
        return;
      }

      // Validate that the selected date/time is in the future
      const now = new Date();
      const selectedDateTime = new Date(scheduledDate);

      // Set the hours and minutes based on the selected time
      const hours = parseInt(scheduledTime.hour);
      const minutes = parseInt(scheduledTime.minute);
      const isPM = scheduledTime.period === 'PM';

      // Convert hours to 24-hour format
      const hours24 = isPM ? (hours === 12 ? 12 : hours + 12) : (hours === 12 ? 0 : hours);

      selectedDateTime.setHours(hours24, minutes, 0, 0);

      // Check if the selected time is in the past
      if (selectedDateTime <= now) {
        setSchedulingError('Please select a future date and time');
        return;
      }

      // Clear any previous errors
      setSchedulingError('');

      // Close the scheduler UI to show the chat with loading state
      setShowScheduler(false);

      // Set loading states before API call
      setIsLoading(true);
      setActionType('schedule_message');

      // Generate a fun fact for loading
      const randomIndex = Math.floor(Math.random() * SOCIAL_MEDIA_FUN_FACTS.length);
      setCurrentFunFact(SOCIAL_MEDIA_FUN_FACTS[randomIndex]);

      // Add loading message to chat
      setMessages(prev => [...prev, {
        text: 'Scheduling your message...',
        isLoading: true,
        isUser: false
      }]);

      // Format the scheduled time in ISO 8601 format
      const scheduledTimeISO = selectedDateTime.toISOString();

      logger.info('Scheduling message with data:', {
        contactId,
        scheduledTime: scheduledTimeISO,
        messagePreview: scheduledMessage.substring(0, 20) + '...'
      });

      // Artificial delay to ensure loading state is visible (remove in production)
      await new Promise(resolve => setTimeout(resolve, 1500));

      try {
        // Call the API to schedule the message with improved timeout handling
        const response = await api.post(`/api/v1/ai/chatbot/schedule-message/${contactId}`, {
          content: scheduledMessage,
          scheduledTime: scheduledTimeISO
        }, {
          timeout: 30000 // Increase timeout from 10s to 30s
        });

        // Remove loading message
        setMessages(prev => prev.filter(msg => !msg.isLoading));

        // Add success message
        setMessages(prev => [...prev, {
          text: `✨ Message scheduled successfully for ${selectedDateTime.toLocaleString()}`,
          isUser: false
        }]);

        // Show success toast
        toast.success('Message scheduled successfully');
      } catch (apiError) {
        // Check for network error (status 0)
        if (!apiError.response || apiError.message.includes('Network Error')) {
          // Handle network errors or timeout issues
          setMessages(prev => prev.filter(msg => !msg.isLoading));

          const errorMessage = "Unable to connect to the scheduling service. This could be due to a slow connection or high server load. Please try again in a moment.";

          setMessages(prev => [...prev, {
            text: errorMessage,
            isUser: false,
            isError: true
          }]);

          toast.error('Connection issue. Please try again shortly.');
        }
        // Use the utility function for consistent error handling for other errors
        else if (apiError.response?.status === 503 ||
            (apiError.message && apiError.message.includes('timeout'))) {
          // Special handling for Redis connection issues or timeouts
          setMessages(prev => prev.filter(msg => !msg.isLoading));

          const errorMessage = "The scheduling service is currently experiencing connection issues. Your message has been queued and will be scheduled when the service is available.";

          setMessages(prev => [...prev, {
            text: errorMessage,
            isUser: false,
            isError: true
          }]);

          toast.error('Scheduling service connection issue. Please try again later.');
        } else {
          // Use general API error handling for other errors
          handleApiError(apiError, setMessages, 'Failed to schedule message. Please try again.');
        }
      }
    } catch (error) {
      // Handle any other unexpected errors
      handleApiError(error, setMessages, 'An unexpected error occurred while scheduling your message.');
    } finally {
      // Ensure loading states are reset
      setTimeout(() => {
        setIsLoading(false);
        setActionType('');
      }, 500); // Small delay to ensure animations complete
    }
  };

  // Handle back navigation in scheduler
  const handleSchedulerBack = () => {
    if (schedulingStep === 'message') {
      // Close scheduler if we're at the first step
      setShowScheduler(false);
      setMessages([...messages, { isUser: false, text: "Scheduling cancelled. How else can I help you today?" }]);
    } else if (schedulingStep === 'date') {
      // Go back to message input
      setSchedulingStep('message');
    } else if (schedulingStep === 'time') {
      // Go back to date selection
      setSchedulingStep('date');
    } else if (schedulingStep === 'timezone') {
      // Go back to time selection
      setSchedulingStep('time');
    } else if (schedulingStep === 'success') {
      // Close scheduler if we're at success state
      setShowScheduler(false);
    }
  };

  // Validate date selection to ensure it's not in the past
  const validateDateSelection = (date) => {
    if (!date) {
      setSchedulingError("Please select a date");
      return false;
    }

    // Check if date is valid
    const selectedDate = new Date(date);
    if (isNaN(selectedDate.getTime())) {
      setSchedulingError("Invalid date selected");
      return false;
    }

    const now = new Date();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Check if the selected date is today or in the future
    if (selectedDate < today) {
      setSchedulingError("Please select today or a future date");
      return false;
    }

    // Clear any previous error messages
    setSchedulingError("");
    return true;
  };

  // Validate time selection to ensure it's not in the past
  const validateTimeSelection = (timeObj) => {
    // Check if date has been selected
    if (!scheduledDate) {
      setSchedulingError("Please select a date first");
      return false;
    }

    // Check if date is valid
    const selectedDate = new Date(scheduledDate);
    if (isNaN(selectedDate.getTime())) {
      setSchedulingError("Invalid date selected");
      return false;
    }

    const now = new Date();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // If the date is in the future (not today), we don't need to validate the time
    if (selectedDate.toDateString() !== today.toDateString()) {
      setSchedulingError("");
      return true;
    }

    // For today, we need to validate the time
    const hours = parseInt(timeObj.hour);
    const minutes = parseInt(timeObj.minute);
    const isPM = timeObj.period === 'PM';

    // Check for valid time inputs
    if (isNaN(hours) || isNaN(minutes)) {
      setSchedulingError("Please enter valid time values");
      return false;
    }

    // Convert to 24-hour format
    let hour24 = hours;
    if (isPM && hours !== 12) hour24 += 12;
    if (!isPM && hours === 12) hour24 = 0;

    // Set the time on the selected date for comparison
    const selectedDateTime = new Date(selectedDate);
    selectedDateTime.setHours(hour24, minutes, 0, 0);

    // Check if the selected date/time is in the past
    if (selectedDateTime <= now) {
      const currentHour = now.getHours();
      const currentMinute = now.getMinutes();
      const formattedCurrentTime = `${currentHour}:${currentMinute.toString().padStart(2, '0')}`;

      setSchedulingError(`Please select a future time. Current time is ${formattedCurrentTime}`);
      return false;
    }

    setSchedulingError("");
    return true;
  };

  // Fetch available voices when component mounts
  useEffect(() => {
    fetchVoices();
  }, []);

  // Fetch available voices from speech service
  const fetchVoices = async () => {
    try {
      // Use the existing api utility that already handles auth
      const response = await api.get('/api/v1/speech/voices');
      if (response.data?.data) {
        setVoiceOptions(response.data.data);
        if (response.data.data.length > 0) {
          setCurrentVoice(response.data.data[0]);
          setCurrentVoiceIndex(0);
        }
      }
    } catch (error) {
      console.error('Error fetching voices:', error);
    }
  };

  // Handle microphone button click
  const handleMicrophoneClick = () => {
    if (isListening) {
      stopListening();
    } else {
      setShowVoiceModal(true);
    }
  };

  // Completely rewritten startListening function
  const startListening = () => {
    console.log("Starting listening...");

    // Reset everything
    window.latestTranscript = '';
    window.processingComplete = false; // Add flag to prevent double processing

    setTranscript('');
    setInterimTranscript('');
    setIsSpeechDetected(false);
    setHasFinalTranscript(false);

    // Reset ref for speech detection
    speechDetectedRef.current = false;

    // Clear any existing timers
    if (noSpeechTimeout) {
      clearTimeout(noSpeechTimeout);
      setNoSpeechTimeout(null);
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      toast.error("Your browser doesn't support speech recognition");
      setVoiceFlowState('idle');
      setShowVoiceModal(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    // Set timeout for initial speech detection
    const timeout = setTimeout(() => {
      if (!speechDetectedRef.current) {
        console.log("No initial speech detected");
        toast.error("I couldn't detect any speech. Please try again.");

        if (window.recognition) {
          window.recognition.stop();
        }

        setVoiceFlowState('idle');
        setShowVoiceModal(false);
      }
    }, 10000);

    setNoSpeechTimeout(timeout);

    // Simple tracking of last speech activity
    let lastActivity = Date.now();
    let inactivityTimer = null;

    const checkInactivity = () => {
      const now = Date.now();
      const elapsed = now - lastActivity;

      console.log(`Inactivity check: ${elapsed}ms since last activity`);

      // If we've had 4 seconds of silence AND we have some transcript
      if (elapsed > 4000 && window.latestTranscript && window.latestTranscript.trim() && !window.processingComplete) {
        console.log(`Processing after ${elapsed}ms of inactivity`);

        // Set processing flag to prevent double processing
        window.processingComplete = true;

        // Stop the inactivity timer
        clearInterval(inactivityTimer);

        // Stop recognition
        if (window.recognition) {
          window.recognition.stop();
        }

        // Process the command
        const finalText = window.latestTranscript.trim();
        processVoiceCommand(finalText);
      }
    };

    recognition.onresult = (event) => {
      console.log("Speech result received");

      // Immediately clear the initial timeout
      if (!speechDetectedRef.current) {
        speechDetectedRef.current = true;
        if (noSpeechTimeout) {
          clearTimeout(noSpeechTimeout);
          setNoSpeechTimeout(null);
        }

        // Start inactivity timer after first speech
        inactivityTimer = setInterval(checkInactivity, 1000);
      }

      // Update last activity timestamp
      lastActivity = Date.now();

      // Process the interim and final results
      let interimText = '';
      let finalText = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          finalText += event.results[i][0].transcript + ' ';
        } else {
          interimText += event.results[i][0].transcript;
        }
      }

      if (finalText) {
        const updatedTranscript = transcript + finalText;
        setTranscript(updatedTranscript);
        window.latestTranscript = updatedTranscript;
      }

      setInterimTranscript(interimText);

      // Update global transcript with both final and interim
      window.latestTranscript = (transcript + finalText + ' ' + interimText).trim();

      console.log(`Current transcript: "${window.latestTranscript}"`);
    };

    recognition.onstart = () => {
      console.log("Speech recognition started");
    };

    recognition.onerror = (event) => {
      console.error(`Speech recognition error: ${event.error}`);

      if (event.error === 'not-allowed') {
        toast.error("Microphone access denied. Please allow microphone access.");
      }

      // Clean up
      if (noSpeechTimeout) {
        clearTimeout(noSpeechTimeout);
        setNoSpeechTimeout(null);
      }

      if (inactivityTimer) {
        clearInterval(inactivityTimer);
      }

      setVoiceFlowState('idle');
      setShowVoiceModal(false);
    };

    recognition.onend = () => {
      console.log("Speech recognition ended");
      console.log(`Final transcript: "${window.latestTranscript}"`);

      // Clean up
      if (noSpeechTimeout) {
        clearTimeout(noSpeechTimeout);
        setNoSpeechTimeout(null);
      }

      if (inactivityTimer) {
        clearInterval(inactivityTimer);
      }

      // Process the transcript if we have one AND we haven't processed it already
      if (window.latestTranscript && window.latestTranscript.trim() &&
          speechDetectedRef.current && !window.processingComplete) {
        const textToProcess = window.latestTranscript.trim();
        console.log("Processing on recognition end:", textToProcess);

        // Set processing flag
        window.processingComplete = true;

        // Process command with slight delay
        setTimeout(() => {
          setVoiceFlowState('processing');
          processVoiceCommand(textToProcess);

          // Reset state after processing
          window.latestTranscript = '';
          setTranscript('');
          setInterimTranscript('');
        }, 100);
      } else if (voiceFlowState === 'listening') {
        // No transcript or already processed, just close
        setVoiceFlowState('idle');
        setShowVoiceModal(false);
      }
    };

    recognition.start();
    window.recognition = recognition;
  };

  // Stop listening for voice input
  const stopListening = () => {
    setIsListening(false);
  };

  // Process the voice command based on content
  const processVoiceCommand = (text) => {
    // Extract the last sentence if the text is very long (likely from accumulation)
    let processText = text;
    if (text.length > 100) {
      // Try to extract the last sentence/phrase
      const sentences = text.split(/[.!?]\s+/);
      if (sentences.length > 1) {
        processText = sentences[sentences.length - 1].trim();
        console.log("Processing last sentence only:", processText);
      }
    }

    const lowerText = processText.toLowerCase();
    console.log("Processing voice command:", processText);

    try {
      // Close the voice modal
      setShowVoiceModal(false);

      // Ensure chat is open when processing voice commands
      if (!isOpen) {
        console.log("Opening chat for voice command");
        setIsOpen(true);
      }

      // Add user message
      setMessages(prev => [...prev, {
        text: processText,
        isUser: true
      }]);

      // Add loading message
      setMessages(prev => [...prev, {
        text: "Processing your voice request...",
        isLoading: true,
        isUser: false
      }]);

      console.log("Checking for command pattern in:", lowerText);

      // Check for scheduling first (higher precedence)
      if (lowerText.includes('schedule')) {
        console.log("Detected SCHEDULE_MESSAGE case");
        // Short timeout to ensure UI is updated before showing scheduler
        setTimeout(() => {
          handleActionClick('schedule_message');
        }, 100);
      }
      // Then check for daily report
      else if (lowerText.includes('daily') && lowerText.includes('report')) {
        console.log("Detected DAILY_REPORT case");
        setTimeout(() => {
          handleActionClick('daily_report');
        }, 100);
      }
      // Then check for key decisions
      else if (lowerText.includes('key') && lowerText.includes('decision')) {
        console.log("Detected KEY_DECISIONS case");
        setTimeout(() => {
          handleActionClick('key_decisions');
        }, 100);
      }
      // Default to general message
      else {
        console.log("No specific pattern detected, treating as general message");

        // Remove the loading message
        setMessages(prev => prev.filter(msg => !msg.isLoading));

        // Submit as normal message
        handleSubmit({ preventDefault: () => {} }, processText);
      }
    } catch (error) {
      console.error("Error in processVoiceCommand:", error);

      // Remove loading message
      setMessages(prev => prev.filter(msg => !msg.isLoading));

      // Show error
      toast.error("Sorry, there was an error processing your voice command");
      setMessages(prev => [...prev, {
        text: "Sorry, I couldn't process your voice command. Please try again.",
        isUser: false
      }]);
    }

    // Reset state
    setVoiceFlowState('idle');
  };

  // Updated speakText function
  const speakText = async (text) => {
    if (!currentVoice) return Promise.reject(new Error("No voice selected"));

    try {
      setIsProcessingVoice(true);
      console.log(`Sending TTS request for text: "${text.substring(0, 30)}..." with voice: ${currentVoice.id}`);

      // Use the existing api utility with responseType: 'blob'
      const response = await api.post('/api/v1/speech/text-to-speech',
        {
          text,
          voiceId: currentVoice.id
        },
        {
          responseType: 'blob',
          headers: {
            'Accept': 'audio/mpeg'
          }
        }
      );

      console.log("TTS response received");

      const audioBlob = new Blob([response.data], { type: 'audio/mpeg' });
      const audioUrl = URL.createObjectURL(audioBlob);

      console.log("Created audio URL:", audioUrl);

      return new Promise((resolve, reject) => {
        if (audioRef.current) {
          audioRef.current.src = audioUrl;
          audioRef.current.oncanplaythrough = () => {
            console.log("Audio ready to play");
            audioRef.current.play().catch(e => {
              console.error("Audio play failed:", e);
              reject(e);
            });
          };
          audioRef.current.onended = () => {
            console.log("Audio playback completed");
            resolve();
          };
          audioRef.current.onerror = (e) => {
            console.error("Audio error:", e);
            reject(new Error("Audio playback error"));
          };
        } else {
          reject(new Error("Audio element not found"));
        }
      }).finally(() => {
        setIsProcessingVoice(false);
      });
    } catch (error) {
      console.error('Error with text-to-speech:', error);
      setIsProcessingVoice(false);
      return Promise.reject(error);
    }
  };

  // Handle voice selection
  const handleVoiceSelect = (voice) => {
    setSelectedVoice(voice);
    setShowVoiceModal(false);
    startListening();
  };

  // Add voice modal toggle function
  const toggleVoiceModal = () => {
    setShowVoiceModal(prev => !prev);
    if (!showVoiceModal) {
      fetchVoices();
    }
  };

  // Start voice session
  const startVoiceSession = () => {
    if (!currentVoice) return;

    // Reset global transcript to avoid accumulation
    window.latestTranscript = '';

    // Change state to speaking (assistant speaking)
    setVoiceFlowState('speaking');

    // Assistant speaks
    speakText("What do you want to explore or know about the conversation with your contact?")
      .then(() => {
        // After assistant finishes speaking, transition to listening mode
        setVoiceFlowState('listening');
        startListening();
      })
      .catch(error => {
        console.error("Error in voice flow:", error);
        toast.error("Sorry, there was an issue with the voice assistant");
        setVoiceFlowState('idle');
        setShowVoiceModal(false);
      });
  };

  // Updated previewVoice function to use apiClient
  const previewVoice = async (voice) => {
    if (isPreviewingVoice) return;

    try {
      setIsPreviewingVoice(true);
      console.log(`Previewing voice: ${voice.id}`);

      const response = await api.post('/api/v1/speech/text-to-speech', {
        text: `Hello, I'm ${voice.name.split(' ')[0]}. How can I help you today?`,
        voiceId: voice.id
      }, {
        responseType: 'blob',
        headers: {
          'Accept': 'audio/mpeg'
        }
      });

      console.log("Preview response received");

      const audioBlob = new Blob([response.data], { type: 'audio/mpeg' });
      const audioUrl = URL.createObjectURL(audioBlob);

      if (audioRef.current) {
        audioRef.current.src = audioUrl;
        audioRef.current.volume = 1.0;
        await audioRef.current.play();
        console.log("Preview audio playing");
      }
    } catch (error) {
      console.error('Error previewing voice:', error.response || error);
    } finally {
      setIsPreviewingVoice(false);
    }
  };

  return (
    <>
      {/* Hidden audio element for TTS playback */}
      <audio
        ref={audioRef}
        controls
        className="fixed bottom-4 right-4 w-64 z-50"
        style={{ display: isProcessingVoice ? 'block' : 'none' }}
      />

      {/* Floating toggle button with animation - redesigned */}
      <motion.div
        className="fixed bottom-6 right-6 z-50"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {/* Glow effect - visible on hover */}
        <motion.div
          className="absolute inset-0 rounded-full bg-gradient-to-r from-purple-500 to-indigo-500 blur-md -z-10"
          variants={glowVariants}
        initial="initial"
          animate={isHovered ? "hover" : "initial"}
        />

        {/* Button container */}
        <motion.div
          className="bg-gradient-to-r from-purple-600 to-indigo-600 rounded-full shadow-lg text-white overflow-hidden flex items-center justify-center"
          variants={expandedButtonVariants}
          initial="initial"
          animate={isHovered ? "expanded" : "initial"}
        whileTap="tap"
        >
          {/* When not hovered, show only the logo */}
          {!isHovered ? (
            <div className="p-3 flex items-center justify-center">
            <img src={DFSpin} className="w-6 h-6" alt='DailyUniAI Logo'/>
            </div>
          ) : (
            // When hovered, show the expanded version with text and icons
            <div className="flex items-center p-2 bg-neutral-800">
              <button
                onClick={() => setIsOpen(!isOpen)}
                className="p-2 w-auto bg-transparent hover:bg-purple-700/50 rounded-full transition-colors"
              >
                <FiMessageSquare className="w-4 h-5" />
              </button>

              <div className="flex items-center mx-2">
                {/* <img src={DFSpin} className="w-6 h-6 mr-2" alt='DailyUniAI Logo'/> */}
                <span className="text-sm font-medium whitespace-nowrap">Ask <span className="font-bold ml-0 bg-gradient-to-r from-purple-300 to-pink-400 bg-clip-text text-transparent">DailyUniAI</span></span>
              </div>

              <button
                onClick={handleMicrophoneClick}
                className={`p-2 border-4 border-gradient-to-r ${isListening ? 'bg-red-600' : 'bg-neutral-700'} from-purple-400 to-green-500 hover:bg-purple-700/50 rounded-full transition-colors w-auto`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"></path>
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
                  <line x1="12" y1="19" x2="12" y2="22"></line>
                </svg>
              </button>
          </div>
        )}
        </motion.div>
      </motion.div>

      {/* Voice Selection Modal */}
      {showVoiceModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 w-auto bg-black opacity-90" onClick={() => {
            // Only allow closing if we're in idle state or selecting voice
            if (voiceFlowState === 'idle') {
              setShowVoiceModal(false);
              if (window.recognition) {
                window.recognition.stop();
              }
              if (noSpeechTimeout) {
                clearTimeout(noSpeechTimeout);
              }
            }
          }}></div>

          <div className="relative z-10 w-[90%] max-w-md rounded-xl overflow-hidden">
            {/* Aurora Borealis Background - Matching exactly the image */}
            <div className="absolute inset-0 bg-gradient-to-b from-black via-blue-900 to-indigo-900">
              <div className="absolute inset-0 bg-[url('/aurora-borealis.svg')] opacity-50"></div>
            </div>

            <div className="relative p-6 flex flex-col items-center">
              {/* Close button - only show when not actively in speaking/listening mode */}
              {voiceFlowState === 'idle' && (
                <button
                  className="absolute top-4 left-4 text-white text-xl w-auto rounded-lg h-auto bg-neutral-800"
                  onClick={() => setShowVoiceModal(false)}
                >
                  ×
                </button>
              )}

              {/* Voice Selection UI - Only show when in idle state */}
              {voiceFlowState === 'idle' && (
                <>
                  <h2 className="text-xl font-bold text-white mb-12 text-center">Choose a voice</h2>

                  {/* Current voice preview */}
                  <div className="mb-6 text-center">
                    <h3 className="text-2xl font-bold text-white mb-2">
                      {currentVoice ? currentVoice.name.split(' ')[0] : 'Select a Voice'}
                    </h3>
                    <p className="text-white text-lg">
                      {currentVoice?.gender === 'MALE' ? 'Deep · Lower voice' : 'Bright · Higher voice'}
                    </p>
                  </div>

                  {/* Voice carousel dots */}
                  <div className="flex items-center justify-center space-x-2 mb-10 w-full">
                    {voiceOptions.map((voice, index) => (
                      <button
                        key={voice.id}
                        className={`w-3 h-3 rounded-full transition-all ${
                          currentVoiceIndex === index ? 'bg-white w-5' : 'bg-white/40'
                        }`}
                        onClick={() => {
                          setCurrentVoiceIndex(index);
                          setCurrentVoice(voice);
                          previewVoice(voice);
                        }}
                      />
                    ))}
                  </div>

                  {/* Start button */}
                  <button
                    className="bg-white/10 hover:bg-white/20 text-white rounded-full px-10 py-3 font-medium mt-auto"
                    onClick={startVoiceSession}
                  >
                    Start
                  </button>
                </>
              )}

              {/* Assistant Speaking UI */}
              {voiceFlowState === 'speaking' && (
                <div className="flex flex-col items-center justify-center h-full w-full">
                  <div className="mb-8">
                    <h3 className="text-2xl font-bold text-white text-center mb-2">
                      {currentVoice?.name.split(' ')[0]} is speaking...
                    </h3>
                  </div>

                  {/* Pulsing circle animation */}
                  <div className="relative flex items-center justify-center mb-8">
                    <div className="absolute w-20 h-20 bg-blue-500 rounded-full opacity-50 animate-ping"></div>
                    <div className="relative w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 0 1-7 7m0 0a7 7 0 0 1-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 0 1-3-3V5a3 3 0 1 1 6 0v6a3 3 0 0 1-3 3z" />
                      </svg>
                    </div>
                  </div>

                  <p className="text-white text-center max-w-xs">
                    The assistant will start listening after speaking
                  </p>
                </div>
              )}

              {/* Listening UI - Shown during speech recognition */}
              {voiceFlowState === 'listening' && (
                <div className="flex flex-col items-center justify-center h-full w-full">
                  <h3 className="text-xl font-bold text-white text-center mb-8">Listening...</h3>

                  {/* Dynamic audio waveform visualization */}
                  <div className="flex items-end justify-center h-24 mb-6 w-full">
                    {[...Array(30)].map((_, i) => (
                      <div
                        key={i}
                        className="wave-bar w-1.5 mx-0.5 bg-blue-400 rounded-full animate-pulse"
                        style={{
                          height: `${10 + Math.random() * 50}px`,
                          animationDuration: `${0.5 + Math.random() * 0.8}s`,
                          opacity: 0.7 + Math.random() * 0.3
                        }}
                      />
                    ))}
                  </div>

                  {/* Speech to text display area */}
                  <div className="bg-black/30 rounded-xl p-4 w-full mb-8 min-h-[100px]">
                    <div className="text-white/70 text-lg min-h-[30px]">
                      {interimTranscript}
                    </div>
                    <div className="text-white text-xl font-medium mt-2 min-h-[60px]">
                      {transcript}
                    </div>
                  </div>

                  <button
                    className="bg-white/10 hover:bg-white/20 text-white rounded-full px-10 py-3 font-medium"
                    onClick={() => {
                      console.log("Done button clicked");

                      // Grab current transcript
                      const textToProcess = window.latestTranscript || transcript || interimTranscript || "";
                      console.log(`Final text from done button: "${textToProcess.trim()}"`);

                      // Stop recognition
                      if (window.recognition) {
                        window.recognition.stop();
                      }

                      // Clear timeouts
                      if (noSpeechTimeout) {
                        clearTimeout(noSpeechTimeout);
                        setNoSpeechTimeout(null);
                      }

                      // Process if we have text AND we haven't processed it already
                      if (textToProcess.trim() && speechDetectedRef.current && !window.processingComplete) {
                        // Set processing flag
                        window.processingComplete = true;

                        setVoiceFlowState('processing');
                        processVoiceCommand(textToProcess.trim());
                      } else {
                        // No text to process or already processed
                        setVoiceFlowState('idle');
                        setShowVoiceModal(false);
                      }
                    }}
                  >
                    Done
                  </button>
                </div>
              )}

              {/* Processing UI */}
              {voiceFlowState === 'processing' && (
                <div className="flex flex-col items-center justify-center h-full w-full">
                  <h3 className="text-xl font-bold text-white text-center mb-8">Processing your request...</h3>

                  <div className="flex justify-center items-center mb-6">
                    <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-white"></div>
                  </div>

                  <div className="text-white text-center max-w-xs mb-4">
                    "{transcript}"
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Chatbot panel with animation */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            className="fixed bottom-20 right-6 w-[25rem] h-[500px] bg-neutral-900 border border-purple-500/20 rounded-lg shadow-xl flex flex-col z-40"
            variants={chatPanelVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
          >
            {/* Header */}
            <div className="bg-gradient-to-r from-purple-600 to-neutral-500 px-4 py-3 rounded-t-lg flex justify-between items-center">
              <h3 className="text-white font-medium"><span className="font-bold ml-0 bg-gradient-to-r from-purple-200 to-pink-300 bg-clip-text text-transparent">DailyUniAI</span></h3>
              <button
                onClick={() => setIsOpen(false)}
                className="text-white/70 hover:text-white w-auto bg-neutral-900"
              >
                <FiX className="w-3 h-3" />
              </button>
            </div>

            {/* Quick actions */}
            <div className="flex overflow-x-auto p-2 border-b border-neutral-700 gap-2">
              <button
                onClick={() => handleActionClick('daily_report')}
                className="px-3 py-1 bg-neutral-800 text-white text-sm rounded-full whitespace-nowrap hover:bg-neutral-700 flex items-center gap-1"
                disabled={isLoading}
              >
                <FiBarChart2 className="w-3 h-3" />
                <span>Daily Report</span>
              </button>
              <button
                onClick={() => handleActionClick('key_decisions')}
                className="px-3 py-1 bg-neutral-800 text-white text-sm rounded-full whitespace-nowrap hover:bg-neutral-700 flex items-center gap-1"
                disabled={isLoading}
              >
                <span>Key Decisions</span>
              </button>
              <button
                onClick={() => handleActionClick('set_priority')}
                className="px-3 py-1 bg-neutral-800 text-white text-sm rounded-full whitespace-nowrap hover:bg-neutral-700 flex items-center gap-1"
                disabled={isLoading}
              >
                <FiClock className="w-3 h-3" />
                <span>Set Priority</span>
              </button>
              <button
                onClick={() => handleActionClick('schedule_message')}
                className="px-3 py-1 bg-neutral-800 text-white text-sm rounded-full whitespace-nowrap hover:bg-neutral-700 flex items-center gap-1"
                disabled={isLoading}
              >
                <FiClock className="w-3 h-3" />
                <span>Schedule Message</span>
              </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-3 space-y-3 bg-neutral-900">
              {messages.length === 0 ? (
                <div className="text-center p-4">
                  <p className="text-gray-400 text-sm mb-4">
                    Ask me anything about this conversation. I can help summarize chats, identify key decisions, or analyze patterns.
                  </p>

                  <div className="bg-neutral-800 p-3 rounded-lg text-left">
                    <p className="text-gray-300 text-sm font-medium mb-2">Try asking:</p>
                    <ul className="text-gray-400 text-xs space-y-2">
                      <li className="p-2 bg-neutral-700/30 rounded hover:bg-neutral-700/50 cursor-pointer"
                          onClick={() => setInputValue("Summarize this conversation")}>
                        "Summarize this conversation"
                      </li>
                      <li className="p-2 bg-neutral-700/30 rounded hover:bg-neutral-700/50 cursor-pointer"
                          onClick={() => setInputValue("What are the key decisions made?")}>
                        "What are the key decisions made?"
                      </li>
                      <li className="p-2 bg-neutral-700/30 rounded hover:bg-neutral-700/50 cursor-pointer"
                          onClick={() => setInputValue("Create a follow-up plan")}>
                        "Create a follow-up plan"
                      </li>
                    </ul>
                  </div>
                </div>
              ) : (
                messages.map((msg, index) => (
                  <div
                    key={index}
                    className={`flex ${msg.isUser ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[80%] p-2 rounded-lg ${
                        msg.isUser
                          ? 'bg-purple-600 text-white rounded-tr-none'
                          : 'bg-neutral-800 text-gray-200 rounded-tl-none'
                      }`}
                    >
                      <p className="text-sm whitespace-pre-wrap">{msg.text}</p>

                      {msg.actions && msg.actions.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {msg.actions.map((action, i) => (
                            <button
                              key={i}
                              onClick={() => handleActionClick(action)}
                              className="text-xs px-2 py-1 bg-neutral-700 rounded-full hover:bg-neutral-600"
                            >
                              {action.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}

              {isLoading && !actionType && (
                // Standard typing indicator for normal chat (3 dots)
                <div className="flex justify-start">
                  <div className="bg-neutral-800 text-gray-200 p-3 rounded-lg rounded-tl-none">
                    <motion.div
                      className="flex space-x-2"
                      variants={typingDotsVariants}
                      animate="animate"
                    >
                      <div className="h-2 w-2 bg-gray-400 rounded-full"></div>
                      <div className="h-2 w-2 bg-gray-400 rounded-full"></div>
                      <div className="h-2 w-2 bg-gray-400 rounded-full"></div>
                    </motion.div>
                  </div>
                </div>
              )}

              {isLoading && actionType && (
                // Custom loader for action buttons with spinning logo and fun facts
                <div className="flex justify-start">
                  <div className="bg-neutral-800 text-gray-200 p-3 rounded-lg rounded-tl-none max-w-[90%]">
                    <div className="flex flex-col items-center">
                      <motion.img
                        src={DFSpin}
                        className="w-8 h-8 mb-2"
                        variants={spinVariants}
                        animate="animate"
                        alt="Loading..."
                      />
                      <p className="text-xs text-gray-300 italic text-center mt-1 max-w-[200px]">
                        {currentFunFact}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Message Scheduler UI - Shown when scheduling is active */}
            {showScheduler && (
              <div className="absolute inset-0 bg-neutral-900/95 z-10 flex items-center justify-center">
                <ScheduleMessageUI
                  step={schedulingStep}
                  message={scheduledMessage}
                  date={scheduledDate}
                  time={scheduledTime}
                  timezone={scheduledTimezone}
                  onMessageChange={setScheduledMessage}
                  onDateChange={(date) => {
                    setScheduledDate(date);
                    setSchedulingStep('date');
                    // Clear any previous error message when a new date is selected
                    setSchedulingError("");
                  }}
                  onTimeChange={(time) => {
                    // Always update the time value
                    setScheduledTime(time);

                    // If we're coming from the date step, change to time step
                    if (schedulingStep === 'date') {
                      setSchedulingStep('time');
                    } else if (schedulingStep === 'time') {
                      // If we're already on time step, run validation
                      // but don't block the time change
                      validateTimeSelection(time);
                    }
                  }}
                  onTimezoneChange={setScheduledTimezone}
                  onBack={handleSchedulerBack}
                  onSchedule={scheduleMessage}
                  error={schedulingError}
                  onValidateDate={validateDateSelection}
                  onValidateTime={validateTimeSelection}
                />
              </div>
            )}

            {/* Input */}
            <form onSubmit={handleSubmit} className="p-2 border-t border-neutral-700 bg-neutral-800">
              <div className="flex items-center border rounded-lg bg-neutral-700">
                <textarea
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  placeholder="Ask about your messages..."
                  className="flex-1 bg-neutral-700 text-white p-2 pl-3 rounded-l-lg focus:outline-none text-sm"
                  disabled={isLoading || showScheduler}
                />

                <div className="flex items-center space-x-2 pr-2 rounded-r-lg bg-neutral-700">
                  <button
                    type="button"
                    className="w-auto h-auto text-gray-600 bg-neutral-700 hover:text-blue-500 focus:outline-none transition-colors"
                    onClick={toggleVoiceModal}
                    aria-label="Voice mode"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" className="h-6 w-6">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 0 1-7 7m0 0a7 7 0 0 1-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 0 1-3-3V5a3 3 0 1 1 6 0v6a3 3 0 0 1-3 3z" />
                    </svg>
                  </button>

                <button
                  type="submit"
                  className="bg-purple-600 text-white p-2 rounded-r-lg hover:bg-purple-700 disabled:opacity-50 flex items-center justify-center w-auto"
                  disabled={isLoading || !inputValue.trim() || showScheduler}
                >
                  <FiSend className="w-5 h-5" />
                </button>
                </div>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default Chatbot;