import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import api from '../utils/api';
import { toast } from 'react-hot-toast';
import logger from '../utils/logger';
import { useTheme } from '../context/ThemeContext';
import {
  FiBarChart2,
  FiPieChart,
  FiActivity,
  FiCalendar,
  FiClock,
  FiMessageCircle,
  FiUsers,
  FiRefreshCw,
  FiCheck,
  FiChevronDown,
  FiCheckCircle,
  FiInfo,
  FiAlertCircle,
  FiArrowUp,
  FiArrowDown
} from 'react-icons/fi';
import { fetchContacts } from '../store/slices/contactSlice';
import { fetchMessages } from '../store/slices/messageSlice';
import { createSelector } from '@reduxjs/toolkit';
import ContactAvatar from './ContactAvatar';
import '../styles/CardStyles.css';
import { initReportCardAnimations } from '../script';

// Chart components - in a real app, you'd import proper chart libraries like recharts or chart.js
const BarChart = ({ data, title }) => {
  // Get the maximum value, ensure it's at least 1 to avoid division by zero
  const maxValue = Math.max(1, ...data.map(d => d.value));
  const hasData = data.some(item => item.value > 0);

  const { isDarkTheme } = useTheme();

  return (
  <div className={`p-4 rounded-lg theme-transition ${isDarkTheme ? 'bg-neutral-800' : 'bg-white border border-gray-200'}`}>
    <h3 className={`text-sm font-medium mb-3 flex items-center gap-2 theme-transition ${isDarkTheme ? 'text-gray-300' : 'text-gray-700'}`}>
      <FiBarChart2 className="text-purple-500" /> {title}
    </h3>

      {hasData ? (
    <div className="h-48 flex items-end justify-between gap-1">
      {data.map((item, index) => (
        <div key={index} className="flex flex-col items-center flex-1">
              {item.value > 0 && (
          <div
                  className="w-full bg-purple-500 rounded-t-sm"
            style={{
                    height: `${Math.max(5, (item.value / maxValue) * 100)}%`,
                    opacity: 0.8
            }}
          ></div>
              )}
          <span className="text-xs text-gray-400 mt-1">{item.label}</span>
              <span className={`text-xs ${item.value > 0 ? 'text-purple-400 font-medium' : 'text-gray-500'}`}>
                {item.value}
              </span>
        </div>
      ))}
    </div>
      ) : (
        <div className="h-48 flex items-center justify-center">
          <p className="text-gray-400 text-sm">No message data available for this period</p>
        </div>
      )}
  </div>
);
};

const PieChart = ({ data, title }) => {
  // Calculate total for percentages
  const total = data.reduce((sum, item) => sum + item.value, 0);

  // Calculate each segment's angle
  let startAngle = 0;
  const segments = data.map((item, index) => {
    const percent = item.value / total;
    const angle = percent * 360;
    const segment = {
      color: `hsl(${index * (360 / data.length)}, 70%, 50%)`,
      startAngle,
      endAngle: startAngle + angle,
      percent,
      label: item.label,
      value: item.value
    };
    startAngle += angle;
    return segment;
  });

  return (
    <div className="bg-neutral-800 p-4 rounded-lg">
      <h3 className="text-sm font-medium text-gray-300 mb-3 flex items-center gap-2">
        <FiPieChart className="text-purple-500" /> {title}
      </h3>
      <div className="flex">
        <div className="relative w-32 h-32">
          <svg viewBox="0 0 100 100">
            {segments.map((segment, i) => {
              // Convert angles to radians for SVG arc
              const startRad = (segment.startAngle - 90) * Math.PI / 180;
              const endRad = (segment.endAngle - 90) * Math.PI / 180;

              // Calculate the coordinates
              const x1 = 50 + 40 * Math.cos(startRad);
              const y1 = 50 + 40 * Math.sin(startRad);
              const x2 = 50 + 40 * Math.cos(endRad);
              const y2 = 50 + 40 * Math.sin(endRad);

              // Determine if the arc should take the long path
              const largeArcFlag = segment.endAngle - segment.startAngle <= 180 ? '0' : '1';

              return (
                <path
                  key={i}
                  d={`M 50 50 L ${x1} ${y1} A 40 40 0 ${largeArcFlag} 1 ${x2} ${y2} Z`}
                  fill={segment.color}
                />
              );
            })}
          </svg>
        </div>
        <div className="flex-1 ml-4">
          <div className="space-y-2">
            {segments.map((segment, i) => (
              <div key={i} className="flex items-center text-xs">
                <div className="w-3 h-3 mr-2" style={{ backgroundColor: segment.color }}></div>
                <span className="text-gray-300">{segment.label}</span>
                <span className="text-gray-400 ml-auto">{Math.round(segment.percent * 100)}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

const MetricCard = ({ icon: Icon, title, value, change, isPositive }) => (
  <div className="bg-neutral-800 p-4 rounded-lg">
    <div className="flex justify-between items-start mb-3">
      <h3 className="text-sm font-medium text-gray-300">{title}</h3>
      <div className="p-1 bg-purple-600/20 rounded-md">
        <Icon className="text-purple-500 w-4 h-4" />
      </div>
    </div>
    <div className="flex items-baseline">
      <span className="text-2xl font-bold text-white mr-2">{value}</span>
      {change !== undefined && (
        <span className={`text-xs font-medium flex items-center ${isPositive ? 'text-green-500' : 'text-red-500'}`}>
          {isPositive ? (
            <>
              <FiArrowUp className="mr-1" />
              {Math.abs(change).toFixed(1)}%
            </>
          ) : (
            <>
              <FiArrowDown className="mr-1" />
              {Math.abs(change).toFixed(1)}%
            </>
          )}
        </span>
      )}
    </div>
  </div>
);

// Update the MessageCountCard component to handle the props properly
const MessageCountCard = ({ title, count, icon, loading }) => (
    <div className="bg-neutral-50 rounded-lg p-4 text-center flex-1 min-w-[150px]">
    <p className="text-neutral-700 text-sm mb-1">{title}</p>
      <div className="flex items-center justify-center">
      {loading ? (
        <FiRefreshCw className="animate-spin text-purple-500 mr-2" />
      ) : (
        <>
          <p className="text-3xl font-bold text-neutral-900">{count || 0}</p>
          {icon === 'send' ? (
            <FiArrowUp className="text-green-500 ml-2" />
          ) : (
        <FiArrowDown className="text-red-500 ml-2" />
          )}
        </>
      )}
      </div>
    </div>
);

// Helper function to check if a timestamp is from today
const isToday = (timestamp) => {
  if (!timestamp) return false;
  const today = new Date();
  const date = new Date(timestamp);
  return date.getDate() === today.getDate() &&
         date.getMonth() === today.getMonth() &&
         date.getFullYear() === today.getFullYear();
};

// Helper to format timestamp in Month Day year - time with period of day format
const formatTimestamp = (timestamp) => {
  if (!timestamp) return 'N/A';

  const date = new Date(timestamp);

  // Month Day, Year
  const dateOptions = {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  };
  const dateStr = date.toLocaleDateString('en-US', dateOptions);

  // Time with AM/PM
  const timeOptions = {
    hour: 'numeric',
    minute: 'numeric',
    hour12: true
  };
  const timeStr = date.toLocaleTimeString('en-US', timeOptions);

  // Determine time of day
  const hour = date.getHours();
  let periodOfDay;
  if (hour >= 5 && hour < 12) {
    periodOfDay = "in the morning";
  } else if (hour >= 12 && hour < 17) {
    periodOfDay = "in the afternoon";
  } else if (hour >= 17 && hour < 21) {
    periodOfDay = "in the evening";
  } else {
    periodOfDay = "at night";
  }

  return `${dateStr} - at ${timeStr} ${periodOfDay}`;
};

// Function to determine if the day has changed since last cache
const hasDayChanged = (cachedTimestamp) => {
  if (!cachedTimestamp) return true;

  const cachedDate = new Date(cachedTimestamp);
  const now = new Date();

  // Compare year, month, and day
  return cachedDate.getFullYear() !== now.getFullYear() ||
         cachedDate.getMonth() !== now.getMonth() ||
         cachedDate.getDate() !== now.getDate();
};

// Add these helper functions near the top of the file
const getCacheKey = (type, userId, contactId, timePeriod = null) => {
  if (timePeriod) {
    return `analytics_cache:${type}:${userId}:${contactId}:${timePeriod}`;
  }
  return `analytics_cache:${type}:${userId}:${contactId}`;
};

const isCacheValid = (cacheTimestamp, expiryHours) => {
  if (!cacheTimestamp) return false;
  const now = new Date().getTime();
  const expiry = expiryHours * 60 * 60 * 1000; // Convert hours to milliseconds
  return (now - cacheTimestamp) < expiry;
};

// Enhanced DailyReportCard with API integration and caching
const DailyReportCard = ({ contactId }) => {
  const [reportData, setReportData] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [cacheTimestamp, setCacheTimestamp] = useState(null);
  const [forceRefresh, setForceRefresh] = useState(false);
  const userId = useSelector(state => state.auth.user?.id);

  const cacheKey = getCacheKey('dailyReport', userId, contactId);

  // Initialize report card animations when component mounts or updates
  useEffect(() => {
    // Small timeout to ensure the DOM is fully rendered
    const timer = setTimeout(() => {
      if (reportData?.report) {
        initReportCardAnimations();
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [reportData]);

  // Fetch priority data when contact or time period changes
  useEffect(() => {
    if (contactId && userId) {
      fetchDailyReportWithCache();
    }
  }, [contactId, userId]);

  const fetchDailyReportWithCache = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const cacheKey = getCacheKey('dailyReport', userId, contactId);
      const cachedReport = localStorage.getItem(cacheKey);

      if (cachedReport) {
        const parsedCache = JSON.parse(cachedReport);

        // Check if cache is from today and has valid data
        if (!hasDayChanged(parsedCache.timestamp) &&
            parsedCache.data &&
            parsedCache.data.report &&
            !parsedCache.data.error) {
          console.log("Using cached daily report:", parsedCache.data);
          setReportData(parsedCache.data);
          // setCacheTimestamp(parsedCache.timestamp);
          // setError(null);
          setIsLoading(false);
          return;
        }
      }

      // If no valid cache or there was an error before, fetch new data
      const response = await api.get(`api/v1/priority/daily-report-analysis/${contactId}`);

      if (response.data) {
        const newData = response.data;

        // Only cache if we got a valid report with no errors
        if (newData.report && !newData.error) {
          setReportData(newData);
          localStorage.setItem(cacheKey, JSON.stringify({
            data: newData,
            timestamp: Date.now()
          }));
        }

        // setCacheTimestamp(Date.now());
      } else {
        setError("Failed to generate daily report");
      }
    } catch (error) {
      console.error("Error fetching daily report:", error);
      setError("Error generating daily report");
    } finally {
      setIsLoading(false);
    }
  };

  const handleRefreshClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    logger.info(`[DailyReportCard] Manual refresh triggered for contact ${contactId}`);
    setForceRefresh(true);
  };

  // Render list items for each report section
  const renderListItems = (items) => {
    if (!items || items.length === 0) return <p className="text-neutral-700 text-xs">None identified.</p>;

    return (
      <ul className="list-disc list-inside text-neutral-400 text-xs space-y-1 px-2 py-1 bg-opacity-50 rounded-md ">
        {items.map((item, index) => (
          <li key={index}>{item}</li>
        ))}
      </ul>
    );
  };

  // Customize the status message based on messagesAnalyzed
  const getStatusMessage = () => {
    if (!reportData) return "";

    const timeStr = reportData.lastMessageTimestamp
      ? formatTimestamp(reportData.lastMessageTimestamp)
      : "No messages found";

    if (reportData.messagesAnalyzed === 'today') {
      return (
        <span className='mt-4 flex items-center justify-between'>
          The last message is on {timeStr}. Want to get another quick report?{' '}
          <button
            onClick={handleRefreshClick}
            className="w-auto text-purple-400 bg-neutral-700 hover:text-purple-800 hover:underline"
          >
            click here
          </button>
        </span>
      );
    }
    else if (reportData.messagesAnalyzed === 'refreshed') {
      return (
        <span>
          The last message is on {timeStr}. Since the messages are not today's,{' '}
          <button
            onClick={handleRefreshClick}
            className="ml-1 text-purple-400 bg-neutral-700 hover:text-purple-800 hover:underline"
          >
            want to try again?
          </button>
        </span>
      );
    }
    else { // 'none'
      return (
        <span>
          {reportData.lastMessageTimestamp ? `The last message is on ${timeStr}.` : "No message history found."}{' '}
          No recent activity, but{' '}
          <button
            onClick={handleRefreshClick}
            className="ml-1 text-purple-400 bg-neutral-700 hover:text-purple-800 hover:underline"
          >
            wanna try again?
          </button>
        </span>
      );
    }
  };

  // If no contact is selected yet
  if (!contactId) {
    return (
      <div className="mb-6">
        <div className="inline-flex items-center bg-green-100 px-3 py-1 rounded-md mb-4">
          <FiCheck className="text-green-700 mr-1" />
          <span className="text-green-700 text-sm font-medium">Daily Report</span>
      </div>

        <div className="p-4 bg-neutral-50 rounded-lg text-center">
          <p className="text-neutral-600 text-sm">Select a contact to view daily report.</p>
    </div>
  </div>
);
  }

  return (
  <div className="mb-6">
    <div className="inline-flex items-center bg-green-100 px-3 py-1 rounded-md mb-4">
      <FiCheck className="text-green-700 mr-1" />
      <span className="text-green-700 text-sm font-medium">Daily Report</span>

        {/* Badge for refresh status */}
        {(reportData?.messagesAnalyzed === 'refreshed' || reportData?.messagesAnalyzed === 'none') && (
          <span className="ml-2 inline-flex items-center text-purple-800 text-xs px-1 py-0.5 rounded">
            <button onClick={handleRefreshClick} className='flex items-center bg-[#7E22CE]' disabled={isLoading} title="Refresh Report">
              <FiRefreshCw className={`w-3 h-3 mr-1 ${isLoading ? 'animate-spin' : ''}`} />
              {reportData?.messagesAnalyzed === 'refreshed' ? 'Not Today' : 'No Data'}
            </button>
          </span>
        )}

        {/* Loading spinner */}
        {isLoading && (
          <FiRefreshCw className="ml-2 w-4 h-4 text-green-700 animate-spin" />
        )}
    </div>

      {/* Error state */}
      {error && !isLoading && (
        <div className="bg-red-50 p-4 rounded-lg mb-4">
          <div className="flex items-start">
            <FiAlertCircle className="text-red-600 w-5 h-5 mt-0.5 mr-2" />
            <p className="text-red-800 text-sm">Something went wrong.</p>
          </div>
        </div>
      )}

      {/* Loading state with no data */}
      {isLoading && !reportData && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-neutral-100 p-4 rounded-lg animate-pulse h-20"></div>
          <div className="bg-neutral-100 p-4 rounded-lg animate-pulse h-20"></div>
          <div className="bg-neutral-100 p-4 rounded-lg animate-pulse h-20"></div>
        </div>
      )}

      {/* Content when data is available */}
      {reportData?.report && (
  <>
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <div className="report-card green-card animated bg-green-100 p-4 rounded-lg">
        <div className="border-top"></div>
        <div className="border-right"></div>
        <div className="border-bottom"></div>
        <div className="border-left"></div>
        <div className="report-card-content">
          <h4 className="font-semibold text-neutral-300 text-[15px] mb-2">Highlights</h4>
          {renderListItems(reportData.report.highlights)}
        </div>
      </div>

      <div className="report-card neutral-card animated bg-neutral-300 p-4 rounded-lg">
        <div className="border-top"></div>
        <div className="border-right"></div>
        <div className="border-bottom"></div>
        <div className="border-left"></div>
        <div className="report-card-content">
          <h4 className="font-semibold text-neutral-300 text-[15px] mb-2">Key Decisions</h4>
          {renderListItems(reportData.report.keyDecisions)}
        </div>
      </div>

      <div className="report-card red-card animated bg-red-100 p-4 rounded-lg">
        <div className="border-top"></div>
        <div className="border-right"></div>
        <div className="border-bottom"></div>
        <div className="border-left"></div>
        <div className="report-card-content">
          <h4 className="font-semibold text-neutral-300 text-[15px] mb-2">Actions</h4>
          {renderListItems(reportData.report.actionsTaken)}
        </div>
      </div>
    </div>

    <div className="mt-2 text-xs text-neutral-500">
      {getStatusMessage()}
    </div>
  </>
      )}

      {/* No data available */}
      {!isLoading && (!reportData || !reportData.report) && (
        <div className="p-4 bg-neutral-50 rounded-lg text-center">
          <p className="text-neutral-600 text-sm">
            {reportData?.messagesAnalyzed === 'none'
              ? 'No recent messages found to generate a report.'
              : 'Failed to load report data.'}
          </p>
          {reportData && (
            <div className="mt-2 text-xs text-neutral-500">
              {getStatusMessage()}
            </div>
          )}
        </div>
      )}
  </div>
);
};

// Fix priority UI with better colors and glow effects
const PrioritizationBadge = ({ contactId }) => {
  const [showWhyPopup, setShowWhyPopup] = useState(false);
  const [timePeriod, setTimePeriod] = useState("today");
  const [priorityData, setPriorityData] = useState(null);
  const [loading, setLoading] = useState(false);
  const popupRef = useRef(null);
  const userId = useSelector(state => state.auth.user?.id);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (popupRef.current && !popupRef.current.contains(event.target)) {
        setShowWhyPopup(false);
      }
    };

    if (showWhyPopup) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showWhyPopup]);

  // Fetch priority data when contact or time period changes, with caching
  useEffect(() => {
    if (contactId && userId) {
      fetchPriorityDataWithCache();
    }
  }, [contactId, timePeriod, userId]);

  const fetchPriorityDataWithCache = async () => {
    try {
      setLoading(true);

      // Create cache key specific to this contact, user, and time period
      const cacheKey = getCacheKey('priority', userId, contactId, timePeriod);

      // Check if we have cached data
      const cachedData = localStorage.getItem(cacheKey);

      if (cachedData) {
        const parsedCache = JSON.parse(cachedData);

        // Check if cache is still valid (less than 3 hours old)
        if (isCacheValid(parsedCache.timestamp, 3)) {
          console.log("Using cached priority data:", parsedCache.data);
          setPriorityData(parsedCache.data);
          setLoading(false);
          return;
        }
      }

      // If no valid cache, make API request
      const response = await api.get(`/api/v1/priority/contact/${contactId}/overview?timePeriod=${timePeriod}`);

      if (response.data && response.data.success) {
        const newData = response.data.data;
        setPriorityData(newData);

        // Cache the successful result with timestamp
        localStorage.setItem(cacheKey, JSON.stringify({
          data: newData,
          timestamp: Date.now()
        }));

        console.log("Fetched fresh priority data:", newData);
      } else {
        console.error("Failed to fetch priority data:", response);
      }
    } catch (error) {
      console.error("Error fetching priority data:", error);
    } finally {
      setLoading(false);
    }
  };

  // Determine priority details for UI elements
  const getPriorityDetails = () => {
    if (!priorityData) {
      return {
        color: "green",
        textColor: "text-green-500",
        iconColor: "text-green-600",
        bgColor: "bg-green-100",
        glow: false,
        text: "Low priority"
      };
    }

    // Find the highest priority with non-zero count
    if (priorityData.priorityCounts.urgent > 0) {
      return {
        color: "red",
        textColor: "text-red-500",
        iconColor: "text-red-600",
        bgColor: "bg-red-100",
        glow: true,
        text: "Urgent attention needed!"
      };
    }

    if (priorityData.priorityCounts.high > 0) {
      return {
        color: "red",
        textColor: "text-red-500",
        iconColor: "text-red-600",
        bgColor: "bg-red-100",
        glow: true,
        text: "High priority"
      };
    }

    if (priorityData.priorityCounts.medium > 0) {
      return {
        color: "yellow",
        textColor: "text-yellow-600",
        iconColor: "text-yellow-700",
        bgColor: "bg-yellow-100",
        glow: false,
        text: "Medium priority"
      };
    }

    return {
      color: "green",
      textColor: "text-green-500",
      iconColor: "text-green-600",
      bgColor: "bg-green-100",
      glow: false,
      text: "Low priority"
    };
  };

  const priorityDetails = getPriorityDetails();

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-4">
        <div className="inline-flex items-center bg-green-100 px-3 py-1 rounded-md">
        <FiCheck className="text-green-700 mr-1" />
        <span className="text-green-700 text-sm font-medium">Prioritization</span>
      </div>

        <div className="flex items-center gap-2">
          <select
            value={timePeriod}
            onChange={e => setTimePeriod(e.target.value)}
            className="text-xs bg-neutral-200 border border-neutral-300 rounded px-2 py-1"
          >
            <option value="today">Today</option>
            <option value="last_2_days">Last 2 Days</option>
            <option value="last_week">Last Week</option>
            <option value="last_month">Last Month</option>
          </select>

          <button
            onClick={() => setShowWhyPopup(true)}
            className="bg-neutral-700 hover:bg-neutral-600 bg-opacity-80 rounded-full p-1.5 transition-all duration-200"
          >
            <FiInfo className="text-neutral-400 w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="relative">
        {/* Contact Avatars */}
        <div className="flex -space-x-2 mb-3">
          <img src="https://randomuser.me/api/portraits/men/32.jpg" alt="Contact 1" className="w-10 h-10 rounded-full border-2 border-white" />
          <img src="https://randomuser.me/api/portraits/women/44.jpg" alt="Contact 2" className="w-10 h-10 rounded-full border-2 border-white" />
          <img src="https://randomuser.me/api/portraits/men/86.jpg" alt="Contact 3" className="w-10 h-10 rounded-full border-2 border-white" />
          <div className="w-10 h-10 rounded-full bg-neutral-300 border-2 border-white flex items-center justify-center text-xs font-medium text-neutral-600">+1</div>
        </div>

        {/* AI Suggestion - Dynamic based on priority data */}
        <div className={`rounded-md p-2 flex items-center ${priorityDetails.glow ? 'shadow-md' : ''}`}>
          <FiAlertCircle
            className={`${priorityDetails.iconColor} mr-2 ${priorityDetails.glow ? 'animate-pulse shadow-lg' : ''}`}
            style={priorityDetails.glow ? {filter: 'drop-shadow(0 0 4px rgba(220, 38, 38, 0.8))'} : {}}
          />
          <span className={`${priorityDetails.textColor} text-sm font-medium`}>
            {loading ? "Loading priority data..." : `AI suggestion: ${priorityDetails.text}`}
          </span>
          <button
            onClick={() => setShowWhyPopup(true)}
            className={`ml-auto w-auto ${priorityDetails.glow ? 'bg-red-800 hover:bg-red-700' : 'bg-neutral-700 hover:bg-neutral-600'} bg-opacity-80 rounded-full p-1.5 transition-all duration-200`}
            style={priorityDetails.glow ? {animation: 'pulse 2s infinite', boxShadow: '0 0 8px rgba(220, 38, 38, 0.5)'} : {}}
          >
            <FiInfo className={`${priorityDetails.glow ? 'text-red-200' : 'text-neutral-400'} w-4 h-4`} />
          </button>
        </div>

        {/* Why Popup with API data */}
        {showWhyPopup && (
          <div
            ref={popupRef}
            className={`absolute right-0 top-full mt-2 ${priorityDetails.glow ? 'bg-red-50 border border-red-200' : 'bg-white'} rounded-lg shadow-lg p-4 w-72 z-10`}
          >
            <h3 className={`text-lg font-semibold ${priorityDetails.glow ? 'text-red-800' : 'text-neutral-800'} mb-2`}>Why?</h3>
            <p className={`text-sm ${priorityDetails.glow ? 'text-red-700' : 'text-neutral-600'}`}>
              {priorityData?.priorityReason || "Loading reason..."}
            </p>
            <div className="mt-3 flex justify-end">
              <button className={`${priorityDetails.glow ? 'bg-red-200 text-red-800' : 'bg-neutral-200'} px-3 py-1 rounded text-sm`}>Rate us</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// AI Suggestion Feedback popup
const AIFeedbackPopup = ({ isOpen, onClose }) => {
  const popupRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (popupRef.current && !popupRef.current.contains(event.target)) {
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

  return (
    <div
      ref={popupRef}
      className="fixed bottom-6 right-6 bg-white rounded-lg shadow-lg p-4 w-64 z-50 animate-fadeIn"
    >
      <p className="text-sm font-medium text-neutral-800 mb-2">Is AI suggestion accurate?</p>
      <p className="text-xs text-neutral-600 mb-3">Did We help you prioritize your conversations? Help us improve.</p>
      <div className="flex space-x-2">
        <button
          onClick={onClose}
          className="flex-1 flex items-center justify-center gap-1 bg-emerald-600 text-white py-1 px-3 rounded text-xs"
        >
          <FiCheck size={12} />
          <span>Yay, Indeed.</span>
        </button>
        <button
          onClick={onClose}
          className="flex-1 flex items-center justify-center gap-1 bg-red-400 text-white py-1 px-3 rounded text-xs"
        >
          <span>Nope</span>
        </button>
      </div>
    </div>
  );
};

// Add this helper function to get day names
const getDayName = (dayIndex) => {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return days[dayIndex];
};

/**
 * AnalyticsDashboard component provides data visualization for messaging statistics
 */
const AnalyticsDashboard = () => {
  const { isDarkTheme } = useTheme();
  const [dateRange, setDateRange] = useState('7days');
  const [isLoading, setIsLoading] = useState(false);
  const [selectedContact, setSelectedContact] = useState(null);
  const [showFeedbackPopup, setShowFeedbackPopup] = useState(false);
  const [chartDataTimestamp, setChartDataTimestamp] = useState(null);

  // Initialize with default empty data

  const { user } = useSelector(state => state.auth);
  const { contacts, loading: contactsLoading } = useSelector(state => ({
    // The contacts slice stores the items in an "items" array property
    contacts: state.contacts.items,
    loading: state.contacts.loading
  }));
  const { messages, loading: messagesLoading } = useSelector(state => state.messages);
  const dispatch = useDispatch();

  // Add this near the top of the component
  const messageFetchedRef = useRef({});

  // Fetch contacts only if needed
  useEffect(() => {
    // Check if contacts are already loaded in the store
    if (!contacts || contacts.length === 0) {
      console.log('Contacts not in store, fetching now...');
      dispatch(fetchContacts());
    } else {
      console.log('Using existing contacts from store:', contacts.length);
    }
  }, [dispatch, contacts]);

  // Get messages for the selected contact at the component level
  const contactMessages = useSelector(state =>
    selectedContact?.id ? state.messages.items[selectedContact.id] || [] : []
  );

  // Then modify the useEffect that fetches messages
  useEffect(() => {
    if (selectedContact?.id) {
      // Only fetch if we haven't already fetched for this contact
      if (!messageFetchedRef.current[selectedContact.id] &&
          (!contactMessages || contactMessages.length === 0)) {
        console.log(`Fetching messages for contact: ${selectedContact.id}`);
        dispatch(fetchMessages({
          contactId: selectedContact.id,
          page: 0,
          limit: 20
        }));

        // Mark this contact as fetched
        messageFetchedRef.current[selectedContact.id] = true;
      } else {
        console.log(`Using ${contactMessages?.length || 0} existing messages for contact: ${selectedContact.id}`);
      }
    }
  }, [dispatch, selectedContact]); // Remove contactMessages from dependency array

  // Calculate message counts WITHOUT using hooks inside
  const calculateMessageCounts = () => {
    if (!selectedContact?.id || !contactMessages || contactMessages.length === 0) {
      return { sent: 0, received: 0 };
    }

    // Count sent messages (from the user)
    const sentCount = contactMessages.filter(msg =>
      (msg.sender_id && msg.sender_id.includes('matrix')) ||
      msg.is_from_me === true
    ).length;

    // Count received messages (from the contact)
    const receivedCount = contactMessages.filter(msg =>
      !(msg.sender_id && msg.sender_id.includes('matrix')) &&
      msg.is_from_me !== true
    ).length;

    return { sent: sentCount, received: receivedCount };
  };

  // Calculate the counts in a memoized way for performance
  const messageCounts = useMemo(() =>
    calculateMessageCounts(),
    [selectedContact, contactMessages]
  );

  useEffect(() => {
    // In the actual implementation, this would fetch data for the selected contact
    if (selectedContact) {
      fetchAnalyticsData();
      // Show feedback popup after 5 seconds when a contact is selected
      const timer = setTimeout(() => {
        setShowFeedbackPopup(true);
      }, 5000);

      return () => clearTimeout(timer);
    }
  }, [selectedContact, dateRange]);

  const fetchAnalyticsData = async () => {
    setIsLoading(true);
    try {
      // In a real implementation, you would fetch data from the API
      console.log('Fetching analytics data for contact:', selectedContact?.id);

      // For now, just simulate a delay
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (error) {
      console.error('Error fetching analytics data:', error);
      toast.error('Failed to load analytics data');
    } finally {
      setIsLoading(false);
    }
  };

  // Loading placeholder data for development/preview
  const placeholderData = {
    metrics: {
      totalMessages: 1243,
      totalMessagesChange: 12.5,
      activeContacts: 87,
      activeContactsChange: -3.2
    },
    charts: {
      messagesByDay: [
        { label: 'Mon', value: 120 },
        { label: 'Tue', value: 145 },
        { label: 'Wed', value: 132 },
        { label: 'Thu', value: 156 },
        { label: 'Fri', value: 142 },
        { label: 'Sat', value: 80 },
        { label: 'Sun', value: 68 }
      ],
      messagesByPlatform: [
        { label: 'WhatsApp', value: 652 },
        { label: 'Instagram', value: 341 },
        { label: 'Discord', value: 250 }
      ]
    }
  };

  // Recalculate message counts when messages change
  useEffect(() => {
    if (selectedContact && messages) {
      const counts = calculateMessageCounts();
      // You could store these in state if needed
    }
  }, [messages, selectedContact]);

  // Then in the calculateMessagesByDay function, keep the existing code that uses getDayName
  const calculateMessagesByDay = useCallback(() => {
    if (!contactMessages || contactMessages.length === 0) {
      return Array(7).fill(0).map((_, i) => ({
        label: getDayName(i),
        value: 0
      }));
    }

    // Initialize counts for each day
    const dayCounts = Array(7).fill(0);

    // Count messages by day
    contactMessages.forEach(message => {
      const date = new Date(message.timestamp);
      const dayIndex = date.getDay();
      dayCounts[dayIndex]++;
    });

    // Format the data for the chart
    return dayCounts.map((count, index) => ({
      label: getDayName(index),
      value: count
    }));
  }, [contactMessages]);

  // Add this function to calculate message activity by hour
  const calculateMessagesByHour = () => {
    if (!contactMessages || contactMessages.length === 0) {
      // Return placeholder data if no messages
      return Array.from({ length: 24 }, (_, i) => ({
        hour: i,
        label: `${i % 12 === 0 ? 12 : i % 12}${i < 12 ? 'AM' : 'PM'}`,
        value: 0
      }));
    }

    console.log("Calculating hourly message activity...");

    // Create a map to store message counts by hour
    const hourCounts = {};

    // Initialize all hours (0-23)
    for (let i = 0; i < 24; i++) {
      hourCounts[i] = 0;
    }

    // Count messages for each hour
    contactMessages.forEach(message => {
      if (message.timestamp) {
        const date = new Date(message.timestamp);
        const hour = date.getHours();
        hourCounts[hour]++;
      }
    });

    // Convert to array format for the chart (only show 9AM-7PM range)
    const result = [];
    for (let i = 9; i <= 19; i++) {
      result.push({
        hour: i,
        label: `${i % 12 === 0 ? 12 : i % 12}${i < 12 ? 'AM' : 'PM'}`,
        value: hourCounts[i]
      });
    }

    console.log("Hourly activity:", result);
    return result;
  };

  // Filter and sort contacts by recent activity
  const getFilteredSortedContacts = useMemo(() => {
    if (!contacts || contacts.length === 0) return [];

    // Filter out system contacts
    const filteredContacts = contacts.filter(contact =>
      contact.display_name !== 'WhatsApp bridge bot' &&
      contact.display_name !== 'WhatsApp Status Broadcast'
    );

    // Sort by last_message_at (most recent first)
    return [...filteredContacts].sort((a, b) => {
      const dateA = a.last_message_at ? new Date(a.last_message_at) : new Date(0);
      const dateB = b.last_message_at ? new Date(b.last_message_at) : new Date(0);
      return dateB - dateA; // Most recent first
    });
  }, [contacts]);

  // Get top 5 most recent contacts
  const topContacts = useMemo(() => {
    return getFilteredSortedContacts.slice(0, 5);
  }, [getFilteredSortedContacts]);

  const handleContactSelect = (value) => {
    if (!value) {
      setSelectedContact(null);
      return;
    }
    const contact = contacts.find(c => c.id === parseInt(value));
    setSelectedContact(contact);
  };

  // Helper function to format time ago
  const formatTimeAgo = (date) => {
    const now = new Date();
    const diffMs = now - date;
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHour / 24);

    if (diffDay > 0) {
      return `${diffDay} day${diffDay > 1 ? 's' : ''} ago`;
    } else if (diffHour > 0) {
      return `${diffHour} hour${diffHour > 1 ? 's' : ''} ago`;
    } else if (diffMin > 0) {
      return `${diffMin} minute${diffMin > 1 ? 's' : ''} ago`;
    } else {
      return 'Just now';
    }
  };

  // Inside the main component, add a refresh function
  const refreshDashboardData = async () => {
    setIsLoading(true);
    try {
      // Refresh contacts
      await dispatch(fetchContacts());

      // Refresh messages if a contact is selected
      if (selectedContact) {
        await dispatch(fetchMessages({ contactId: selectedContact.id }));
      }

      toast.success('Dashboard data refreshed');
    } catch (error) {
      console.error('Error refreshing dashboard data:', error);
      toast.error('Failed to refresh data');
    } finally {
      setIsLoading(false);
    }
  };

  // Modify the fetchData function to include caching for charts
  const fetchData = async () => {
    try {
      setIsLoading(true);

      if (selectedContact && userId) {
        // Handle caching for message charts
        const chartCacheKey = getCacheKey('charts', userId, selectedContact.id);
        const cachedCharts = localStorage.getItem(chartCacheKey);

        if (cachedCharts && !forceRefresh) {
          const parsedCache = JSON.parse(cachedCharts);

          // Check if cache is valid (less than 2 hours old) and has data
          if (isCacheValid(parsedCache.timestamp, 2) &&
              parsedCache.data &&
              parsedCache.data.length > 0) {
            setContactMessages(parsedCache.data);
            setChartDataTimestamp(parsedCache.timestamp);

            // Still fetch other data that might need to be updated
            // ...

            return;
          }
        }

        // If no valid cache or we need fresh data, fetch messages
        try {
          const messagesResponse = await api.get(`/api/v1/whatsapp-entity/contacts/${selectedContact.id}/messages`);

          if (messagesResponse.data && messagesResponse.data.success) {
            const messages = messagesResponse.data.data;
            setContactMessages(messages);

            // Cache the chart data
            localStorage.setItem(chartCacheKey, JSON.stringify({
              data: messages,
              timestamp: Date.now()
            }));

            setChartDataTimestamp(Date.now());
          }
        } catch (error) {
          console.error("Error fetching messages:", error);
        }

        // Continue with other data fetching
        // ...
      }
    } catch (error) {
      console.error("Error in fetchData:", error);
      toast.error("Failed to load analytics data");
    } finally {
      setIsLoading(false);
      setForceRefresh(false);
    }
  };

  return (
    <div className={`p-4 md:p-6 rounded-lg max-w-6xl mx-auto theme-transition ${isDarkTheme ? 'bg-neutral-900 text-white' : 'bg-gray-50 text-gray-900 border border-gray-200'}`}>
      <div className="flex flex-col md:flex-row justify-between mb-6 items-start md:items-center gap-4">
        {/* <div>
          <h2 className="text-xl font-bold">Analytics Space</h2>
          <p className="text-gray-400 text-sm">Insights from your messaging data</p>
        </div> */}



        <div className="p-6 bg-[url('/img/analytics-bg.jpg')] bg-cover bg-center rounded-lg mb-6 relative w-full">
            <div className="absolute inset-0 bg-gradient-to-r from-purple-900/80 to-indigo-900/80 rounded-lg"></div>
            <div className="relative z-10">
              {/* <h3 className="text-2xl font-bold mb-2">Contact Analytics</h3> */}

              <div className="flex gap-2 justify-between flex-col md:flex-row">
                  <div>
                      <h2 className="text-xl font-bold">Analytics Space</h2>
                      <p className="text-gray-400 text-sm">Your Conversation Snapshot</p>
                  </div>
                {/* Contact Selection and Refresh */}
                <div className="flex items-center gap-2">
                <div className="relative">
                  <select
                      value={selectedContact?.id || ''}
                      onChange={(e) => handleContactSelect(e.target.value)}
                      className="bg-neutral-700 text-white rounded px-2 py-1 text-sm w-32"
                    >
                      <option value="">Select a contact</option>
                      {getFilteredSortedContacts.map(contact => (
                      <option key={contact.id} value={contact.id}>
                          {contact.display_name}
                      </option>
                    ))}
                  </select>
                  <div className="absolute right-2 top-1/2 transform -translate-y-1/2 pointer-events-none">
                      <FiChevronDown className="text-neutral-400" />
                  </div>
                </div>

                <button
                    onClick={refreshDashboardData}
                    className="bg-purple-600 hover:bg-purple-700 text-white px-3 py-1.5 rounded text-sm flex items-center"
                  disabled={isLoading}
                >
                    <FiRefreshCw className={`mr-1 ${isLoading ? 'animate-spin' : ''}`} />
                    {isLoading ? 'Refreshing...' : 'Refresh'}
                </button>
                </div>
              </div>

            </div>
          </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center items-center py-20">
          <FiRefreshCw className="animate-spin text-purple-500 mr-2" />
          <span>Loading analytics data...</span>
        </div>
      ) : selectedContact ? (
        <>
          <div className="bg-neutral-800 bg-opacity-60 p-6 rounded-lg text-black mb-6">
            {/* Prioritization Component - passing contact ID */}
            <PrioritizationBadge contactId={selectedContact?.id} />

            {/* Message Counts */}
            <div className="flex flex-wrap gap-4 mb-6">
              <MessageCountCard
                title="Messages Sent"
                count={messageCounts.sent}
                icon="send"
                loading={messagesLoading}
              />
              <MessageCountCard
                title="Messages Received"
                count={messageCounts.received}
                icon="receive"
                loading={messagesLoading}
              />
            </div>

            {/* Daily Report */}
            <DailyReportCard contactId={selectedContact?.id} />
          </div>

          {/* Metrics overview - reduced to only show relevant metrics */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <MetricCard
              icon={FiMessageCircle}
              title="Total Messages"
              value={contactMessages?.length || 0}
              // change={placeholderData.metrics.totalMessagesChange}
              // isPositive={placeholderData.metrics.totalMessagesChange > 0}
            />
            <MetricCard
              icon={FiUsers}
              title="Active Contacts"
              value={contacts?.length || 0}
              // change={placeholderData.metrics.activeContactsChange}
              // isPositive={placeholderData.metrics.activeContactsChange > 0}
            />
          </div>

          {/* Charts - removed Response Time Trend */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <BarChart
              data={calculateMessagesByDay()}
              title="Communication Rhythm (When Do You Chat Most?)"
            />

            {/* Top contacts list */}
            <div className="bg-neutral-800 p-4 rounded-lg">
              <h3 className="text-sm font-medium text-gray-300 mb-4 flex items-center gap-2">
                <FiUsers className="text-purple-500" /> Recent Activity
              </h3>

              <div className="space-y-3">
                {topContacts.length > 0 ? (
                  topContacts.map((contact, i) => {
                    // Calculate time since last message
                    const lastMessageDate = contact.last_message_at ? new Date(contact.last_message_at) : null;
                    const timeAgo = lastMessageDate ? formatTimeAgo(lastMessageDate) : 'Never';

                    // Use first letter of name for avatar
                    const initial = contact.display_name ? contact.display_name.charAt(0).toUpperCase() : '?';

                    return (
                      <div key={contact.id} className="flex items-center">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-400 to-indigo-600 flex items-center justify-center text-xs font-bold text-white">
                          {initial}
                    </div>
                    <div className="ml-3">
                          <p className="text-sm font-medium text-gray-300">{contact.display_name}</p>
                          <p className="text-xs text-gray-400">Last active: {timeAgo}</p>
                    </div>
                    <div className="ml-auto flex flex-col items-end">
                      {/* <span className="text-xs text-gray-300">
                            {contact.message_count || 0} messages
                      </span> */}
                      <span className="text-xs text-gray-400">
                            {lastMessageDate ? lastMessageDate.toLocaleDateString() : 'No messages'}
                      </span>
                    </div>
                  </div>
                    );
                  })
                ) : (
                  <div className="text-center text-sm text-gray-400 py-4">
                    No active contacts found
              </div>
                )}
              </div>
            </div>
          </div>

          {/* Messaging Activity by Hour */}

          {/* Feedback Popup */}
          <AIFeedbackPopup
            isOpen={showFeedbackPopup}
            onClose={() => setShowFeedbackPopup(false)}
          />
        </>
      ) : (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <FiBarChart2 className="w-16 h-16 text-purple-500/50 mb-4" />
          <h3 className="text-xl font-medium text-white mb-2">Select a contact to view analytics</h3>
          <p className="text-gray-400">Choose a contact from the dropdown above to see analytics and insights.</p>
        </div>
      )}

      <div className="text-center text-xs text-gray-400 mt-8">
        <p>Data refreshed {new Date().toLocaleString()}</p>
        <p>For demonstration purposes only. In production, connects to the analytics microservice.</p>
      </div>
    </div>
  );
};

export default AnalyticsDashboard;