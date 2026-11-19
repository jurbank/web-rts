"""Map structure faces onto cards of a theme's or faction's texture atlas.

Import inside Blender with the skill's scripts folder on sys.path. Save the
source to its library path first, so the atlas images link with relative paths:

    import atlas_cards
    atlas_cards.apply(obj, {"front": "wall_office_entrance", "top": "roof_flat_large"},
                      default="concrete", theme="modern")

Pass faction="<faction>" instead of theme= for a faction's structures.

Each face takes the card for the side it faces. Sides are front (-Y), back (+Y),
left (-X), right (+X), top (+Z), and bottom (-Z), and the card fills the
object's extent on that side, so text reads correctly from outside.

Each mesh records the card every face uses. After the atlas is repainted and
cards move, refresh(obj, theme=...) or refresh(obj, faction=...) fits the UVs again without re-mapping.
join(objects, name, ...) merges a building's mapped parts into one mesh, keeping each face's card.
"""
import json
from pathlib import Path

import bpy

MATERIALS = Path("art/blender/materials")
MATERIAL = "City atlas"
CARD_ATTRIBUTE = "atlas_card"
CARD_RECORD = "atlas_cards"


def structure_set(theme, faction):
    if (theme is None) == (faction is None):
        raise ValueError("Pass exactly one of theme= or faction=")
    return f"themes/{theme}" if theme else f"factions/{faction}"


def atlas(root, theme=None, faction=None):
    folder = structure_set(theme, faction)
    path = root / MATERIALS / folder / "atlas.json"
    if not path.is_file():
        raise ValueError(f"No atlas for {folder} at {path}")
    return json.loads(path.read_text()), path.parent


def _image(path, name):
    if not bpy.data.filepath:
        raise ValueError("Save the source to its library path before mapping cards, so atlas images link relatively")
    image = bpy.data.images.load(str(path), check_existing=True)
    image.name = name
    image.filepath = bpy.path.relpath(str(path))
    return image


def material(root, theme=None, faction=None):
    """The set's atlas material, created once per file. Its images are linked, not packed."""
    existing = bpy.data.materials.get(MATERIAL)
    if existing is not None:
        return existing
    document, folder = atlas(root, theme, faction)
    name = theme or faction
    result = bpy.data.materials.new(MATERIAL)
    result.use_nodes = True
    nodes, links = result.node_tree.nodes, result.node_tree.links
    shader = nodes["Principled BSDF"]
    shader.inputs["Roughness"].default_value = 0.86
    shader.inputs["Specular IOR Level"].default_value = 0.25
    color = nodes.new("ShaderNodeTexImage")
    color.image = _image(folder / "atlas.jpg", f"{name}-atlas")
    color.location = (-320, 280)
    links.new(color.outputs["Color"], shader.inputs["Base Color"])
    if document["glow"]:
        glow = nodes.new("ShaderNodeTexImage")
        glow.image = _image(folder / document["glow"], f"{name}-atlas-glow")
        glow.location = (-320, -20)
        links.new(glow.outputs["Color"], shader.inputs["Emission Color"])
        shader.inputs["Emission Strength"].default_value = 1.0
    if document.get("surface"):
        # Green is roughness and blue is metallic, the layout glTF exports as one metallic-roughness texture.
        surface = nodes.new("ShaderNodeTexImage")
        surface.image = _image(folder / document["surface"], f"{name}-atlas-surface")
        surface.image.colorspace_settings.name = "Non-Color"
        surface.location = (-520, -320)
        channels = nodes.new("ShaderNodeSeparateColor")
        channels.location = (-240, -320)
        links.new(surface.outputs["Color"], channels.inputs["Color"])
        links.new(channels.outputs["Green"], shader.inputs["Roughness"])
        links.new(channels.outputs["Blue"], shader.inputs["Metallic"])
        shader.inputs["Specular IOR Level"].default_value = 0.5
    return result


def relink(root, theme=None, faction=None):
    """Rebuild the set's atlas material and give it to every mesh that used the old one."""
    old = bpy.data.materials.get(MATERIAL)
    if old is not None:
        old.name = f"{MATERIAL} (replaced)"
    new = material(root, theme, faction)
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


def apply(obj, cards, default, *, theme=None, faction=None, root=Path.cwd(), from_above=False):
    """Give `obj` the atlas material and UVs. `from_above` maps curved roofs from the top, except their ends."""
    document, _ = atlas(root, theme, faction)
    label = theme or faction
    width, height = document["width"], document["height"]
    mesh = obj.data
    mesh.materials.clear()
    mesh.materials.append(material(root, theme, faction))
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
            raise ValueError(f"{obj.name}: the {label} atlas has no card named {name!r}")
        names.append(name)
        across, flipped, up = PROJECTION[facing]
        for loop in polygon.loop_indices:
            point = points[mesh.loops[loop].vertex_index]
            u = (point[across] - low[across]) / span[across]
            v = (point[up] - low[up]) / span[up]
            layer.data[loop].uv = _uv(document["cards"][name], width, height, 1 - u if flipped else u, v)
    record(mesh, names, document)


def refresh(obj, *, theme=None, faction=None, root=Path.cwd()):
    """Fit recorded UVs to the set atlas's current card positions."""
    mesh = obj.data
    if CARD_RECORD not in mesh or CARD_ATTRIBUTE not in mesh.attributes:
        raise ValueError(f"{obj.name} has no card record. Map it with apply() first")
    document, _ = atlas(root, theme, faction)
    label = theme or faction
    old = json.loads(mesh[CARD_RECORD])
    indices = [0] * len(mesh.polygons)
    mesh.attributes[CARD_ATTRIBUTE].data.foreach_get("value", indices)
    layer = _layer(mesh)
    names = []
    for polygon, index in zip(mesh.polygons, indices):
        name = old["names"][index]
        if name not in document["cards"]:
            raise ValueError(f"{obj.name}: the {label} atlas no longer has card {name!r}")
        before = old["cards"][name]
        names.append(name)
        for loop in polygon.loop_indices:
            uv = layer.data[loop].uv
            u = (uv.x * old["width"] - before["x"] - 0.5) / (before["width"] - 1)
            v = (before["y"] + before["height"] - 0.5 - (1 - uv.y) * old["height"]) / (before["height"] - 1)
            layer.data[loop].uv = _uv(document["cards"][name], document["width"], document["height"], u, v)
    record(mesh, names, document)


def join(objects, name, *, theme=None, faction=None, root=Path.cwd()):
    """Join meshes mapped with apply() into one object named `name`, keeping each face's card.

    The building then exports as one primitive, and refresh() still fits its UVs.
    """
    names = []
    for obj in objects:
        mesh = obj.data
        if CARD_RECORD not in mesh or CARD_ATTRIBUTE not in mesh.attributes:
            raise ValueError(f"{obj.name} has no card record. Map it with apply() first")
        old = json.loads(mesh[CARD_RECORD])
        indices = [0] * len(mesh.polygons)
        mesh.attributes[CARD_ATTRIBUTE].data.foreach_get("value", indices)
        for card in old["names"]:
            if card not in names:
                names.append(card)
        merged = [names.index(old["names"][index]) for index in indices]
        mesh.attributes.new("atlas_card_join", "INT", "FACE").data.foreach_set("value", merged)
    target = objects[0]
    with bpy.context.temp_override(active_object=target, selected_editable_objects=list(objects)):
        bpy.ops.object.join()
    target.name = target.data.name = name
    mesh = target.data
    merged = [0] * len(mesh.polygons)
    mesh.attributes["atlas_card_join"].data.foreach_get("value", merged)
    mesh.attributes.remove(mesh.attributes["atlas_card_join"])
    document, _ = atlas(root, theme, faction)
    record(mesh, [names[index] for index in merged], document)
    return target
