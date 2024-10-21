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

// Check on load
checkPhotoVisibility();

// Check on resize
window.addEventListener('resize', checkPhotoVisibility);