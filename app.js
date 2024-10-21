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

// Function to navigate to a section and close the side menu
function navigateTo(sectionId) {
    // Hide all sections
    document.querySelectorAll('section').forEach(section => {
        section.style.display = 'none';
    });
    // Show the selected section
    document.getElementById(sectionId).style.display = 'block';

    // Close the side menu if it's open
    toggleMenu();
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
    currentSceneIndex += direction; // Update the index based on direction

    // Ensure the index stays within bounds
    if (currentSceneIndex < 0) {
        currentSceneIndex = 0; // Prevent going to previous non-existing scene
    } else if (currentSceneIndex >= scenes.length) {
        currentSceneIndex = scenes.length - 1; // Prevent going to next non-existing scene
    }

    // Update the iframe source to the current scene
    document.getElementById('meshIframe').src = scenes[currentSceneIndex];

    // Show or hide navigation buttons based on the current scene
    document.getElementById('prevButton').style.display = currentSceneIndex > 0 ? 'flex' : 'none';
    document.getElementById('nextButton').style.display = currentSceneIndex < scenes.length - 1 ? 'flex' : 'none';
}

// Check on initial load
navigateScene(0); // Load the initial scene and set button visibility