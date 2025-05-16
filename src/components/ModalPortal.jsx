import { useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import PropTypes from 'prop-types';

/**
 * Modal Portal Component
 * Creates a portal for rendering modals outside the normal DOM hierarchy
 * Handles cleanup properly to prevent orphaned DOM nodes
 */
const ModalPortal = ({ children }) => {
  const [portalElement, setPortalElement] = useState(null);
  
  // Find or create the portal root element
  const createPortalRoot = useCallback(() => {
    // Check if the element already exists
    let element = document.getElementById('modal-portal-root');
    const isNewElement = !element;
    
    // If it doesn't exist, create it
    if (isNewElement) {
      element = document.createElement('div');
      element.id = 'modal-portal-root';
      
      // Set styles to ensure it covers the entire viewport
      element.style.position = 'fixed';
      element.style.top = '0';
      element.style.left = '0';
      element.style.width = '100vw';
      element.style.height = '100vh';
      element.style.zIndex = '10000';
      element.style.pointerEvents = 'none'; // Let clicks pass through by default
      
      // Add to the document body
      document.body.appendChild(element);
    }
    
    // Return both the element and a flag indicating if we created it
    return { element, isNewElement };
  }, []);
  
  // Setup the portal element on mount
  useEffect(() => {
    const { element, isNewElement } = createPortalRoot();
    element.setAttribute('data-created-by', 'ModalPortal');
    
    // Store the element and creation info
    setPortalElement({ 
      element, 
      isNewElement,
      createdAt: Date.now()
    });
    
    // Cleanup function
    return () => {
      // Only remove the element if we created it
      if (isNewElement) {
        // Add a slight delay to prevent race conditions with nested portals
        setTimeout(() => {
          try {
            if (document.body.contains(element)) {
              document.body.removeChild(element);
            }
          } catch (e) {
            console.error('Error removing portal element:', e);
          }
        }, 0);
      }
    };
  }, [createPortalRoot]);
  
  // If the portal element doesn't exist yet, return null
  if (!portalElement?.element) return null;
  
  // Render the portal with children
  return createPortal(
    <div 
      style={{ 
        pointerEvents: 'auto',
        position: 'static',  // Let children control positioning
        zIndex: 'inherit'
      }}
    >
      {children}
    </div>,
    portalElement.element
  );
};

ModalPortal.propTypes = {
  children: PropTypes.node.isRequired
};

export default ModalPortal; 