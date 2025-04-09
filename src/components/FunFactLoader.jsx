import React, { useState, useEffect } from 'react';
import DFLogo from '../images/DF.png';

// Array of fun facts for the loading state
const SOCIAL_MEDIA_FUN_FACTS = [
  "WhatsApp processes over 65 billion messages daily.",
  "The average person spends over 2 hours on social media every day.",
  "Facebook was originally called 'TheFacebook' when it launched in 2004.",
  "Instagram was purchased by Facebook for $1 billion in 2012.",
  "Twitter's (X's infact) original name was 'twttr' - vowels were added later.",
  "The first YouTube video was uploaded on April 23, 2005, titled 'Me at the zoo'.",
  "LinkedIn was founded in 2002, making it one of the oldest social networks.",
  "Over 500 hours of video are uploaded to YouTube every minute.",
  "WhatsApp was acquired by Facebook for $19 billion in 2014.",
  "TikTok reached 1 billion users faster than any other platform.",
  "The average time spent reading a tweet is just 1.5 seconds.",
  "Instagram's most-liked photo was of an egg, with over 55 million likes.",
  "The 'Stories' format was originally created by Snapchat before being adopted by other platforms.",
  "Discord was originally created for gamers but expanded to other communities.",
  "The first hashtag on Twitter was used in 2007.",
  "Matrix is an open protocol for secure, decentralized communication.",
  "WhatsApp uses end-to-end encryption for all messages by default.",
  "The average user checks their messaging apps 23 times per day."
];

const FunFactLoader = ({ message = "Loading..." }) => {
  const [currentFunFact, setCurrentFunFact] = useState('');
  
  useEffect(() => {
    // Set initial fun fact
    const randomIndex = Math.floor(Math.random() * SOCIAL_MEDIA_FUN_FACTS.length);
    setCurrentFunFact(SOCIAL_MEDIA_FUN_FACTS[randomIndex]);
    
    // Change fun fact every 5 seconds
    const interval = setInterval(() => {
      const newIndex = Math.floor(Math.random() * SOCIAL_MEDIA_FUN_FACTS.length);
      setCurrentFunFact(SOCIAL_MEDIA_FUN_FACTS[newIndex]);
    }, 5000);
    
    return () => clearInterval(interval);
  }, []);
  
  return (
    <div className="flex flex-col items-center justify-center p-8 space-y-6">
      <div className="relative">
        <img 
          src={DFLogo} 
          alt="DailyFix Logo" 
          className="w-16 h-16 animate-spin"
          style={{ animationDuration: '3s' }}
        />
      </div>
      
      <div className="text-center">
        <p className="text-lg font-medium text-white mb-2">{message}</p>
        <div className="bg-white/10 p-4 rounded-lg max-w-md">
          <p className="text-sm text-gray-200 italic">
            <span className="font-bold text-white">Fun Fact:</span> {currentFunFact}
          </p>
        </div>
      </div>
    </div>
  );
};

export default FunFactLoader;
