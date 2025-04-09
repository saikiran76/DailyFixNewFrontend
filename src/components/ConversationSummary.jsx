import React, { useState, useEffect } from 'react';
import axios from 'axios';

const ConversationSummary = ({ roomId, selectedView }) => {
  const [summary, setSummary] = useState(null);
  const [aiInsights, setAiInsights] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    const fetchData = async () => {
      if (!roomId) return;
      
      try {
        setLoading(true);
        setError(null);

        if (selectedView === 'chats') {
          // Matrix endpoints
          const summaryResponse = await axios.get(`/rooms/${encodeURIComponent(roomId)}/summary`);
          setSummary(summaryResponse.data);

          // Fetch AI-powered conversation summary
          const aiResponse = await axios.get(`/rooms/${encodeURIComponent(roomId)}/conversation-summary`);
          setAiInsights(aiResponse.data);

        } else if (selectedView === 'slack') {
          // Slack endpoint that returns combined summary and AI-like data
          const summaryResponse = await axios.get(`/slack/channels/${encodeURIComponent(roomId)}/summary`);
          
          // We assume Slack summary returns a structure like:
          // {
          //   messageCount: number,
          //   keyTopics: string[],
          //   priorityBreakdown: {high:number,medium:number,low:number},
          //   sentimentAnalysis: {positive:number,negative:number,neutral:number},
          //   categories: { [category]: number }
          // }
          //
          // Slack doesn't have a separate AI endpoint, so we treat this as both summary and AI data.
          const slackData = summaryResponse.data;
          setSummary({
            roomName: `Slack Channel: ${roomId}`,
            created: new Date().toISOString(),
            memberCount: 0, // Slack endpoint might not return this, you can enhance if needed
            status: 'active', // Slack doesn't have a status concept, assume active
            totalMessages: slackData.messageCount,
            activeParticipants: 0,
            lastContact: null,
            recentActivity: [] // Slack endpoint may not return recent messages here, if needed adjust backend
          });

          // For Slack, we directly use slackData for AI insights
          setAiInsights({
            keyTopics: slackData.keyTopics,
            priorityBreakdown: slackData.priorityBreakdown,
            sentimentAnalysis: slackData.sentimentAnalysis,
            categories: slackData.categories
          });
        }

      } catch (error) {
        console.error('Error fetching data:', error);
        setError(error.response?.data?.error || 'Failed to load conversation data');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [roomId, retryCount, selectedView]);

  const handleRetry = () => {
    setRetryCount(prev => prev + 1);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-6">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary mb-2"></div>
          <p className="text-gray-400">Loading room summary...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center p-6">
        <div className="text-center">
          <div className="text-red-500 mb-4">
            <svg className="h-12 w-12 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <p className="text-error mb-4">{error}</p>
          <button 
            onClick={handleRetry}
            className="px-4 py-2 bg-primary text-white rounded hover:bg-primary-dark"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!summary) return null;

  // aiInsights might be null if something went wrong, handle gracefully
  const ai = aiInsights || {};

  return (
    <div className="p-6 space-y-6">
      {/* Room/Channel Information */}
      <div className="bg-dark-lighter rounded-lg p-6">
        <h2 className="text-xl font-semibold mb-4">{selectedView === 'slack' ? 'Channel Information' : 'Room Information'}</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-gray-400">{selectedView === 'slack' ? 'Channel Name' : 'Room Name'}</p>
            <p className="text-lg font-medium">{summary.roomName}</p>
          </div>
          <div>
            <p className="text-gray-400">Created</p>
            <p className="text-lg">{new Date(summary.created).toLocaleDateString()}</p>
          </div>
          <div>
            <p className="text-gray-400">Member Count</p>
            <p className="text-lg">{summary.memberCount}</p>
          </div>
          <div>
            <p className="text-gray-400">Status</p>
            <p className={`text-lg font-medium ${
              summary.status === 'active' ? 'text-green-500' : 'text-yellow-500'
            }`}>
              {summary.status.charAt(0).toUpperCase() + summary.status.slice(1)}
            </p>
          </div>
        </div>
      </div>

      <div className="bg-dark-lighter rounded-lg p-6">
        <h2 className="text-xl font-semibold mb-4">Activity Summary</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-gray-400">Total Messages</p>
            <p className="text-2xl font-bold">{summary.totalMessages}</p>
          </div>
          <div>
            <p className="text-gray-400">Active Participants</p>
            <p className="text-2xl font-bold">{summary.activeParticipants || 0}</p>
          </div>
          <div>
            <p className="text-gray-400">Last Contact</p>
            <p className="text-lg">
              {summary.lastContact 
                ? new Date(summary.lastContact).toLocaleString()
                : 'No messages yet'}
            </p>
          </div>
        </div>
      </div>

      {ai.keyTopics && (
        <div className="bg-dark-lighter rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4">AI Analysis</h2>
          
          {ai.priorityBreakdown && (
            <div className="mb-6">
              <h3 className="text-lg font-medium mb-2">Priority Distribution</h3>
              <div className="grid grid-cols-3 gap-4">
                {Object.entries(ai.priorityBreakdown).map(([priority, count]) => (
                  <div key={priority} className={`p-3 rounded-lg ${
                    priority === 'high' ? 'bg-red-500/20' :
                    priority === 'medium' ? 'bg-yellow-500/20' :
                    'bg-green-500/20'
                  }`}>
                    <p className="text-sm text-gray-400">{priority.toUpperCase()}</p>
                    <p className="text-2xl font-bold">{count}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {ai.keyTopics && (
            <div className="mb-6">
              <h3 className="text-lg font-medium mb-2">Key Topics</h3>
              <div className="flex flex-wrap gap-2">
                {ai.keyTopics.map((topic, index) => (
                  <span key={index} className="px-3 py-1 bg-primary/20 rounded-full text-sm">
                    {topic}
                  </span>
                ))}
              </div>
            </div>
          )}

          {ai.sentimentAnalysis && (
            <div className="mb-6">
              <h3 className="text-lg font-medium mb-2">Sentiment Analysis</h3>
              <div className="grid grid-cols-3 gap-4">
                {Object.entries(ai.sentimentAnalysis).map(([sentiment, count]) => (
                  <div key={sentiment} className="text-center">
                    <p className="text-sm text-gray-400">{sentiment.toUpperCase()}</p>
                    <p className="text-xl font-bold">{count}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {ai.categories && (
            <div>
              <h3 className="text-lg font-medium mb-2">Message Categories</h3>
              <div className="grid grid-cols-2 gap-4">
                {Object.entries(ai.categories).map(([category, count]) => (
                  <div key={category} className="flex justify-between items-center p-2 bg-dark rounded-lg">
                    <span className="text-gray-300">{category}</span>
                    <span className="font-medium">{count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {summary.recentActivity && summary.recentActivity.length > 0 && (
        <div className="bg-dark-lighter rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4">Recent Messages</h2>
          <div className="space-y-4">
            {summary.recentActivity.map((activity, index) => (
              <div key={index} className="border-b border-gray-700 pb-3 last:border-0">
                <div className="flex justify-between items-start mb-1">
                  <span className="font-medium">{activity.senderName}</span>
                  <span className="text-sm text-gray-400">
                    {new Date(activity.timestamp).toLocaleString()}
                  </span>
                </div>
                <p className="text-gray-300">{activity.content}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default ConversationSummary;