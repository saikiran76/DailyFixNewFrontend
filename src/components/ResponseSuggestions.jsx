import { useState, useEffect } from 'react';
import axios from 'axios';

const ResponseSuggestions = ({ message, onSelectSuggestion }) => {
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchSuggestions = async () => {
      if (!message || message.includes('Unable to decrypt')) {
        // No suggestions if message is undecryptable
        setSuggestions([]);
        setLoading(false);
        return;
      }
  
      try {
        setLoading(true);
        const response = await axios.get(`/ai/suggestions?message=${encodeURIComponent(message)}`);
        setSuggestions(response.data.suggestions || []);
      } catch (error) {
        console.error('Error fetching suggestions:', error);
        setSuggestions([]);
      } finally {
        setLoading(false);
      }
    };
  
    fetchSuggestions();
  }, [message]);
  

  if (loading || !suggestions.length) return null;

  return (
    <div className="mt-2 space-y-2">
      <p className="text-sm text-gray-400">Suggested Responses:</p>
      <div className="flex flex-wrap gap-2">
        {suggestions.map((suggestion, index) => (
          <button
            key={index}
            onClick={() => onSelectSuggestion(suggestion)}
            className="px-3 py-1 text-sm bg-primary/20 hover:bg-primary/30 rounded-full transition-colors"
          >
            {suggestion}
          </button>
        ))}
      </div>
    </div>
  );
};

export default ResponseSuggestions;