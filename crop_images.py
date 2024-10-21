from PIL import Image
import os

def crop_image(image_path, output_path):
    # Open the image
    img = Image.open(image_path)
    
    # Convert image to RGBA (in case it's not)
    img = img.convert("RGBA")
    
    # Create a bounding box for non-white areas
    bbox = img.getbbox()
    
    # Crop the image to the bounding box
    cropped_img = img.crop(bbox)
    
    # Save the cropped image
    cropped_img.save(output_path)

def process_images(input_dir, output_dir):
    # Create output directory if it doesn't exist
    if not os.path.exists(output_dir):
        os.makedirs(output_dir)
    
    # Process each image in the input directory
    for filename in os.listdir(input_dir):
        if filename.lower().endswith(('.png', '.jpg', '.jpeg')):  # Include only image files
            input_path = os.path.join(input_dir, filename)
            output_path = os.path.join(output_dir, filename)

            print(f'Processing {filename}...')
            crop_image(input_path, output_path)

# Set your input and output directories
input_directory = 'images'
output_directory = 'images'

process_images(input_directory, output_directory)
print("Cropping completed.")