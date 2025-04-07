/**
 * Custom tooltip system for resource cards
 * This replaces the problematic default tooltip behavior
 */
$(document).ready(function() {
  // Create tooltip element if it doesn't exist
  if ($('#custom-tooltip').length === 0) {
    $('body').append('<div id="custom-tooltip" class="custom-tooltip"></div>');
  }
  
  const tooltip = $('#custom-tooltip');
  let activeCard = null;
  let hideTimeout = null;
  
  // Process all elements with tooltip data attribute
  $('[data-tooltip]').each(function() {
    const element = $(this);
    const tooltipText = element.attr('data-tooltip');
    
    // Skip if no tooltip text
    if (!tooltipText) return;
    
    // Store tooltip text as data attribute
    element.data('tooltipText', tooltipText);
    
    // Add event listeners
    element.on('mouseenter focus', function(e) {
      // Clear any existing timeout
      if (hideTimeout) clearTimeout(hideTimeout);
      showTooltip($(this));
    });
    
    element.on('mouseleave blur', function() {
      startHideTooltip();
    });
  });
  
  // Show tooltip function
  function showTooltip(element) {
    const text = element.data('tooltipText') || element.attr('data-tooltip');
    
    // Exit if no text
    if (!text) return;
    
    // Set tooltip content
    tooltip.text(text);
    
    // Calculate position
    const rect = element[0].getBoundingClientRect();
    const elementWidth = element.outerWidth();
    const elementHeight = element.outerHeight();
    
    const windowHeight = $(window).height();
    const scrollTop = $(window).scrollTop();
    
    // Make tooltip visible briefly to get its dimensions
    tooltip.css({visibility: 'hidden', opacity: 0}).addClass('visible');
    const tooltipWidth = tooltip.outerWidth();
    const tooltipHeight = tooltip.outerHeight();
    tooltip.removeClass('visible').css({visibility: '', opacity: ''});
    
    // Determine if tooltip should be above or below the element
    const spaceAbove = rect.top;
    const spaceBelow = windowHeight - rect.bottom;
    
    if (spaceAbove > Math.max(tooltipHeight + 20, 100)) {
      // Position above the element
      tooltip.removeClass('arrow-top').addClass('arrow-bottom');
      tooltip.css({
        left: rect.left + (rect.width / 2) - (tooltipWidth / 2),
        top: rect.top + scrollTop - tooltipHeight - 12
      });
    } else {
      // Position below the element
      tooltip.removeClass('arrow-bottom').addClass('arrow-top');
      tooltip.css({
        left: rect.left + (rect.width / 2) - (tooltipWidth / 2),
        top: rect.bottom + scrollTop + 12
      });
    }
    
    // Keep tooltip within viewport horizontal bounds
    const tooltipLeft = parseInt(tooltip.css('left'));
    if (tooltipLeft < 10) tooltip.css('left', '10px');
    if (tooltipLeft + tooltipWidth > $(window).width() - 10) {
      tooltip.css('left', ($(window).width() - tooltipWidth - 10) + 'px');
    }
    
    // Show tooltip with animation
    tooltip.addClass('visible');
    activeCard = element;
  }
  
  // Start hide tooltip with delay
  function startHideTooltip() {
    hideTimeout = setTimeout(function() {
      hideTooltip();
    }, 50);
  }
  
  // Hide tooltip function
  function hideTooltip() {
    tooltip.removeClass('visible');
    activeCard = null;
  }
  
  // Hide tooltip when scrolling or resizing
  $(window).on('scroll resize', function() {
    if (activeCard) {
      hideTooltip();
    }
  });
  
  // Hide tooltip when clicking anywhere
  $(document).on('click', function() {
    hideTooltip();
  });
  
  // Keep tooltip visible when hovering over tooltip itself
  tooltip.on('mouseenter', function() {
    if (hideTimeout) clearTimeout(hideTimeout);
  }).on('mouseleave', function() {
    startHideTooltip();
  });
});
