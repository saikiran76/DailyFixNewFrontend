import { useState } from 'react';
import { FiCalendar, FiClock, FiAlertCircle, FiChevronDown, FiChevronUp } from 'react-icons/fi';
import toast from 'react-hot-toast';
import api from '../../utils/api';
import logger from '../utils/logger';
import '../../styles/aiAssistant.css'

/**
 * AI Action Buttons Component
 *
 * Displays quick action buttons for AI assistant features like Daily Report,
 * Quick Summary, and Priority Analysis.
 */
const AIActionButtons = ({ actions = [], roomId, client, messages: externalMessages }) => {
  // Default actions if none provided
  const defaultActions = [
    {
      action_type: 'daily_report',
      display_text: 'Daily Report',
      description: 'Get a summary of today\'s conversation'
    },
    {
      action_type: 'quick_summary',
      display_text: 'Quick Summary',
      description: 'Summarize recent messages'
    },
    {
      action_type: 'priority_analysis',
      display_text: 'Priority Analysis',
      description: 'Analyze conversation priority'
    }
  ];

  // Use provided actions or default ones
  const actionButtons = actions.length > 0 ? actions : defaultActions;
  const [expanded, setExpanded] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [activeAction, setActiveAction] = useState(null);

  // Handle action button click
  const handleActionClick = async (action) => {
    if (isLoading) return;

    setIsLoading(true);
    setActiveAction(action.action_type);

    // Create a toast ID for tracking
    const toastId = toast.loading(`Processing ${action.display_text}...`);

    try {

      // Get room
      let room;
      try {
        room = client.getRoom(roomId);
      } catch (roomError) {
        logger.error(`[AIActionButtons] Error getting room:`, roomError);
        toast.error(`Error accessing chat room. Please try again later.`, { id: toastId });
        setIsLoading(false);
        setActiveAction(null);
        return;
      }

      if (!room) {
        logger.error(`[AIActionButtons] Room not found: ${roomId}`);
        toast.error(`Chat room not found. Please try again later.`, { id: toastId });
        setIsLoading(false);
        setActiveAction(null);
        return;
      }

      // Get room context
      const roomContext = {
        room_id: roomId,
        name: room.name || 'Unknown Room',
        members: room.getJoinedMembers().map(member => ({
          user_id: member.userId,
          display_name: member.name
        }))
      };

      // Get user context
      const userContext = {
        user_id: client.getUserId(),
        display_name: client.getUser(client.getUserId())?.displayName || 'User'
      };

      // Use external messages if provided, otherwise get messages from the room
      let messages = [];

      if (externalMessages && externalMessages.length > 0) {
        // Use the messages passed from TelegramChatView
        logger.info(`[AIActionButtons] Using ${externalMessages.length} external messages from TelegramChatView`);
        messages = externalMessages.map(msg => {
          // Ensure the message has the required properties
          return {
            id: msg.id || `msg_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
            sender: msg.sender || 'unknown',
            content: msg.content || { body: msg.body || '' },
            timestamp: msg.timestamp || Date.now(),
            room_id: roomId
          };
        });
      } else {
        // Fall back to getting messages from the room timeline
        logger.info(`[AIActionButtons] No external messages provided, getting messages from room timeline`);
        let events = [];
        try {
          // Safely get events from timeline
          const timeline = room.getLiveTimeline();
          if (timeline && typeof timeline.getEvents === 'function') {
            events = timeline.getEvents() || [];
          }
        } catch (timelineError) {
          logger.error(`[AIActionButtons] Error getting timeline events:`, timelineError);
          // Continue with empty events array
        }

        // Get all message events
        const allMessageEvents = events
          .filter(event => {
            // Check if event has getType method
            return typeof event.getType === 'function' && event.getType() === 'm.room.message';
          });

        logger.info(`[AIActionButtons] Found ${allMessageEvents.length} total message events in room`);

        // Take the most recent 100 messages instead of just 50
        messages = allMessageEvents
          .slice(-100)
          .map(event => {
            // Safely extract properties with fallbacks
            const id = typeof event.getId === 'function' ? event.getId() :
                      event.event_id || event.id || `msg_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

            const sender = typeof event.getSender === 'function' ? event.getSender() :
                         event.sender || 'unknown';

            const content = typeof event.getContent === 'function' ? event.getContent() :
                           event.content || { body: '' };

            const timestamp = typeof event.getOriginServerTs === 'function' ? event.getOriginServerTs() :
                            event.origin_server_ts || event.timestamp || Date.now();

            return {
              id,
              sender,
              content,
              timestamp,
              room_id: roomId
            };
          });
      }

      // Log detailed information about the messages
      logger.info(`[AIActionButtons] Using ${messages.length} messages for AI processing`);

      // Log the timestamp range of the messages
      if (messages.length > 0) {
        const timestamps = messages.map(msg => msg.timestamp);
        const minTimestamp = Math.min(...timestamps);
        const maxTimestamp = Math.max(...timestamps);

        logger.info(`[AIActionButtons] Message timestamp range: ${minTimestamp} to ${maxTimestamp}`);
        logger.info(`[AIActionButtons] Message date range: ${new Date(minTimestamp).toISOString()} to ${new Date(maxTimestamp).toISOString()}`);

        // Log a few sample messages
        logger.info(`[AIActionButtons] Sample messages:`);
        for (let i = 0; i < Math.min(3, messages.length); i++) {
          const msg = messages[i];
          logger.info(`[AIActionButtons] Message ${i}: id=${msg.id}, timestamp=${msg.timestamp}, date=${new Date(msg.timestamp).toISOString()}, sender=${msg.sender}`);
        }
      }

      // Check if we have any messages
      if (messages.length === 0) {
        logger.warn(`[AIActionButtons] No messages found for ${action.action_type}`);
        toast(`No messages found to analyze. Please try again after some messages are available.`, { id: toastId });
        setIsLoading(false);
        setActiveAction(null);
        return;
      }

      let response;
      // Get today's date in YYYY-MM-DD format
      const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

      // Also calculate today's start and end timestamps in milliseconds
      // Make sure we're using the correct timezone
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayEnd = new Date();
      todayEnd.setHours(23, 59, 59, 999);

      const todayStartMs = todayStart.getTime();
      const todayEndMs = todayEnd.getTime();

      // Log detailed information about the time ranges
      logger.info(`[AIActionButtons] Today's date: ${today}`);
      logger.info(`[AIActionButtons] Today's start timestamp: ${todayStartMs} (${todayStart.toISOString()})`);
      logger.info(`[AIActionButtons] Today's end timestamp: ${todayEndMs} (${todayEnd.toISOString()})`);
      logger.info(`[AIActionButtons] Current time: ${Date.now()} (${new Date().toISOString()})`);

      // Check if any messages have timestamps within today's range
      if (messages.length > 0) {
        const todayCount = messages.filter(msg => msg.timestamp >= todayStartMs && msg.timestamp <= todayEndMs).length;
        logger.info(`[AIActionButtons] Found ${todayCount} messages with timestamps within today's range`);

        // Log a few sample messages with their timestamps
        logger.info(`[AIActionButtons] Sample message timestamps:`);
        for (let i = 0; i < Math.min(5, messages.length); i++) {
          const msg = messages[i];
          const isToday = msg.timestamp >= todayStartMs && msg.timestamp <= todayEndMs;
          logger.info(`[AIActionButtons] Message ${i}: id=${msg.id}, timestamp=${msg.timestamp}, date=${new Date(msg.timestamp).toISOString()}, isToday=${isToday}`);
        }
      }


      try {
        switch (action.action_type) {
          case 'daily_report':
            // Filter messages for today only to improve performance
            // Log the time range we're filtering for
            logger.info(`[AIActionButtons] Filtering messages for today between ${todayStartMs} (${new Date(todayStartMs).toISOString()}) and ${todayEndMs} (${new Date(todayEndMs).toISOString()})`);

            const todayMessages = messages.filter(msg => {
              const msgDate = new Date(msg.timestamp);
              const isInRange = msg.timestamp >= todayStartMs && msg.timestamp <= todayEndMs;

              // Log each message timestamp for debugging
              logger.info(`[AIActionButtons] Message: ${msg.id}, timestamp=${msg.timestamp}, Date: ${msgDate.toISOString()}, in range: ${isInRange}`);

              return isInRange;
            });

            logger.info(`[AIActionButtons] Found ${todayMessages.length} messages for today out of ${messages.length} total messages`);
            logger.info(`[AIActionButtons] Today's date range: ${new Date(todayStartMs).toISOString()} to ${new Date(todayEndMs).toISOString()}`);

            // Log a sample message timestamp if available
            if (todayMessages.length > 0) {
              const sampleMsg = todayMessages[0];
              logger.info(`[AIActionButtons] Sample today message: timestamp=${sampleMsg.timestamp} (${new Date(sampleMsg.timestamp).toISOString()})`);
            } else {
              logger.warn(`[AIActionButtons] No messages found for today with timestamp between ${todayStartMs} and ${todayEndMs}`);

              // Log a few sample messages to debug timestamp issues
              if (messages.length > 0) {
                logger.info(`[AIActionButtons] Sample message timestamps:`);
                for (let i = 0; i < Math.min(5, messages.length); i++) {
                  const msg = messages[i];
                  logger.info(`[AIActionButtons] Message ${i}: timestamp=${msg.timestamp}, Date=${new Date(msg.timestamp).toISOString()}`);
                }
              }
            }

            // Check if we have any messages for today
            if (todayMessages.length === 0) {
              logger.warn(`[AIActionButtons] No messages found for today, but sending request anyway`);
            }

            // Ensure all messages have the correct timestamp format
            const dailyReportMessages = messages.map(msg => {
              // Make sure timestamp is a number (integer)
              if (typeof msg.timestamp === 'string') {
                msg.timestamp = parseInt(msg.timestamp, 10);
              }
              return msg;
            });

            // Log the request we're about to send
            logger.info(`[AIActionButtons] Sending daily report request with ${dailyReportMessages.length} messages`);
            logger.info(`[AIActionButtons] Request params: room_id=${roomId}, date=${today}, user_id=${userContext.user_id}`);

            // Only send messages that are within the time range
            // This ensures the backend doesn't have to filter them again
            const filteredDailyMessages = todayMessages.length > 0 ? todayMessages : dailyReportMessages;

            logger.info(`[AIActionButtons] Sending ${filteredDailyMessages.length} messages to daily-report endpoint`);

            // Log the first few messages we're sending
            if (filteredDailyMessages.length > 0) {
              logger.info(`[AIActionButtons] Sample messages being sent:`);
              for (let i = 0; i < Math.min(3, filteredDailyMessages.length); i++) {
                const msg = filteredDailyMessages[i];
                logger.info(`[AIActionButtons] Message ${i}: id=${msg.id}, timestamp=${msg.timestamp}, date=${new Date(msg.timestamp).toISOString()}`);
              }
            }

            response = await api.post('/api/v1/ai-bot/daily-report', {
              room_id: roomId,
              messages: filteredDailyMessages, // Send filtered messages
              room_context: roomContext,
              user_context: userContext,
              user_id: userContext.user_id, // Add the user_id field explicitly
              date: today,
              // Also include timestamp range for better filtering
              start_time: todayStartMs,
              end_time: todayEndMs
            });

          // Log the response data
          logger.info(`[AIActionButtons] Daily report response:`, response.data);

          // Check if we have a valid report
          if (response.data.message_count === 0 ||
              response.data.report === "No messages found for this date.") {
            logger.warn(`[AIActionButtons] API returned no messages found for daily report: ${response.data.report}`);
            toast(response.data.report || 'No messages found for today to generate a report.', { icon: '⚠️' });
          }

          // Send the report to the room
          await sendReportToRoom(
            roomId,
            client,
            'Daily Report',
            response.data.report || response.data.response,
            response.data.key_points || [],
            response.data.action_items || []
          );
          break;

        case 'quick_summary':
          // For quick summary, use the last 24 hours
          // Use integer timestamps in milliseconds as expected by the backend
          const endTime = Date.now(); // Current time in milliseconds
          const startTime = endTime - (24 * 60 * 60 * 1000); // 24 hours ago in milliseconds

          logger.info(`[AIActionButtons] Quick summary time period (milliseconds): ${startTime} to ${endTime}`);
          logger.info(`[AIActionButtons] Quick summary time period: ${new Date(startTime).toISOString()} to ${new Date(endTime).toISOString()}`);

          // Check if any messages have timestamps within the last 24 hours
          if (messages.length > 0) {
            const recentCount = messages.filter(msg => msg.timestamp >= startTime && msg.timestamp <= endTime).length;
            logger.info(`[AIActionButtons] Found ${recentCount} messages with timestamps within the last 24 hours`);

            // Log the timestamp range of all messages
            const timestamps = messages.map(msg => msg.timestamp);
            const minTimestamp = Math.min(...timestamps);
            const maxTimestamp = Math.max(...timestamps);

            logger.info(`[AIActionButtons] All messages timestamp range: ${minTimestamp} to ${maxTimestamp}`);
            logger.info(`[AIActionButtons] All messages date range: ${new Date(minTimestamp).toISOString()} to ${new Date(maxTimestamp).toISOString()}`);
          }

          // Filter messages for the last 24 hours
          // Log the time range we're filtering for
          logger.info(`[AIActionButtons] Filtering messages between ${startTime} (${new Date(startTime).toISOString()}) and ${endTime} (${new Date(endTime).toISOString()})`);

          const recentMessages = messages.filter(msg => {
            // Log each message timestamp for debugging
            const isInRange = msg.timestamp >= startTime && msg.timestamp <= endTime;
            if (isInRange) {
              logger.info(`[AIActionButtons] Message in range: ${msg.id}, timestamp=${msg.timestamp}, date=${new Date(msg.timestamp).toISOString()}`);
            }
            return isInRange;
          });

          logger.info(`[AIActionButtons] Found ${recentMessages.length} messages in the last 24 hours out of ${messages.length} total messages`);

          // Log some timestamps for debugging
          if (messages.length > 0) {
            const firstMsg = messages[0];
            const lastMsg = messages[messages.length - 1];
            logger.info(`[AIActionButtons] First message timestamp: ${firstMsg.timestamp} (${new Date(firstMsg.timestamp).toISOString()})`);
            logger.info(`[AIActionButtons] Last message timestamp: ${lastMsg.timestamp} (${new Date(lastMsg.timestamp).toISOString()})`);
          }

          // Ensure all messages have the correct timestamp format
          const quickSummaryMessages = messages.map(msg => {
            // Make sure timestamp is a number (integer)
            if (typeof msg.timestamp === 'string') {
              msg.timestamp = parseInt(msg.timestamp, 10);
            }
            return msg;
          });

          // Log the number of messages being sent
          logger.info(`[AIActionButtons] Sending ${quickSummaryMessages.length} messages to the quick-summary endpoint`);

          // Log a sample of messages to debug
          if (quickSummaryMessages.length > 0) {
            const sampleMessage = quickSummaryMessages[0];
            logger.info(`[AIActionButtons] Sample message: ID=${sampleMessage.id}, timestamp=${sampleMessage.timestamp}, sender=${sampleMessage.sender}`);
            logger.info(`[AIActionButtons] Sample message date: ${new Date(sampleMessage.timestamp).toISOString()}`);
          }

          // If no messages in the time range, log more details
          if (recentMessages.length === 0) {
            logger.warn(`[AIActionButtons] No messages found in the last 24 hours with timestamp between ${startTime} and ${endTime}`);

            // Log a few sample messages to debug timestamp issues
            if (messages.length > 0) {
              logger.info(`[AIActionButtons] Sample message timestamps:`);
              for (let i = 0; i < Math.min(5, messages.length); i++) {
                const msg = messages[i];
                logger.info(`[AIActionButtons] Message ${i}: timestamp=${msg.timestamp}, Date=${new Date(msg.timestamp).toISOString()}`);
              }
            }
          }

          // Check if we have any messages at all
          if (recentMessages.length === 0) {
            logger.warn(`[AIActionButtons] No messages found in the room`);
            toast('No messages found to summarize.', { icon: '⚠️' });

            // Create a mock response to avoid errors
            response = {
              data: {
                summary: "No messages found in this chat.",
                message_count: 0,
                time_period: `${new Date(startTime).toLocaleString()} to ${new Date(endTime).toLocaleString()}`
              }
            };
          } else {
            // Send the API request with all messages
            // The backend will handle filtering by timestamp
            // Backend expects Unix timestamps in milliseconds (integers)
            // Only send messages that are within the time range
            // This ensures the backend doesn't have to filter them again
            const filteredMessages = recentMessages.length > 0 ? recentMessages : quickSummaryMessages;

            logger.info(`[AIActionButtons] Sending ${filteredMessages.length} messages to quick-summary endpoint`);

            // Log the first few messages we're sending
            if (filteredMessages.length > 0) {
              logger.info(`[AIActionButtons] Sample messages being sent:`);
              for (let i = 0; i < Math.min(3, filteredMessages.length); i++) {
                const msg = filteredMessages[i];
                logger.info(`[AIActionButtons] Message ${i}: id=${msg.id}, timestamp=${msg.timestamp}, date=${new Date(msg.timestamp).toISOString()}`);
              }
            }

            response = await api.post('/api/v1/ai-bot/quick-summary', {
              room_id: roomId,
              messages: filteredMessages, // Send filtered messages
              room_context: roomContext,
              user_context: userContext,
              user_id: userContext.user_id, // Add the user_id field explicitly
              // Send as integer timestamps (milliseconds)
              start_time: startTime,
              end_time: endTime
            });
          }

          // Log the response data
          logger.info(`[AIActionButtons] Quick summary response:`, response.data);

          // Check if we have a valid summary
          if (response.data.message_count === 0 ||
              response.data.summary === "No messages found for this time period." ||
              response.data.summary === "No messages found in the last 24 hours.") {
            logger.warn(`[AIActionButtons] API returned no messages found: ${response.data.summary}`);
            toast(response.data.summary || 'No messages found to summarize.', { icon: '⚠️' });
          }

          // Send the summary to the room
          await sendSummaryToRoom(
            roomId,
            client,
            'Quick Summary',
            response.data.summary || response.data.response,
            response.data.time_period || 'Last 24 hours'
          );
          break;

        case 'priority_analysis':
          // Ensure all messages have the correct timestamp format
          const priorityMessages = messages.map(msg => {
            // Make sure timestamp is a number (integer)
            if (typeof msg.timestamp === 'string') {
              msg.timestamp = parseInt(msg.timestamp, 10);
            }
            return msg;
          });

          // Log the request we're about to send
          logger.info(`[AIActionButtons] Sending priority analysis request with ${priorityMessages.length} messages`);

          // Filter messages for today only to improve performance
          const todayPriorityMessages = messages.filter(msg => {
            return msg.timestamp >= todayStartMs && msg.timestamp <= todayEndMs;
          });

          logger.info(`[AIActionButtons] Found ${todayPriorityMessages.length} messages for today out of ${messages.length} total messages for priority analysis`);

          // Only send messages that are within the time range
          // This ensures the backend doesn't have to filter them again
          const filteredPriorityMessages = todayPriorityMessages.length > 0 ? todayPriorityMessages : priorityMessages;

          logger.info(`[AIActionButtons] Sending ${filteredPriorityMessages.length} messages to priority-analysis endpoint`);

          // Log the first few messages we're sending
          if (filteredPriorityMessages.length > 0) {
            logger.info(`[AIActionButtons] Sample messages being sent:`);
            for (let i = 0; i < Math.min(3, filteredPriorityMessages.length); i++) {
              const msg = filteredPriorityMessages[i];
              logger.info(`[AIActionButtons] Message ${i}: id=${msg.id}, timestamp=${msg.timestamp}, date=${new Date(msg.timestamp).toISOString()}`);
            }
          }

          response = await api.post('/api/v1/ai-bot/priority-analysis', {
            room_id: roomId,
            messages: filteredPriorityMessages, // Send filtered messages
            room_context: roomContext,
            user_context: userContext,
            user_id: userContext.user_id, // Add the user_id field explicitly
            date: today,
            // Also include timestamp range for better filtering
            start_time: todayStartMs,
            end_time: todayEndMs
          });

          // Log the response data
          logger.info(`[AIActionButtons] Priority analysis response:`, response.data);

          // Check if we have a valid analysis
          if (response.data.message_count === 0 ||
              response.data.overall_priority === "No messages found" ||
              response.data.priority === "No messages found") {
            logger.warn(`[AIActionButtons] API returned no messages found for priority analysis`);
            toast('No messages found for today to analyze priorities.', { icon: '⚠️' });
          }

          // Send the priority analysis to the room
          await sendPriorityAnalysisToRoom(
            roomId,
            client,
            'Priority Analysis',
            response.data.overall_priority || response.data.priority || 'Medium',
            response.data.priority_items || []
          );
          break;

        default:
          toast.error('Unknown action type', { id: toastId });
          break;
        }
      } catch (apiError) {
        logger.error(`[AIActionButtons] API error for ${action.action_type}:`, apiError);
        throw apiError; // Re-throw to be caught by the outer try-catch
      }

      toast.success(`${action.display_text} completed!`, { id: toastId });
    } catch (error) {
      logger.error(`[AIActionButtons] Error processing action ${action.action_type}:`, error);
      toast.error(`Error processing ${action.display_text}: ${error.message}`, { id: toastId });

      // Send error message to room so user knows something went wrong
      try {
        await client.sendTextMessage(
          roomId,
          `🤖 AI Assistant Error: Unable to process ${action.display_text}. Please try again later.`
        );
      } catch (sendError) {
        logger.error(`[AIActionButtons] Error sending error message to room:`, sendError);
      }
    } finally {
      setIsLoading(false);
      setActiveAction(null);
    }
  };

  // Helper function to send a report to the room
  const sendReportToRoom = async (roomId, client, title, report, keyPoints, actionItems) => {
    try {
      // Log the inputs for debugging
      logger.info(`[AIActionButtons] Sending report to room ${roomId}`);
      logger.info(`[AIActionButtons] Report title: ${title}`);
      logger.info(`[AIActionButtons] Key points count: ${keyPoints?.length || 0}`);
      logger.info(`[AIActionButtons] Action items count: ${actionItems?.length || 0}`);

      // Format the report as HTML
      const formattedKeyPoints = keyPoints?.map(point => `<li>${point}</li>`).join('') || '';
      const formattedActionItems = actionItems?.length > 0
        ? actionItems.map(item => `<li>${item}</li>`).join('')
        : '<li>No action items identified</li>';

      // Create a simpler HTML structure
      const html = `
        <div>
          <h3>📊 ${title}</h3>
          <p>Generated on ${new Date().toLocaleDateString()}</p>
          <p>${report}</p>
          <h4>Key Points:</h4>
          <ul>${formattedKeyPoints}</ul>
          <h4>Action Items:</h4>
          <ul>${formattedActionItems}</ul>
        </div>
      `;

      // First try sending as HTML
      try {
        logger.info(`[AIActionButtons] Attempting to send HTML message`);
        await client.sendHtmlMessage(
          roomId,
          `📊 ${title}: ${report.substring(0, 100)}...`,  // Truncate for plain text
          html
        );
        logger.info(`[AIActionButtons] Successfully sent HTML message`);
      } catch (htmlError) {
        // If HTML fails, fall back to plain text
        logger.error(`[AIActionButtons] Error sending HTML message:`, htmlError);
        logger.info(`[AIActionButtons] Falling back to plain text message`);

        // Format as plain text
        const plainText = `
📊 ${title}
Generated on ${new Date().toLocaleDateString()}

${report}

Key Points:
${keyPoints?.map(point => `- ${point}`).join('\n') || 'None'}

Action Items:
${actionItems?.length > 0 ? actionItems.map(item => `- ${item}`).join('\n') : 'No action items identified'}
`;

        // Send as plain text
        await client.sendTextMessage(roomId, plainText);
        logger.info(`[AIActionButtons] Successfully sent plain text message`);
      }
    } catch (error) {
      logger.error(`[AIActionButtons] Failed to send message to room:`, error);
      // Show error to user
      toast.error(`Failed to send report to chat: ${error.message}`);
    }
  };

  // Helper function to send a summary to the room
  const sendSummaryToRoom = async (roomId, client, title, summary, timePeriod) => {
    try {
      // Log the inputs for debugging
      logger.info(`[AIActionButtons] Sending summary to room ${roomId}`);
      logger.info(`[AIActionButtons] Summary title: ${title}`);
      logger.info(`[AIActionButtons] Time period: ${timePeriod}`);

      // Create a simpler HTML structure
      const html = `
        <div>
          <h3>📝 ${title}</h3>
          <p>Time period: ${timePeriod}</p>
          <p>${summary}</p>
        </div>
      `;

      // First try sending as HTML
      try {
        logger.info(`[AIActionButtons] Attempting to send HTML summary`);
        await client.sendHtmlMessage(
          roomId,
          `📝 ${title}: ${summary.substring(0, 100)}...`,  // Truncate for plain text
          html
        );
        logger.info(`[AIActionButtons] Successfully sent HTML summary`);
      } catch (htmlError) {
        // If HTML fails, fall back to plain text
        logger.error(`[AIActionButtons] Error sending HTML summary:`, htmlError);
        logger.info(`[AIActionButtons] Falling back to plain text summary`);

        // Format as plain text
        const plainText = `
📝 ${title}
Time period: ${timePeriod}

${summary}
`;

        // Send as plain text
        await client.sendTextMessage(roomId, plainText);
        logger.info(`[AIActionButtons] Successfully sent plain text summary`);
      }
    } catch (error) {
      logger.error(`[AIActionButtons] Failed to send summary to room:`, error);
      // Show error to user
      toast.error(`Failed to send summary to chat: ${error.message}`);
    }
  };

  // Helper function to send a priority analysis to the room
  const sendPriorityAnalysisToRoom = async (roomId, client, title, overallPriority, priorityItems) => {
    try {
      // Log the inputs for debugging
      logger.info(`[AIActionButtons] Sending priority analysis to room ${roomId}`);
      logger.info(`[AIActionButtons] Priority title: ${title}`);
      logger.info(`[AIActionButtons] Overall priority: ${overallPriority}`);
      logger.info(`[AIActionButtons] Priority items count: ${priorityItems?.length || 0}`);

      // Get priority emoji
      const getPriorityEmoji = (level) => {
        switch (level?.toLowerCase()) {
          case 'urgent': return '🔴';
          case 'high': return '🟠';
          case 'medium': return '🟡';
          case 'low': return '🟢';
          default: return '⚪';
        }
      };

      // Create a simpler HTML structure
      let html = `
        <div>
          <h3>🚨 ${title}</h3>
          <p>Overall Priority: ${getPriorityEmoji(overallPriority)} ${overallPriority?.toUpperCase() || 'MEDIUM'}</p>
      `;

      // Add priority items if available
      if (priorityItems && priorityItems.length > 0) {
        html += '<ul>';
        for (const item of priorityItems) {
          html += `<li>${getPriorityEmoji(item.level)} <strong>${item.text}</strong> - ${item.reason}</li>`;
        }
        html += '</ul>';
      } else {
        html += '<p>No specific priority items identified.</p>';
      }

      html += '</div>';

      // First try sending as HTML
      try {
        logger.info(`[AIActionButtons] Attempting to send HTML priority analysis`);
        await client.sendHtmlMessage(
          roomId,
          `🚨 ${title}: Overall Priority - ${overallPriority?.toUpperCase() || 'MEDIUM'}`,
          html
        );
        logger.info(`[AIActionButtons] Successfully sent HTML priority analysis`);
      } catch (htmlError) {
        // If HTML fails, fall back to plain text
        logger.error(`[AIActionButtons] Error sending HTML priority analysis:`, htmlError);
        logger.info(`[AIActionButtons] Falling back to plain text priority analysis`);

        // Format as plain text
        let plainText = `
🚨 ${title}
Overall Priority: ${getPriorityEmoji(overallPriority)} ${overallPriority?.toUpperCase() || 'MEDIUM'}
`;

        // Add priority items if available
        if (priorityItems && priorityItems.length > 0) {
          plainText += '\nPriority Items:\n';
          for (const item of priorityItems) {
            plainText += `${getPriorityEmoji(item.level)} ${item.text} - ${item.reason}\n`;
          }
        } else {
          plainText += '\nNo specific priority items identified.\n';
        }

        // Send as plain text
        await client.sendTextMessage(roomId, plainText);
        logger.info(`[AIActionButtons] Successfully sent plain text priority analysis`);
      }
    } catch (error) {
      logger.error(`[AIActionButtons] Failed to send priority analysis to room:`, error);
      // Show error to user
      toast.error(`Failed to send priority analysis to chat: ${error.message}`);
    }
  };

  // If no room ID or client, don't render anything
  if (!roomId || !client) {
    return null;
  }

  return (
    <div className="bg-neutral-900/50 border-t border-neutral-700/50 p-3 animate-fadeIn">
      <div className="flex justify-between items-center mb-2">
        <h5 className="text-xs uppercase text-gray-400 font-medium">AI Quick Actions</h5>
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-gray-400 hover:text-white transition-colors p-1 rounded-full hover:bg-neutral-700/50"
          title={expanded ? "Hide actions" : "Show actions"}
        >
          {expanded ? <FiChevronUp /> : <FiChevronDown />}
        </button>
      </div>

      {expanded && (
        <div className="flex flex-wrap gap-2">
          {actionButtons.map((action, index) => {
            // Choose icon based on action type
            let ActionIcon;
            switch (action.action_type) {
              case 'daily_report':
                ActionIcon = FiCalendar;
                break;
              case 'quick_summary':
                ActionIcon = FiClock;
                break;
              case 'priority_analysis':
                ActionIcon = FiAlertCircle;
                break;
              default:
                ActionIcon = FiClock;
            }

            return (
              <button
                key={index}
                onClick={() => handleActionClick(action)}
                disabled={isLoading}
                className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors ${
                  isLoading && activeAction === action.action_type
                    ? 'bg-[#0088CC]/50 text-white animate-pulse'
                    : 'bg-neutral-800 text-gray-300 hover:bg-[#0088CC]/30 hover:text-white'
                }`}
              >
                <ActionIcon className="w-4 h-4" />
                {action.display_text}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default AIActionButtons;
