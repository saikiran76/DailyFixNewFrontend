import React from 'react';
import { getPlatformAdapter } from './PlatformAdapter';

// Show platform icons next to messages (TODO: add icons)
function UnifiedInbox({ accounts, messages, selectedPlatform, onSelectRoom, selectedRoom, activeComponent, setActiveComponent, panelOpen, handleClosePanel }) {
  const connectedPlatforms = accounts.map(a => a.platform);
  const platformsToShow = selectedPlatform ? [selectedPlatform] : connectedPlatforms;

  return (
    <div className="flex h-full">
      <div className={`${panelOpen && selectedRoom ? 'w-1/3' : 'w-full'} border-r border-dark-lighter`}>
        {platformsToShow.map(plat => {
          const Adapter = getPlatformAdapter(plat);
          if (!Adapter) return null;
          const ChatList = Adapter.ChatList;
          return <ChatList key={plat} messages={messages} onSelectRoom={onSelectRoom} />;
        })}
      </div>
      {panelOpen && selectedRoom && selectedPlatform && (
        <div className="w-2/3 flex flex-col">
          <div className="flex border-b border-dark-lighter">
            <button
              onClick={() => setActiveComponent('messages')}
              className={`px-6 py-3 text-sm font-medium ${activeComponent === 'messages' ? 'border-b-2 border-primary text-primary' : 'text-gray-400 hover:text-white'}`}
            >
              Messages
            </button>
            <button
              onClick={() => setActiveComponent('summary')}
              className={`px-6 py-3 text-sm font-medium ${activeComponent === 'summary' ? 'border-b-2 border-primary text-primary' : 'text-gray-400 hover:text-white'}`}
            >
              Summary
            </button>
            <button
              onClick={() => setActiveComponent('details')}
              className={`px-6 py-3 text-sm font-medium ${activeComponent === 'details' ? 'border-b-2 border-primary text-primary' : 'text-gray-400 hover:text-white'}`}
            >
              Customer Details
            </button>
            <button onClick={handleClosePanel} className="text-gray-300 hover:text-white ml-auto px-4">
              Close
            </button>
          </div>
          <div className="flex-1 overflow-auto p-6">
            {(()=>{
              const Adapter = getPlatformAdapter(selectedPlatform);
              if(!Adapter)return null;
              const MessageViewer = Adapter.MessageViewer;
              const filtered = messages.filter(m=>m.roomId===selectedRoom);
              return <MessageViewer messages={filtered} activeComponent={activeComponent} />;
            })()}
          </div>
        </div>
      )}
    </div>
  );
}

export default UnifiedInbox;
