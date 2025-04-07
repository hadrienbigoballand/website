/**
 * Ultra simple tooltip system 
 * No visual artifacts, no rectangles
 */
$(document).ready(function() {
  // Create tooltip only when needed
  const tooltip = $('<div id="ultra-simple-tooltip" style="position:fixed;z-index:9999;background-color:rgba(255,255,255,0.95);color:#403E43;padding:8px 12px;border-radius:6px;font-family:NeueHaas;font-size:13px;line-height:1.4;text-align:center;max-width:280px;box-shadow:0 4px 10px rgba(0,0,0,0.15);pointer-events:none;opacity:0;transition:opacity 0.2s ease;display:none;"></div>');
  $('body').append(tooltip);
  
  // Override night mode styling
  function updateTooltipStyle() {
    if ($('body').hasClass('night')) {
      tooltip.css({
        'background-color': 'rgba(45,45,50,0.95)',
        'color': '#C8C8C9',
        'box-shadow': '0 4px 10px rgba(0,0,0,0.35)'
      });
    } else {
      tooltip.css({
        'background-color': 'rgba(255,255,255,0.95)',
        'color': '#403E43',
        'box-shadow': '0 4px 10px rgba(0,0,0,0.15)'
      });
    }
  }
  
  // Add handler to all elements with data-tooltip attribute
  $(document).on('mouseenter', '[data-tooltip]', function(e) {
    const text = $(this).attr('data-tooltip');
    if (!text) return;
    
    updateTooltipStyle();
    tooltip.text(text).css('display', 'block');
    
    // Initial position
    positionTooltip(e);
    
    // Show tooltip after positioning
    setTimeout(() => tooltip.css('opacity', 1), 10);
  });
  
  // Position tooltip based on mouse position
  function positionTooltip(e) {
    const mouseX = e.clientX;
    const mouseY = e.clientY;
    const tooltipWidth = tooltip.outerWidth();
    const tooltipHeight = tooltip.outerHeight();
    const windowWidth = $(window).width();
    const windowHeight = $(window).height();
    
    // Calculate position - keep within viewport
    let left = mouseX - (tooltipWidth / 2);
    let top = mouseY - tooltipHeight - 15;
    
    // Ensure tooltip doesn't go off screen edges
    if (left < 10) left = 10;
    if (left + tooltipWidth > windowWidth - 10) {
      left = windowWidth - tooltipWidth - 10;
    }
    
    // If tooltip would appear above viewport, show it below cursor instead
    if (top < 10) {
      top = mouseY + 25;
    }
    
    tooltip.css({
      left: left,
      top: top
    });
  }
  
  // Update position on mousemove
  $(document).on('mousemove', '[data-tooltip]', positionTooltip);
  
  // Hide tooltip on mouseleave
  $(document).on('mouseleave', '[data-tooltip]', function() {
    tooltip.css('opacity', 0);
    setTimeout(() => tooltip.css('display', 'none'), 200);
  });
  
  // Hide tooltip on click, scroll, or resize
  $(document).on('click scroll resize', function() {
    tooltip.css('opacity', 0);
    setTimeout(() => tooltip.css('display', 'none'), 200);
  });
  
  // Make sure tooltip style updates with theme changes
  $('#moon, #sun').on('click', updateTooltipStyle);
});
