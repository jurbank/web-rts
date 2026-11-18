"""Map structure faces onto cards of the shared city atlas.

Import inside Blender with the skill's scripts folder on sys.path:

    import atlas_cards
    atlas_cards.apply(obj, {"front": "wall_office_entrance", "top": "roof_flat_large"}, default="concrete")

Each face takes the card for the side it faces. Sides are front (-Y), back (+Y),
left (-X), right (+X), top (+Z), and bottom (-Z), and the card fills the
object's extent on that side, so text reads correctly from outside.
"""
import json
from pathlib import Path

import bpy

ATLAS = Path("art/blender/materials/city-atlas.json")
IMAGE = "//../../materials/city-atlas.jpg"
MATERIAL = "City atlas"


def material(root):
    """The shared atlas material, created once per file with the image linked, not packed."""
    existing = bpy.data.materials.get(MATERIAL)
    if existing is not None:
        return existing
    image = bpy.data.images.load(str(root / ATLAS.with_suffix(".jpg")), check_existing=True)
    image.name = "city-atlas"
    image.filepath = IMAGE
    result = bpy.data.materials.new(MATERIAL)
    result.use_nodes = True
    shader = result.node_tree.nodes["Principled BSDF"]
    shader.inputs["Roughness"].default_value = 0.86
    shader.inputs["Specular IOR Level"].default_value = 0.25
    texture = result.node_tree.nodes.new("ShaderNodeTexImage")
    texture.image = image
    texture.location = (-320, 280)
    result.node_tree.links.new(texture.outputs["Color"], shader.inputs["Base Color"])
    return result


def side(normal):
    x, y, z = abs(normal.x), abs(normal.y), abs(normal.z)
    if z >= x and z >= y:
        return "top" if normal.z > 0 else "bottom"
    if y >= x:
        return "front" if normal.y < 0 else "back"
    return "right" if normal.x > 0 else "left"


# (horizontal axis, flipped, vertical axis) for each side as seen from outside.
PROJECTION = {
    "front": (0, False, 2),
    "back": (0, True, 2),
    "right": (1, False, 2),
    "left": (1, True, 2),
    "top": (0, False, 1),
    "bottom": (0, False, 1),
}


def apply(obj, cards, default, *, root=Path.cwd(), from_above=False):
    """Give `obj` the atlas material and UVs. `from_above` maps curved roofs from the top, except their ends."""
    atlas = json.loads((root / ATLAS).read_text())
    width, height = atlas["width"], atlas["height"]
    mesh = obj.data
    mesh.materials.clear()
    mesh.materials.append(material(root))
    layer = mesh.uv_layers.get("City atlas") or mesh.uv_layers.new(name="City atlas")
    mesh.uv_layers.active = layer

    matrix = obj.matrix_world
    rotation = matrix.to_3x3()
    points = [matrix @ vertex.co for vertex in mesh.vertices]
    low = [min(point[axis] for point in points) for axis in range(3)]
    high = [max(point[axis] for point in points) for axis in range(3)]
    span = [max(high[axis] - low[axis], 1e-6) for axis in range(3)]

    for polygon in mesh.polygons:
        polygon.material_index = 0
        facing = side((rotation @ polygon.normal).normalized())
        if from_above and facing in ("left", "right", "bottom"):
            facing = "top"
        name = cards.get(facing, default)
        if name not in atlas["cards"]:
            raise ValueError(f"{obj.name}: no card named {name!r} in {ATLAS}")
        card = atlas["cards"][name]
        across, flipped, up = PROJECTION[facing]
        for loop in polygon.loop_indices:
            point = points[mesh.loops[loop].vertex_index]
            u = (point[across] - low[across]) / span[across]
            v = (point[up] - low[up]) / span[up]
            if flipped:
                u = 1 - u
            layer.data[loop].uv = (
                (card["x"] + 0.5 + u * (card["width"] - 1)) / width,
                1 - (card["y"] + card["height"] - 0.5 - v * (card["height"] - 1)) / height,
            )
