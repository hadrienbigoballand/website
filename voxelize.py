import pyvista as pv

# Load a sample mesh (you can replace this with your own mesh)
mesh = pv.read('hand_mesh/measurable_x_auto.obj')

# Voxelize the mesh
voxel_size = 0.1  # Adjust voxel size as needed_
voxelized_mesh = pv.voxelize(mesh, density=mesh.length / 200)

# Create a plotter object
plotter = pv.Plotter()

# Add the voxelized mesh with the desired color and opacity
plotter.add_mesh(voxelized_mesh, color='white', opacity=0.5)

# Set the background color to dark
plotter.set_background('black')

# Set the camera position
camera_position = (0, 0, 700)  # Camera position
camera_focal_point = (mesh.center[0], mesh.center[1], mesh.center[2])  # Camera focal point

# Apply the camera settings
plotter.camera.position = camera_position
plotter.camera.focal_point = camera_focal_point
plotter.camera.roll = 0

# Show the plot
plotter.export_html('hand_scene.html')