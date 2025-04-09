import React, { createContext, useState, useContext, useEffect } from 'react';

// Create the theme context
const ThemeContext = createContext();

// Theme values
export const THEMES = {
  DARK: 'dark',
  LIGHT: 'light'
};

// Theme provider component
export const ThemeProvider = ({ children }) => {
  // Initialize theme from localStorage or default to dark
  const [theme, setTheme] = useState(() => {
    const savedTheme = localStorage.getItem('dailyfix_theme');
    return savedTheme || THEMES.DARK;
  });

  // Update localStorage when theme changes
  useEffect(() => {
    localStorage.setItem('dailyfix_theme', theme);
    
    // Apply theme class to body
    if (theme === THEMES.LIGHT) {
      document.body.classList.add('light-theme');
      document.body.classList.remove('dark-theme');
    } else {
      document.body.classList.add('dark-theme');
      document.body.classList.remove('light-theme');
    }
  }, [theme]);

  // Toggle theme function
  const toggleTheme = () => {
    setTheme(prevTheme => 
      prevTheme === THEMES.DARK ? THEMES.LIGHT : THEMES.DARK
    );
  };

  // Set specific theme
  const setThemeValue = (newTheme) => {
    if (Object.values(THEMES).includes(newTheme)) {
      setTheme(newTheme);
    }
  };

  // Check if theme is dark
  const isDarkTheme = theme === THEMES.DARK;

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setTheme: setThemeValue, isDarkTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

// Custom hook to use the theme context
export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};
