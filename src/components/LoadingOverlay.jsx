import React from 'react';

const LoadingOverlay = () => {
  return (
    <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-[#24283b] rounded-lg p-6 max-w-sm w-full mx-4 shadow-xl">
        <div className="flex items-center justify-center mb-4">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-[#1e6853]"></div>
        </div>
        <p className="text-white text-center">
          Synchronizing contacts...
        </p>
        <p className="text-gray-400 text-sm text-center mt-2">
          Please wait while we update your contacts
        </p>
      </div>
    </div>
  );
};

export default LoadingOverlay; 