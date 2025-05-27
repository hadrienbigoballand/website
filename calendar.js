$(document).ready(function(){
  // Mobile device detection
  function isMobileDevice() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
           (navigator.maxTouchPoints && navigator.maxTouchPoints > 2 && /MacIntel/.test(navigator.platform));
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
  
  function generateCalendar(month, year) {
    // Skip calendar generation on mobile devices
    if (isMobileDevice()) {
      return;
    }
    
    const firstDay = new Date(year, month, 1).getDay();
    // Convert Sunday=0 to Monday=0 system (Sunday becomes 6, Monday becomes 0)
    const firstDayMondayBased = (firstDay === 0) ? 6 : firstDay - 1;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();
    
    const monthNames = ["January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December"];
    
    $("#month-year").text(`${monthNames[month]} ${year}`);
    
    // Clear existing calendar days
    $(".calendar-day").remove();
    
    const calendarDays = $(".calendar-days");
    
    // Add days from previous month
    for (let i = firstDayMondayBased - 1; i >= 0; i--) {
      const day = daysInPrevMonth - i;
      const dayElement = $(`<div class="calendar-day other-month" data-day="${day}" data-month="${month - 1}" data-year="${year}">${day}</div>`);
      calendarDays.append(dayElement);
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
        
        // Set the primary event color for the dot
        dayElement[0].style.setProperty('--primary-event-color', dayEvents[0].color);
      }
      
      calendarDays.append(dayElement);
    }
    
    // Add days from next month to fill the grid
    const totalCells = calendarDays.children().length;
    const remainingCells = 42 - totalCells; // 6 rows × 7 days
    for (let day = 1; day <= remainingCells; day++) {
      const nextMonth = month + 1;
      const nextYear = nextMonth > 11 ? year + 1 : year;
      const adjustedMonth = nextMonth > 11 ? 0 : nextMonth;
      const dayElement = $(`<div class="calendar-day other-month" data-day="${day}" data-month="${adjustedMonth}" data-year="${nextYear}">${day}</div>`);
      calendarDays.append(dayElement);
    }
    
    // Add click handlers to calendar days
    $(".calendar-day").click(function() {
      const day = parseInt($(this).attr('data-day'));
      const month = parseInt($(this).attr('data-month'));
      const year = parseInt($(this).attr('data-year'));
      showDayDetail(day, month, year);
    });
  }
  
  function getEventsForDay(year, month, day) {
    const targetDate = new Date(year, month, day);
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
  
  // Calendar navigation - only for desktop
  $("#prev-month").click(function() {
    if (isMobileDevice()) return;
    
    currentMonth--;
    if (currentMonth < 0) {
      currentMonth = 11;
      currentYear--;
    }
    generateCalendar(currentMonth, currentYear);
  });
  
  $("#next-month").click(function() {
    if (isMobileDevice()) return;
    
    currentMonth++;
    if (currentMonth > 11) {
      currentMonth = 0;
      currentYear++;
    }
    generateCalendar(currentMonth, currentYear);
  });
  
  // Initialize calendar and events
  if (isMobileDevice()) {
    // Keep calendar visible on mobile but make it more compact
    $('.calendar-container').addClass('mobile-events-only');
    generateCalendar(currentMonth, currentYear); // Generate calendar for mobile too
  } else {
    // Generate calendar for desktop
    generateCalendar(currentMonth, currentYear);
  }
  
  displayEvents();
});
