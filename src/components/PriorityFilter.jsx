const PriorityFilter = ({ selectedPriorities, onPriorityChange }) => {
    const priorities = [
      { value: 'high', label: 'High Priority', color: 'bg-red-500' },
      { value: 'medium', label: 'Medium Priority', color: 'bg-yellow-500' },
      { value: 'low', label: 'Low Priority', color: 'bg-gray-500' }
    ];
  
    return (
      <div className="flex gap-2 p-4 border-b border-dark-lighter">
        {priorities.map(({ value, label, color }) => (
          <button
            key={value}
            onClick={() => onPriorityChange(value)}
            className={`px-3 py-1 rounded-full text-sm flex items-center gap-2 
              ${selectedPriorities.includes(value) 
                ? `${color} text-white` 
                : 'bg-gray-700 text-gray-300'}`}
          >
            <span className={`w-2 h-2 rounded-full ${color}`}></span>
            {label}
          </button>
        ))}
      </div>
    );
};
  
export default PriorityFilter;