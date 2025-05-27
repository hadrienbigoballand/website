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
  let monthsData = []; // Store calendar data for multiple months
  let isScrolling = false;
  
  function generateScrollableCalendar() {
    // Skip calendar generation on mobile devices
    if (isMobileDevice()) {
      return;
    }
    
    // Generate 6 months: 2 previous, current, 3 next
    monthsData = [];
    const calendarDays = $(".calendar-days");
    calendarDays.empty();
    
    for (let i = -2; i <= 3; i++) {
      const month = new Date(currentYear, currentMonth + i, 1);
      const monthData = generateMonthData(month.getFullYear(), month.getMonth());
      monthsData.push(monthData);
      
      // Add month separator (invisible but helps with scroll positioning)
      if (i > -2) {
        calendarDays.append('<div class="month-separator"></div>');
      }
      
      // Add month days
      monthData.days.forEach(dayData => {
        calendarDays.append(dayData.element);
      });
    }
    
    // Scroll to current month (index 2)
    setTimeout(() => {
      scrollToMonth(2);
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
    
    // Check if we need to load more months
    if (scrollTop < containerHeight) {
      // Scrolled to top - add previous months
      isScrolling = true;
      addPreviousMonth();
      setTimeout(() => { isScrolling = false; }, 300);
    } else if (scrollTop + containerHeight > scrollHeight - containerHeight) {
      // Scrolled to bottom - add next months
      isScrolling = true;
      addNextMonth();
      setTimeout(() => { isScrolling = false; }, 300);
    }
    
    // Update current month based on visible area
    updateCurrentMonthFromScroll();
  }
  
  function addPreviousMonth() {
    const firstMonth = monthsData[0];
    const prevMonth = new Date(firstMonth.year, firstMonth.month - 1, 1);
    const newMonthData = generateMonthData(prevMonth.getFullYear(), prevMonth.getMonth());
    
    monthsData.unshift(newMonthData);
    
    const calendarDays = $(".calendar-days");
    const currentScrollTop = $('.calendar-body')[0].scrollTop;
    
    // Add new month at the beginning
    newMonthData.days.forEach(dayData => {
      calendarDays.prepend(dayData.element);
    });
    calendarDays.prepend('<div class="month-separator"></div>');
    
    // Adjust scroll position to maintain visual position
    const newScrollTop = currentScrollTop + newMonthData.days[0].element[0].offsetHeight * newMonthData.days.length;
    $('.calendar-body')[0].scrollTop = newScrollTop;
  }
  
  function addNextMonth() {
    const lastMonth = monthsData[monthsData.length - 1];
    const nextMonth = new Date(lastMonth.year, lastMonth.month + 1, 1);
    const newMonthData = generateMonthData(nextMonth.getFullYear(), nextMonth.getMonth());
    
    monthsData.push(newMonthData);
    
    const calendarDays = $(".calendar-days");
    
    // Add month separator and new month at the end
    calendarDays.append('<div class="month-separator"></div>');
    newMonthData.days.forEach(dayData => {
      calendarDays.append(dayData.element);
    });
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
        visibleMonth = { month, year };
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
  
  // Initialize calendar and events
  if (isMobileDevice()) {
    $('.calendar-container').addClass('mobile-events-only');
    generateScrollableCalendar();
  } else {
    generateScrollableCalendar();
  }
  
  updateMonthDisplay();
  displayEvents();
});
