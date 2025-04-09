document.addEventListener('DOMContentLoaded', function() {
  // Handle the original card hover effects
  const cards = document.querySelectorAll(".card");
  
  cards.forEach((card) => {
    card.addEventListener("mousemove", handleMouseMove);
  });
  
  function handleMouseMove(e) {
    const rect = this.getBoundingClientRect();
    const mouseX = e.clientX - rect.left - rect.width / 2;
    const mouseY = e.clientY - rect.top - rect.height / 2;
    let angle = Math.atan2(mouseY, mouseX) * (180 / Math.PI);
    angle = (angle + 360) % 360;
    this.style.setProperty("--start", angle + 60);
  }
  
  // Initialize the report card animations
  initReportCardAnimations();
});

function initReportCardAnimations() {
  // This function can be called directly from React components if needed
  const reportCards = document.querySelectorAll('.report-card');
  
  reportCards.forEach(card => {
    // Make sure border elements exist
    const borders = ['border-top', 'border-right', 'border-bottom', 'border-left'];
    borders.forEach(borderClass => {
      if (!card.querySelector(`.${borderClass}`)) {
        const borderEl = document.createElement('div');
        borderEl.className = borderClass;
        card.appendChild(borderEl);
      }
    });
    
    // Make sure content wrapper exists
    if (!card.querySelector('.report-card-content')) {
      // Get all child elements that are not border elements
      const contentElements = Array.from(card.children).filter(el => 
        !borders.some(border => el.classList.contains(border))
      );
      
      // Create content wrapper and move elements inside
      const contentWrapper = document.createElement('div');
      contentWrapper.className = 'report-card-content';
      
      contentElements.forEach(el => {
        contentWrapper.appendChild(el.cloneNode(true));
        el.remove();
      });
      
      card.appendChild(contentWrapper);
    }
  });
}

// Export for use in React components
export { initReportCardAnimations };