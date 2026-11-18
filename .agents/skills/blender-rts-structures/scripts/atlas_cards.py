"""Map structure faces onto cards of a theme's texture atlas.

Import inside Blender with the skill's scripts folder on sys.path. Save the
source to its library path first, so the atlas images link with relative paths:

    import atlas_cards
    atlas_cards.apply(obj, {"front": "wall_office_entrance", "top": "roof_flat_large"},
                      default="concrete", theme="modern")

Each face takes the card for the side it faces. Sides are front (-Y), back (+Y),
left (-X), right (+X), top (+Z), and bottom (-Z), and the card fills the
object's extent on that side, so text reads correctly from outside.

Each mesh records the card every face uses. After the atlas is repainted and
cards move, refresh(obj, theme=...) fits the UVs again without re-mapping.
"""
import json
from pathlib import Path

import bpy

MATERIALS = Path("art/blender/materials/themes")
MATERIAL = "City atlas"
CARD_ATTRIBUTE = "atlas_card"
CARD_RECORD = "atlas_cards"


def atlas(root, theme):
    path = root / MATERIALS / theme / "atlas.json"
    if not path.is_file():
        raise ValueError(f"No atlas for theme {theme!r} at {path}")
    return json.loads(path.read_text()), path.parent


def _image(path, name):
    if not bpy.data.filepath:
        raise ValueError("Save the source to its library path before mapping cards, so atlas images link relatively")
    image = bpy.data.images.load(str(path), check_existing=True)
    image.name = name
    image.filepath = bpy.path.relpath(str(path))
    return image


def material(root, theme):
    """The theme's atlas material, created once per file. Its images are linked, not packed."""
    existing = bpy.data.materials.get(MATERIAL)
    if existing is not None:
        return existing
    document, folder = atlas(root, theme)
    result = bpy.data.materials.new(MATERIAL)
    result.use_nodes = True
    nodes, links = result.node_tree.nodes, result.node_tree.links
    shader = nodes["Principled BSDF"]
    shader.inputs["Roughness"].default_value = 0.86
    shader.inputs["Specular IOR Level"].default_value = 0.25
    color = nodes.new("ShaderNodeTexImage")
    color.image = _image(folder / "atlas.jpg", f"{theme}-atlas")
    color.location = (-320, 280)
    links.new(color.outputs["Color"], shader.inputs["Base Color"])
    if document["glow"]:
        glow = nodes.new("ShaderNodeTexImage")
        glow.image = _image(folder / document["glow"], f"{theme}-atlas-glow")
        glow.location = (-320, -20)
        links.new(glow.outputs["Color"], shader.inputs["Emission Color"])
        shader.inputs["Emission Strength"].default_value = 1.0
    return result


def relink(root, theme):
    """Rebuild the atlas material for `theme` and give it to every mesh that used the old one."""
    old = bpy.data.materials.get(MATERIAL)
    if old is not None:
        old.name = f"{MATERIAL} (replaced)"
    new = material(root, theme)
    for mesh in bpy.data.meshes:
        for index, slot in enumerate(mesh.materials):
            if slot is old:
                mesh.materials[index] = new
    if old is not None:
        bpy.data.materials.remove(old)


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


def _uv(card, width, height, u, v):
    return (
        (card["x"] + 0.5 + u * (card["width"] - 1)) / width,
        1 - (card["y"] + card["height"] - 0.5 - v * (card["height"] - 1)) / height,
    )


def _layer(mesh):
    layer = mesh.uv_layers.get("City atlas") or mesh.uv_layers.new(name="City atlas")
    mesh.uv_layers.active = layer
    layer.active_render = True
    return layer


def record(mesh, names, document):
    """Store each face's card and the card rectangles the UVs were fitted to."""
    used = sorted(set(names))
    if CARD_ATTRIBUTE in mesh.attributes:
        mesh.attributes.remove(mesh.attributes[CARD_ATTRIBUTE])
    mesh.attributes.new(CARD_ATTRIBUTE, "INT", "FACE").data.foreach_set("value", [used.index(n) for n in names])
    mesh[CARD_RECORD] = json.dumps({
        "names": used,
        "width": document["width"],
        "height": document["height"],
        "cards": {name: {key: document["cards"][name][key] for key in ("x", "y", "width", "height")} for name in used},
    })


def apply(obj, cards, default, *, theme, root=Path.cwd(), from_above=False):
    """Give `obj` the atlas material and UVs. `from_above` maps curved roofs from the top, except their ends."""
    document, _ = atlas(root, theme)
    width, height = document["width"], document["height"]
    mesh = obj.data
    mesh.materials.clear()
    mesh.materials.append(material(root, theme))
    layer = _layer(mesh)

    matrix = obj.matrix_world
    rotation = matrix.to_3x3()
    points = [matrix @ vertex.co for vertex in mesh.vertices]
    low = [min(point[axis] for point in points) for axis in range(3)]
    high = [max(point[axis] for point in points) for axis in range(3)]
    span = [max(high[axis] - low[axis], 1e-6) for axis in range(3)]

    names = []
    for polygon in mesh.polygons:
        polygon.material_index = 0
        facing = side((rotation @ polygon.normal).normalized())
        if from_above and facing in ("left", "right", "bottom"):
            facing = "top"
        name = cards.get(facing, default)
        if name not in document["cards"]:
            raise ValueError(f"{obj.name}: the {theme} atlas has no card named {name!r}")
        names.append(name)
        across, flipped, up = PROJECTION[facing]
        for loop in polygon.loop_indices:
            point = points[mesh.loops[loop].vertex_index]
            u = (point[across] - low[across]) / span[across]
            v = (point[up] - low[up]) / span[up]
            layer.data[loop].uv = _uv(document["cards"][name], width, height, 1 - u if flipped else u, v)
    record(mesh, names, document)


def refresh(obj, *, theme, root=Path.cwd()):
    """Fit recorded UVs to the theme atlas's current card positions."""
    mesh = obj.data
    if CARD_RECORD not in mesh or CARD_ATTRIBUTE not in mesh.attributes:
        raise ValueError(f"{obj.name} has no card record. Map it with apply() first")
    document, _ = atlas(root, theme)
    old = json.loads(mesh[CARD_RECORD])
    indices = [0] * len(mesh.polygons)
    mesh.attributes[CARD_ATTRIBUTE].data.foreach_get("value", indices)
    layer = _layer(mesh)
    names = []
    for polygon, index in zip(mesh.polygons, indices):
        name = old["names"][index]
        if name not in document["cards"]:
            raise ValueError(f"{obj.name}: the {theme} atlas no longer has card {name!r}")
        before = old["cards"][name]
        names.append(name)
        for loop in polygon.loop_indices:
            uv = layer.data[loop].uv
            u = (uv.x * old["width"] - before["x"] - 0.5) / (before["width"] - 1)
            v = (before["y"] + before["height"] - 0.5 - (1 - uv.y) * old["height"]) / (before["height"] - 1)
            layer.data[loop].uv = _uv(document["cards"][name], document["width"], document["height"], u, v)
    record(mesh, names, document)
