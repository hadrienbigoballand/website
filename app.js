// app.js

function checkPhotoVisibility() {
  const photo = document.querySelector('.photo');
  const windowWidth = window.innerWidth;

  // Show the photo if the width is greater than 480px, else hide it
  if (windowWidth > 480) {
    photo.classList.remove('hide-photo');
  } else {
    photo.classList.add('hide-photo');
  }
}

// Function to show the selected section
function showSection(sectionId) {
  const sections = document.querySelectorAll('section');
  sections.forEach((section) => {
    section.style.display = 'none'; // Hide all sections
  });
  document.getElementById(sectionId).style.display = 'block'; // Show the selected section
}

// Toggle the side menu
function toggleMenu() {
  const sideMenu = document.getElementById('sideMenu');
  sideMenu.classList.toggle('open'); // Toggle the open class
}

// Navigate to the selected section and close the menu
function navigateTo(sectionId) {
  showSection(sectionId); // Show the selected section
  toggleMenu(); // Close the menu
}

// Check on load
checkPhotoVisibility();
showSection('about'); // Default to the About section

// Check on resize
window.addEventListener('resize', checkPhotoVisibility());