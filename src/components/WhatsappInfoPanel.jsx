import React, { useState, useEffect } from 'react';
import { isWhatsAppConnected } from '../utils/connectionStorage';
import logger from '../utils/logger';
import PlatformShowcase from './PlatformShowcase';
import '../styles/TechCard.css'
/**
 * WhatsAppInfoPanel component
 * Displays WhatsApp connection information and guidelines
 * Used in the ChatView component when no contact is selected
 */
const WhatsAppInfoPanel = ({ userId }) => {
  const [hasShownInfo, setHasShownInfo] = useState(false);

  // Check if we've already shown this info to the user
  useEffect(() => {
    const infoShown = localStorage.getItem('whatsapp_info_shown');
    setHasShownInfo(infoShown === 'true');

    // Mark as shown after the first render
    if (!infoShown) {
      localStorage.setItem('whatsapp_info_shown', 'true');
    }
  }, []);

  // Check if WhatsApp is connected
  const whatsappConnectedInCache = userId && isWhatsAppConnected(userId);

  if (!whatsappConnectedInCache) {
    return (
      <div className="flex items-center justify-center h-full bg-neutral-900 rounded-xl">
        <PlatformShowcase />
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center h-full p-6 bg-neutral-900">
      <div className="bg-neutral-900 border border-white/10 p-6 rounded-3xl max-w-xl w-full mx-4">
        <div className="flex items-center mb-7">
          <div className="flex items-center gap-3">
            <div>
              <img
                className="size-10"
                src="https://media0.giphy.com/media/jU9PVpqUvR0aNc3nvX/giphy.gif"
                alt="whatsappLoad"
              />
            </div>
            <h3 className="text-xl font-medium text-white">WhatsApp Sync Started</h3>
          </div>
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
          </div>
        </div>
      </div>
    </div>
  );
};

export default WhatsAppInfoPanel;