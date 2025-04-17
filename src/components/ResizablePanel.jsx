import React, { useState, useEffect, useRef } from 'react';

/**
 * ResizablePanel component allows resizing panels horizontally
 *
 * @param {Object} props
 * @param {React.ReactNode} props.left - Content for the left panel
 * @param {React.ReactNode} props.right - Content for the right panel
 * @param {number} props.initialLeftWidth - Initial width of the left panel in pixels
 * @param {number} props.minLeftWidth - Minimum width of the left panel in pixels
 * @param {number} props.maxLeftWidth - Maximum width of the left panel in pixels
 * @param {string} props.storageKey - Key to use for storing width preference in localStorage
 * @param {string} props.leftClassName - Additional class names for the left panel
 * @param {string} props.rightClassName - Additional class names for the right panel
 * @param {string} props.dividerClassName - Additional class names for the divider
 */
const ResizablePanel = ({
  left,
  right,
  initialLeftWidth = 350,
  minLeftWidth = 250,
  maxLeftWidth = 500,
  storageKey = 'resizable-panel-width',
  leftClassName = '',
  rightClassName = '',
  dividerClassName = '',
}) => {
  // Try to get saved width from localStorage
  const getSavedWidth = () => {
    try {
      const saved = localStorage.getItem(storageKey);
      return saved ? parseInt(saved, 10) : initialLeftWidth;
    } catch (e) {
      return initialLeftWidth;
    }
  };

  const [leftWidth, setLeftWidth] = useState(getSavedWidth());
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef(null);
  const initialX = useRef(0);
  const initialWidthRef = useRef(0);

  // Save width to localStorage when it changes
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, leftWidth.toString());
    } catch (e) {
      console.error('Failed to save panel width to localStorage:', e);
    }
  }, [leftWidth, storageKey]);

  // Handle mouse down on the divider
  const handleMouseDown = (e) => {
    setIsDragging(true);
    initialX.current = e.clientX;
    initialWidthRef.current = leftWidth;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

  // Handle mouse move
  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isDragging) return;

      const containerRect = containerRef.current.getBoundingClientRect();
      const deltaX = e.clientX - initialX.current;
      const newLeftWidth = Math.max(
        minLeftWidth,
        Math.min(maxLeftWidth, initialWidthRef.current + deltaX)
      );

      // Ensure the new width doesn't exceed the container width
      const maxPossibleWidth = containerRect.width * 0.8; // 80% of container width
      const boundedWidth = Math.min(newLeftWidth, maxPossibleWidth);

      setLeftWidth(boundedWidth);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, minLeftWidth, maxLeftWidth]);

  return (
    <div ref={containerRef} className="flex h-full w-full overflow-hidden">
      {/* Left panel */}
      <div
        className={`h-full overflow-hidden ${leftClassName}`}
        style={{ width: `${leftWidth}px`, minWidth: `${leftWidth}px` }}
      >
        {left}
      </div>

      {/* Divider */}
      <div
        className={`w-1 h-full cursor-col-resize bg-neutral-800 hover:bg-[#0088cc] transition-colors ${isDragging ? 'bg-[#0088cc]' : ''} ${dividerClassName}`}
        onMouseDown={handleMouseDown}
      />

      {/* Right panel */}
      <div className={`flex-1 h-full overflow-hidden ${rightClassName}`}>
        {right}
      </div>
    </div>
  );
};

export default ResizablePanel;
