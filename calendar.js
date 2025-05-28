$(document).ready(function(){
  // Enhanced mobile device detection
  function isMobileDevice() {
    // Check for touch device with small screen
    const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    const isSmallScreen = window.innerWidth <= 768;
    
    // User agent based detection for mobile devices
    const mobileRegex = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile|mobile|CriOS/i;
    const isMobileUA = mobileRegex.test(navigator.userAgent);
    
    // Platform detection
    const isMobilePlatform = /Android|iOS/.test(navigator.platform) || 
                            /iPhone|iPad|iPod/.test(navigator.platform);
    
    // Combine checks - prioritize actual mobile devices over screen size
    return isMobileUA || isMobilePlatform || (hasTouch && isSmallScreen);
  }
  
  // Color palette for events
  const eventColors = [
    '#4a89dc', // Blue
    '#ff6b6b', // Red
    '#26d0ce', // Teal
    '#a0d468', // Green
    '#ffce54', // Yellow
    '#ac92ec', // Purple
    '#ff9800', // Orange
    '#e91e63', // Pink
    '#00bcd4', // Cyan
    '#8bc34a', // Light Green
    '#ff5722', // Deep Orange
    '#9c27b0', // Violet
    '#795548', // Brown
    '#607d8b', // Blue Grey
    '#f44336', // Strong Red
    '#3f51b5'  // Indigo
  ];
  
  // Calendar functionality
  const events = [
    {
      title: "Shape seminar",
      date: new Date(2025, 5, 17), // March 15, 2025
      location: "Paris, France",
      multiDay: false,
      description: "French research community on shapes analysis, from biomedical imaging to computer assisted design and graphics.",
      color: eventColors[0]
    },
    {
      title: "Inverse Problems and Artificial Intelligence in Medicine",
      startDate: new Date(2025, 5, 23), // June 23, 2025
      endDate: new Date(2025, 5, 29), // June 29, 2025
      location: "Bath, England",
      multiDay: true,
      description: "International conference on the intersection of inverse problems and AI in medical applications.",
      color: eventColors[1]
    }
  ];
  
  let currentMonth = new Date().getMonth();
  let currentYear = new Date().getFullYear();
  let monthsData = []; // Store calendar data for multiple months
  let isScrolling = false;
  
  // Define calendar bounds: 5 years before and after current year
  const today = new Date();
  const MIN_YEAR = today.getFullYear() - 5;
  const MAX_YEAR = today.getFullYear() + 5;
  const MIN_DATE = new Date(MIN_YEAR, 0, 1); // January 1st of min year
  const MAX_DATE = new Date(MAX_YEAR, 11, 31); // December 31st of max year
  
  function generateScrollableCalendar() {
    // Skip calendar generation on mobile devices
    if (isMobileDevice()) {
      // Hide calendar completely on mobile
      $('.calendar-grid').hide();
      return;
    }
    
    // Generate bounded calendar: from MIN_DATE to MAX_DATE
    monthsData = [];
    const calendarDays = $(".calendar-days");
    calendarDays.empty();
    
    let monthCount = 0;
    let currentDisplayMonth = new Date(MIN_YEAR, 0, 1);
    
    while (currentDisplayMonth <= MAX_DATE) {
      const monthData = generateMonthData(currentDisplayMonth.getFullYear(), currentDisplayMonth.getMonth());
      monthsData.push(monthData);
      
      // Add month header for each month
      const monthNames = ["January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December"];
      const monthHeader = $(`
        <div class="month-header-row">
          <div class="month-header-content">
            <span class="month-name">${monthNames[currentDisplayMonth.getMonth()]}</span>
            <span class="month-year">${currentDisplayMonth.getFullYear()}</span>
          </div>
        </div>
      `);
      calendarDays.append(monthHeader);
      
      // Add day headers for the first month or after each month header
      const dayHeaders = $(`
        <div class="day-header">Mon</div>
        <div class="day-header">Tue</div>
        <div class="day-header">Wed</div>
        <div class="day-header">Thu</div>
        <div class="day-header">Fri</div>
        <div class="day-header">Sat</div>
        <div class="day-header">Sun</div>
      `);
      calendarDays.append(dayHeaders);
      
      // Add month days
      monthData.days.forEach(dayData => {
        calendarDays.append(dayData.element);
      });
      
      // Add spacing after each month except the last
      if (currentDisplayMonth < MAX_DATE) {
        calendarDays.append('<div class="month-separator-space"></div>');
      }
      
      monthCount++;
      currentDisplayMonth.setMonth(currentDisplayMonth.getMonth() + 1);
    }
    
    // Scroll to current month
    setTimeout(() => {
      scrollToCurrentMonth();
    }, 100);
  }
  
  function generateMonthData(year, month) {
    const firstDay = new Date(year, month, 1).getDay();
    const firstDayMondayBased = (firstDay === 0) ? 6 : firstDay - 1;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();
    
    const days = [];
    
    // Add days from previous month
    for (let i = firstDayMondayBased - 1; i >= 0; i--) {
      const day = daysInPrevMonth - i;
      const dayElement = $(`<div class="calendar-day other-month" data-day="${day}" data-month="${month - 1}" data-year="${year}">${day}</div>`);
      days.push({ element: dayElement, day, month: month - 1, year });
    }
    
    // Add days of current month
    const today = new Date();
    for (let day = 1; day <= daysInMonth; day++) {
      const dayElement = $(`<div class="calendar-day" data-day="${day}" data-month="${month}" data-year="${year}">${day}</div>`);
      
      // Check if it's today
      if (year === today.getFullYear() && month === today.getMonth() && day === today.getDate()) {
        dayElement.addClass("today");
      }
      
      // Check if there's an event on this day
      const dayEvents = getEventsForDay(year, month, day);
      if (dayEvents.length > 0) {
        dayElement.addClass("has-event");
        dayElement.attr('data-events-count', dayEvents.length);
        dayElement[0].style.setProperty('--primary-event-color', dayEvents[0].color);
        
        // Extract RGB values for glow effects
        const rgb = hexToRgb(dayEvents[0].color);
        if (rgb) {
          dayElement[0].style.setProperty('--primary-event-color-rgb', `${rgb.r}, ${rgb.g}, ${rgb.b}`);
        }
      }
      
      days.push({ element: dayElement, day, month, year });
    }
    
    // Add days from next month to complete the last week
    const totalCells = days.length;
    const remainingCells = Math.ceil(totalCells / 7) * 7 - totalCells;
    for (let day = 1; day <= remainingCells; day++) {
      const nextMonth = month + 1;
      const nextYear = nextMonth > 11 ? year + 1 : year;
      const adjustedMonth = nextMonth > 11 ? 0 : nextMonth;
      const dayElement = $(`<div class="calendar-day other-month" data-day="${day}" data-month="${adjustedMonth}" data-year="${nextYear}">${day}</div>`);
      days.push({ element: dayElement, day, month: adjustedMonth, year: nextYear });
    }
    
    return { year, month, days };
  }
  
  // Helper function to convert hex color to RGB
  function hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : null;
  }
  
  function scrollToCurrentMonth() {
    // Find the index of the current month in monthsData
    const currentMonthIndex = monthsData.findIndex(monthData => 
      monthData.year === currentYear && monthData.month === currentMonth
    );
    
    if (currentMonthIndex !== -1) {
      scrollToMonth(currentMonthIndex);
    }
  }
  
  function scrollToMonth(monthIndex) {
    if (!monthsData[monthIndex]) return;
    
    const calendarBody = $('.calendar-body')[0];
    const firstDayOfMonth = monthsData[monthIndex].days.find(d => d.month === monthsData[monthIndex].month);
    if (firstDayOfMonth) {
      const targetElement = firstDayOfMonth.element[0];
      const targetTop = targetElement.offsetTop - calendarBody.offsetTop;
      calendarBody.scrollTop = targetTop;
    }
  }
  
  function updateMonthDisplay() {
    const monthNames = ["January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December"];
    $("#month-year").text(`${monthNames[currentMonth]} ${currentYear}`);
  }
  
  function handleScroll() {
    if (isScrolling) return;
    
    const calendarBody = $('.calendar-body')[0];
    const scrollTop = calendarBody.scrollTop;
    const containerHeight = calendarBody.clientHeight;
    const scrollHeight = calendarBody.scrollHeight;
    
    // Prevent scrolling beyond bounds - just update current month display
    // No more dynamic loading of months
    updateCurrentMonthFromScroll();
    
    // Optional: Add subtle resistance at bounds
    if (scrollTop < 0) {
      calendarBody.scrollTop = 0;
    } else if (scrollTop + containerHeight > scrollHeight) {
      calendarBody.scrollTop = scrollHeight - containerHeight;
    }
  }
  
  function updateCurrentMonthFromScroll() {
    const calendarBody = $('.calendar-body')[0];
    const scrollTop = calendarBody.scrollTop;
    const containerHeight = calendarBody.clientHeight;
    const centerPoint = scrollTop + containerHeight / 2;
    
    // Find which month is most visible in the center
    let visibleMonth = null;
    $('.calendar-day:not(.other-month)').each(function() {
      const element = this;
      const elementTop = element.offsetTop;
      const elementBottom = elementTop + element.offsetHeight;
      
      if (elementTop <= centerPoint && elementBottom >= centerPoint) {
        const month = parseInt($(element).attr('data-month'));
        const year = parseInt($(element).attr('data-year'));
        
        // Ensure the visible month is within our bounds
        const visibleDate = new Date(year, month, 1);
        if (visibleDate >= MIN_DATE && visibleDate <= MAX_DATE) {
          visibleMonth = { month, year };
        }
        return false; // Break the loop
      }
    });
    
    if (visibleMonth && (visibleMonth.month !== currentMonth || visibleMonth.year !== currentYear)) {
      currentMonth = visibleMonth.month;
      currentYear = visibleMonth.year;
      updateMonthDisplay();
    }
  }
  
  function getEventsForDay(year, month, day) {
    const targetDate = new Date(year, month, day);
    
    // Only show events within our calendar bounds
    if (targetDate < MIN_DATE || targetDate > MAX_DATE) {
      return [];
    }
    
    return events.filter(event => {
      if (event.multiDay) {
        return targetDate >= event.startDate && targetDate <= event.endDate;
      } else {
        return event.date.getFullYear() === year && 
               event.date.getMonth() === month && 
               event.date.getDate() === day;
      }
    });
  }
  
  function showDayDetail(day, month, year) {
    const dayEvents = getEventsForDay(year, month, day);
    const date = new Date(year, month, day);
    const dateString = date.toLocaleDateString('en-US', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
    
    // Create modal content
    let modalContent = `
      <div class="day-detail-modal">
        <div class="day-detail-header">
          <h3 class="day-detail-date">${dateString}</h3>
          <button class="day-detail-close">&times;</button>
        </div>
        <div class="day-detail-content">
    `;
    
    if (dayEvents.length === 0) {
      modalContent += `
        <div class="no-events-day">
          <div class="no-events-icon">📅</div>
          <p>No events scheduled for this day</p>
        </div>
      `;
    } else {
      modalContent += '<div class="day-events-list">';
      dayEvents.forEach(event => {
        let timeInfo = '';
        if (event.multiDay) {
          const startDate = event.startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
          const endDate = event.endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
          timeInfo = `${startDate} - ${endDate}`;
        } else {
          timeInfo = event.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        }
        
        modalContent += `
          <div class="day-event-item" style="--event-color: ${event.color}">
            <div class="day-event-time">${timeInfo}</div>
            <div class="day-event-title">${event.title}</div>
            <div class="day-event-location">${event.location}</div>
            ${event.description ? `<div class="day-event-description">${event.description}</div>` : ''}
          </div>
        `;
      });
      modalContent += '</div>';
    }
    
    modalContent += `
        </div>
      </div>
    `;
    
    // Show modal
    showDayModal(modalContent);
  }
  
  function showDayModal(content) {
    // Remove existing modal
    $('.day-detail-overlay').remove();
    
    // Create modal
    const modal = $(`
      <div class="day-detail-overlay">
        ${content}
      </div>
    `);
    
    // Add to body
    $('body').append(modal);
    
    // Animate in
    requestAnimationFrame(() => {
      modal.addClass('visible');
    });
    
    // Close handlers
    $('.day-detail-close, .day-detail-overlay').click(function(e) {
      if (e.target === this) {
        hideDayModal();
      }
    });
    
    // Prevent modal content clicks from closing
    $('.day-detail-modal').click(function(e) {
      e.stopPropagation();
    });
    
    // ESC key handler
    $(document).on('keydown.dayModal', function(e) {
      if (e.key === 'Escape') {
        hideDayModal();
      }
    });
  }
  
  function hideDayModal() {
    const modal = $('.day-detail-overlay');
    modal.removeClass('visible');
    
    setTimeout(() => {
      modal.remove();
      $(document).off('keydown.dayModal');
    }, 300);
  }
  
  function displayEvents() {
    const eventsContainer = $("#events-container");
    eventsContainer.empty();
    
    const currentDate = new Date();
    const upcomingEvents = events.filter(event => {
      if (event.multiDay) {
        // For multi-day events, check if the event is still ongoing (end date >= current date)
        return event.endDate >= currentDate;
      } else {
        // For single-day events, check if the event date >= current date
        return event.date >= currentDate;
      }
    }).sort((a, b) => {
      const dateA = a.multiDay ? a.startDate : a.date;
      const dateB = b.multiDay ? b.startDate : b.date;
      return dateA - dateB;
    });
    
    if (upcomingEvents.length === 0) {
      eventsContainer.append('<div class="no-events">No upcoming events</div>');
      return;
    }
    
    upcomingEvents.forEach(event => {
      let dateText;
      if (event.multiDay) {
        const startDate = event.startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        const endDate = event.endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        dateText = `${startDate} - ${endDate}`;
      } else {
        dateText = event.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      }
      
      const eventElement = $(`
        <div class="event-item" style="--event-color: ${event.color}">
          <div class="event-date">${dateText}</div>
          <div class="event-title">${event.title}</div>
          <div class="event-location">${event.location}</div>
          ${event.description ? `<div class="event-description">${event.description}</div>` : ''}
        </div>
      `);
      
      eventsContainer.append(eventElement);
    });
  }
  
  // Scroll-based month changing - only for desktop
  $('.calendar-body').on('scroll', handleScroll);
  
  // Add click handlers to calendar days
  $(document).on('click', '.calendar-day', function() {
    const day = parseInt($(this).attr('data-day'));
    const month = parseInt($(this).attr('data-month'));
    const year = parseInt($(this).attr('data-year'));
    showDayDetail(day, month, year);
  });
  
  // Today button click handler
  $(document).on('click', '#today-button', function() {
    const today = new Date();
    currentMonth = today.getMonth();
    currentYear = today.getFullYear();
    updateMonthDisplay();
    scrollToCurrentMonth();
  });
  
  // Initialize calendar and events
  if (isMobileDevice()) {
    $('.calendar-container').addClass('mobile-events-only');
    $('.calendar-grid').hide();
  } else {
    generateScrollableCalendar();
  }
  
  updateMonthDisplay();
  displayEvents();
});
