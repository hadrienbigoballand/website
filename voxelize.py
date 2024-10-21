import pyvista as pv

# Load a sample mesh (you can replace this with your own mesh)
mesh = pv.read('hand_mesh/measurable.obj')
points = pv.read('hand_mesh/landmarks.ply').points

# Voxelize the mesh
# voxel_size = 0.1  # Adjust voxel size as needed_
# voxelized_mesh = pv.voxelize(mesh, density=mesh.length / 200)

# Create a plotter object
plotter = pv.Plotter()

# Add the voxelized mesh with the desired color and opacity
# plotter.add_mesh(mesh, color='white', opacity=0.5, smooth_shading=True, wireframe=True)
# plotter.add_points(points, color='white', opacity=0.8, render_points_as_spheres = True, smooth_shading=True, point_size=15)
plotter.add_mesh(mesh, style="wireframe", line_width=1, color = 'white')

# Set the background color to dark
plotter.set_background('black')

# Set the camera position
camera_position = (-700, 20, 350)  # Camera position
camera_focal_point = (mesh.center[0], mesh.center[1], mesh.center[2])  # Camera focal point

# Apply the camera settings
plotter.camera.position = camera_position
plotter.camera.focal_point = camera_focal_point
plotter.camera.roll = 0

# plotter.show_axes()

# Show the plot
# plotter.show()
plotter.export_html('third_scene.html')