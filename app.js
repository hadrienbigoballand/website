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

// JavaScript for navigation and scene management

let currentSceneIndex = 0; // Start with the first scene
const scenes = [
    "hand_scene.html", // First scene
    "second_scene.html", // Second scene
    "third_scene.html" // Third scene
];

function navigateTo(sectionId) {
  // Hide all sections
  document.querySelectorAll('section').forEach(section => {
      section.style.display = 'none';
  });
  // Show the selected section
  document.getElementById(sectionId).style.display = 'block';
  // Close the side menu if it's open
  toggleMenu();
  // Scroll to the top of the page with a slight delay
  setTimeout(() => {
      window.scrollTo({
          top: 0,
          behavior: 'instant'
      });
  }, 1);
}

// Function to toggle the side menu
function toggleMenu() {
    const sideMenu = document.getElementById('sideMenu');
    if (sideMenu.classList.contains('open')) {
        sideMenu.classList.remove('open'); // Close the menu
    } else {
        sideMenu.classList.add('open'); // Open the menu
    }
}

// Function to navigate between scenes
function navigateScene(direction) {
  currentSceneIndex += direction;

  if (currentSceneIndex < 0) {
      currentSceneIndex = 0;
  } else if (currentSceneIndex >= scenes.length) {
      currentSceneIndex = scenes.length - 1;
  }

  document.getElementById('meshIframe').src = scenes[currentSceneIndex];

  // Update button visibility
  document.getElementById('prevButton').style.display = currentSceneIndex > 0 ? 'block' : 'none';
  document.getElementById('nextButton').style.display = currentSceneIndex < scenes.length - 1 ? 'block' : 'none';
}

// Call this function on initial load to set up the correct button visibility
navigateScene(0);
