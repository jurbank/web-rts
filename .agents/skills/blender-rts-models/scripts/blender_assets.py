"""Build a linked review gallery, stage one rigid model GLB, render a staged GLB for review, refresh a set's
sources after its atlas is repainted, or audit a set's exports against its current atlas."""
import argparse
import hashlib
import json
import math
import os
from pathlib import Path
import re
import struct
import sys
from tempfile import TemporaryDirectory

import bpy
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Matrix, Vector
import numpy


# Each path continues with a place: the model's kind, then its set, such as vehicles/factions/cyber-samurai.
LIBRARY = Path("art/blender/library")
STAGING = Path("art/staging/models")
RUNTIME = Path("apps/website/public/models")
RENDERS = Path("art/staging/renders")
# Rigid kinds export here. Skeletal kinds export with the blender-rts-creatures skill, which imports this module.
RIGID_KINDS = ("structures", "vehicles")
SKELETAL_KINDS = ("infantry", "creatures")
KINDS = RIGID_KINDS + SKELETAL_KINDS
# The review sheet: a close view and a lineup on top, desktop and phone crops at true pixel size below.
SHEET_WIDTH = 1400
SHEET_GAP = 8
SHEET_ROW = 512
SHEET_CROP_HEIGHT = 400
SHEET_BACKGROUND = "#11151a"
CROP_WIDTH = (SHEET_WIDTH - SHEET_GAP) // 2
# The game camera in packages/render/src/camera.ts.
FIELD_OF_VIEW = 40
PITCH = 55
MIN_DISTANCE = 8
# A set is a theme, the look of a map, or a faction, the look of one side. Each has its own folder and atlas.
THEMES = Path("themes")
FACTIONS = Path("factions")
MATERIALS = Path("art/blender/materials")
ASSET_ID = re.compile(r"[a-z0-9]+(?:-[a-z0-9]+)*")
# A foundation may sink this far below Z=0 to meet uneven terrain.
GROUND_SKIRT = 0.25
# The footprint center may drift this fraction of the asset's width or depth, for overhangs.
CENTER_TOLERANCE = 0.1
TEXTURE_KEY = re.compile(r'"\w+Texture"')
# The game multiplies the material named "team" by its player's color. Reviews show this sample color.
TEAM_MATERIAL = "team"
TEAM_SAMPLE = "#2f6fdf"
# Units move in every direction, so their renders turn them to show the side as well as the front.
UNIT_TURN = 35
# A source collection records the gameplay radius it was built for under this property. Exports carry it in the
# scene's extras, so the game can fit a model to a definition of another size.
RADIUS = "radius"
# Provisional triangle budgets, set by how many copies of each kind a phone shows at once, until a real phone
# is measured. A hero is a model only a few of which take the field, such as a MOBA hero or a boss monster.
BUDGETS = {"structures": 2500, "vehicles": 2000, "infantry": 1000, "creatures": 1000}
HERO_BUDGET = 4000
# A creature's baked frames over all its clips, which set its GPU memory with its vertex count.
FRAME_BUDGET = 100


def asset_id(value):
    if not ASSET_ID.fullmatch(value):
        raise argparse.ArgumentTypeError(f"Expected a lowercase kebab-case asset ID, got {value!r}")
    return value


def model_ref(value, default_place):
    """An ID in the default place, a theme/ID, or factions/<faction>/ID, after an optional kind such as structures:."""
    kind, _, value = value.rpartition(":")
    if kind and kind not in KINDS:
        raise argparse.ArgumentTypeError(f"Expected a kind from {', '.join(KINDS)}, got {kind!r}")
    kind = Path(kind or default_place.parts[0])
    parts = value.split("/")
    if len(parts) == 1:
        return kind / model_set(default_place), asset_id(parts[0])
    if len(parts) == 2:
        return kind / THEMES / asset_id(parts[0]), asset_id(parts[1])
    if len(parts) == 3 and parts[0] in ("themes", "factions"):
        return kind / parts[0] / asset_id(parts[1]), asset_id(parts[2])
    raise argparse.ArgumentTypeError(
        f"Expected ID, theme/ID, or factions/<faction>/ID, optionally after <kind>:, got {value!r}"
    )


def model_set(place):
    return Path(*place.parts[1:])


def load_asset(source, *, link):
    if not source.is_file():
        raise ValueError(f"Missing source file: {source}")

    with bpy.data.libraries.load(str(source), link=link, assets_only=True) as (available, result):
        if source.stem not in available.collections:
            raise ValueError(f"{source} needs a collection named {source.stem!r} marked as an Asset")
        result.collections = [source.stem]

    collection = result.collections[0]
    if collection is None:
        raise ValueError(f"Blender could not load the asset from {source}")
    if collection.instance_offset.length > 0.00001:
        raise ValueError(f"Set the collection instance offset to zero in {source}")
    return collection


def mesh_corners(obj, matrix):
    if obj.type != "MESH" or not obj.data.vertices:
        return []
    return [matrix @ Vector(corner) for corner in obj.bound_box]


def bounds(corners, label):
    if not corners:
        raise ValueError(f"{label} has no geometry")
    minimum = Vector(tuple(min(point[axis] for point in corners) for axis in range(3)))
    maximum = Vector(tuple(max(point[axis] for point in corners) for axis in range(3)))
    return minimum, maximum


def build_gallery(root, output, destination):
    library = root / LIBRARY
    scene = bpy.context.scene
    groups = {}
    folders = []
    for kind in KINDS:
        for sets in (THEMES, FACTIONS):
            parent = library / kind / sets
            if parent.is_dir():
                folders.extend(
                    (f"{kind}/{sets}/{asset_id(folder.name)}", folder)
                    for folder in sorted(parent.iterdir())
                    if folder.is_dir()
                )
    for category, folder in folders:
        instances = []
        for source in sorted(folder.glob("*.blend")):
            asset_id(source.stem)
            collection = load_asset(source, link=True)
            instance = bpy.data.objects.new(f"{category}/{collection.name}", None)
            instance.instance_type = "COLLECTION"
            instance.instance_collection = collection
            instances.append(instance)
        if instances:
            display = bpy.data.collections.new(category.replace("/", " · ").title())
            scene.collection.children.link(display)
            for instance in instances:
                display.objects.link(instance)
            groups[category] = instances

    if not groups:
        raise ValueError(f"No asset source files found under {library}")

    # Measure through the instances so modifiers and object transforms count.
    bpy.context.view_layer.update()
    corners = {instance.name: [] for group in groups.values() for instance in group}
    for item in bpy.context.evaluated_depsgraph_get().object_instances:
        if item.is_instance and item.parent is not None and item.parent.name in corners:
            corners[item.parent.name] += mesh_corners(item.object, item.matrix_world)
    measured = [bounds(points, name) for name, points in corners.items()]

    # Each asset sits on its grid point as authored, so anchor mistakes stay visible.
    reach = max(max(-low.x, high.x, -low.y, high.y) for low, high in measured)
    height = max(high.z for _, high in measured)
    spacing = max(1.0, reach * 3)
    columns = math.ceil(math.sqrt(len(measured)))
    row = 0
    for group in groups.values():
        for index, instance in enumerate(group):
            instance.location = ((index % columns) * spacing, -(row + index // columns) * spacing, 0)
            instance.empty_display_size = spacing * 0.1
        row += math.ceil(len(group) / columns) + 1

    used_columns = min(columns, max(len(group) for group in groups.values()))
    for screen in bpy.data.screens:
        for area in screen.areas:
            if area.type == "VIEW_3D":
                view = area.spaces.active
                view.shading.color_type = "TEXTURE"
                view.overlay.show_floor = False
                view.overlay.show_axis_x = False
                view.overlay.show_axis_y = False
                view.region_3d.view_rotation = Vector((-0.65, 1.0, -1.25)).to_track_quat("-Z", "Y")
                view.region_3d.view_location = (
                    (used_columns - 1) * spacing / 2,
                    -(row - 2) * spacing / 2,
                    height / 3,
                )
                view.region_3d.view_distance = spacing * max(used_columns, row - 1) * 1.3
                view.region_3d.view_perspective = "ORTHO"

    # Set paths after linking all assets. Loading another library can normalize existing paths.
    for group in groups.values():
        for instance in group:
            source = instance.instance_collection.library
            relative = os.path.relpath(source.filepath, destination.parent)
            source.filepath = "//" + Path(relative).as_posix()
    bpy.ops.wm.save_as_mainfile(filepath=str(output), relative_remap=False)
    return f"{len(measured)} linked assets"


def glb_summary(output):
    with output.open("rb") as stream:
        magic, version, length = struct.unpack("<4sII", stream.read(12))
        json_length, chunk_type = struct.unpack("<I4s", stream.read(8))
        if (magic, version, length, chunk_type) != (b"glTF", 2, output.stat().st_size, b"JSON"):
            raise ValueError("Invalid GLB header")
        document = json.loads(stream.read(json_length))

    primitives = [primitive for mesh in document.get("meshes", []) for primitive in mesh["primitives"]]
    if not primitives or any(primitive.get("mode", 4) != 4 for primitive in primitives):
        raise ValueError("Expected a GLB with triangle primitives")
    accessors = document["accessors"]
    triangles = sum(
        accessors[primitive.get("indices", primitive["attributes"]["POSITION"])]["count"] // 3
        for primitive in primitives
    )
    if not triangles:
        raise ValueError("The exported model has no triangles")
    vertices = sum(accessors[primitive["attributes"]["POSITION"]]["count"] for primitive in primitives)

    images = document.get("images", [])
    external = [image["uri"] for image in images if "uri" in image]
    if external:
        raise ValueError(f"The GLB references images outside the file: {', '.join(external)}")
    materials = document.get("materials", [])
    textured = sum(1 for material in materials if TEXTURE_KEY.search(json.dumps(material)))
    glowing = sum(1 for material in materials if "emissiveTexture" in material)
    team = any(material.get("name") == TEAM_MATERIAL for material in materials)
    summary = (
        f"{length:,} bytes, {triangles:,} triangles and {vertices:,} vertices in mesh data, "
        f"{len(primitives)} primitives, {len(images)} images, {textured} of {len(materials)} materials textured, "
        f"{glowing} glowing"
    )
    return summary, len(images), glowing, team, triangles


def budget(place, triangles, *, hero=False, over=None, blockout=False):
    """How much of its kind's triangle budget a model uses. Over budget fails unless `over` says why."""
    kind = "hero" if hero else place.parts[0]
    limit = HERO_BUDGET if hero else BUDGETS[kind]
    share = f"{triangles / limit:.0%} of the {kind} budget of {limit:,} triangles"
    if triangles <= limit:
        return share
    if over:
        return f"{share}, over because {over}"
    if blockout:
        return f"{share}, over"
    raise ValueError(
        f"{triangles:,} triangles is {share}. Simplify it, or pass --over-budget with the reason it needs more"
    )


def set_settings(root, place):
    path = root / MATERIALS / model_set(place) / "atlas.json"
    if not path.is_file():
        raise ValueError(
            f"No atlas for {model_set(place)}. Add it to THEMES or FACTIONS in art/blender/materials/city_atlas.py"
        )
    return json.loads(path.read_text())


def set_images(root, place):
    """Digests of the set's current atlas images on disk, which every export of the set should embed."""
    settings = set_settings(root, place)
    folder = root / MATERIALS / model_set(place)
    names = ["atlas.jpg"] + [settings[key] for key in ("glow", "surface") if settings.get(key)]
    return {hashlib.md5((folder / name).read_bytes()).hexdigest() for name in names}


def glb_document(path):
    data = path.read_bytes()
    json_length = struct.unpack_from("<I", data, 12)[0]
    return data, json_length, json.loads(data[20:20 + json_length])


def embedded_images(path):
    data, json_length, document = glb_document(path)
    start = 28 + json_length
    digests = []
    for image in document.get("images", []):
        view = document["bufferViews"][image["bufferView"]]
        offset = start + view.get("byteOffset", 0)
        digests.append(hashlib.md5(data[offset:offset + view["byteLength"]]).hexdigest())
    return digests


def stale_exports(root, place_set, skip=None):
    """Exports of a set, in any kind, staged or approved, that embed images other than its current atlas."""
    stale = []
    for kind in KINDS:
        current = None
        for folder in (STAGING, RUNTIME):
            for path in sorted((root / folder / kind / place_set).glob("*.glb")):
                if path == skip:
                    continue
                current = current or set_images(root, Path(kind) / place_set)
                if not set(embedded_images(path)) <= current:
                    stale.append(path.relative_to(root))
    return stale


def write_scene_extras(path, values):
    """Merge `values` into the GLB scene's extras, which three.js reads as the scene's userData."""
    data, json_length, document = glb_document(path)
    binary = data[20 + json_length:]
    document["scenes"][document.get("scene", 0)].setdefault("extras", {}).update(values)
    text = json.dumps(document, separators=(",", ":")).encode()
    text += b" " * (-len(text) % 4)
    path.write_bytes(
        struct.pack("<4sII", b"glTF", 2, 12 + 8 + len(text) + len(binary))
        + struct.pack("<I4s", len(text), b"JSON") + text + binary
    )


def footprint(collection, minimum, maximum):
    """The radius the source says it was built for, or how far it reaches across the ground when it says nothing."""
    if RADIUS in collection:
        return float(collection[RADIUS]), "from the source"
    return max(-minimum.x, maximum.x, -minimum.y, maximum.y), "measured"


def finish_export(root, place, output, destination, collection, minimum, maximum):
    """Record the footprint, and name exports of the set that still embed an older atlas."""
    radius, origin = footprint(collection, minimum, maximum)
    write_scene_extras(output, {RADIUS: round(radius, 4)})
    stale = stale_exports(root, model_set(place), skip=destination)
    note = f", radius {radius:.3g} {origin}"
    if stale:
        note += f". These exports of the set embed an older atlas, so export them again: {', '.join(map(str, stale))}"
    return note


def join_structure(collection, objects, identifier):
    """Merge a structure's meshes, modifiers applied, into one object, so it exports one primitive per material."""
    meshes = [obj for obj in objects if obj.type == "MESH"]
    if len(meshes) < 2 or any(obj.parent is not None or obj.children for obj in objects):
        return objects
    depsgraph = bpy.context.evaluated_depsgraph_get()
    parts = []
    for obj in meshes:
        data = bpy.data.meshes.new_from_object(
            obj.evaluated_get(depsgraph), preserve_all_data_layers=True, depsgraph=depsgraph
        )
        data.transform(obj.matrix_world)
        part = bpy.data.objects.new(obj.name, data)
        collection.objects.link(part)
        parts.append(part)
    for obj in meshes:
        bpy.data.objects.remove(obj)
    with bpy.context.temp_override(active_object=parts[0], selected_editable_objects=parts):
        bpy.ops.object.join()
    parts[0].name = parts[0].data.name = identifier
    bpy.context.view_layer.update()
    return set(collection.all_objects)


def vehicle_rig(objects):
    """Name a vehicle's moving parts and sockets, which the game finds by name."""
    for obj in objects:
        if not ASSET_ID.fullmatch(obj.name):
            raise ValueError(f"Name the vehicle part {obj.name!r} in lowercase kebab-case, such as turret or muzzle")
    parts = sorted(obj.name for obj in objects if obj.type == "MESH" and obj.parent is not None)
    sockets = sorted(obj.name for obj in objects if obj.type == "EMPTY")
    return f"moving parts: {', '.join(parts) or 'none'}; sockets: {', '.join(sockets) or 'none'}"


def export_model(root, place, identifier, output, destination, blockout, hero=False, over=None):
    source = root / LIBRARY / place / f"{identifier}.blend"
    collection = load_asset(source, link=False)
    objects = set(collection.all_objects)
    bpy.context.scene.collection.children.link(collection)
    bpy.context.view_layer.update()
    structure = place.parts[0] == "structures"
    if structure:
        objects = join_structure(collection, objects, identifier)

    for obj in objects:
        if (
            obj.type not in {"MESH", "EMPTY"}
            or obj.instance_type != "NONE"
            or obj.animation_data
            or (obj.parent is not None and obj.parent not in objects)
        ):
            raise ValueError(f"{obj.name} requires a specialized export or belongs outside the asset collection")
    vehicle = place.parts[0] == "vehicles"
    rig = vehicle_rig(objects) if vehicle else ""

    depsgraph = bpy.context.evaluated_depsgraph_get()
    evaluated = [obj.evaluated_get(depsgraph) for obj in objects]
    minimum, maximum = bounds(
        [corner for obj in evaluated for corner in mesh_corners(obj, obj.matrix_world)], identifier
    )
    if not -GROUND_SKIRT - 0.001 <= minimum.z <= 0.001:
        raise ValueError(
            f"Expected the lowest point between Z={-GROUND_SKIRT:g} and Z=0, measured Z={minimum.z:g}"
        )
    center = (minimum + maximum) * 0.5
    extent = maximum - minimum
    if abs(center.x) > extent.x * CENTER_TOLERANCE or abs(center.y) > extent.y * CENTER_TOLERANCE:
        raise ValueError(
            f"Center the footprint on the world origin, measured center X={center.x:g} Y={center.y:g}"
        )

    status = bpy.ops.export_scene.gltf(
        filepath=str(output),
        export_format="GLB",
        export_yup=True,
        export_animations=False,
        export_apply=True,
    )
    if "FINISHED" not in status:
        raise ValueError("Blender could not export the collection")
    summary, images, glowing, team, triangles = glb_summary(output)
    share = budget(place, triangles, hero=hero, over=over, blockout=blockout)
    faction = place.parts[1] == FACTIONS.name
    if (vehicle or (structure and faction)) and not team and not blockout:
        what = "A vehicle" if vehicle else "A faction's building"
        raise ValueError(
            f"{what} shows its owner. Give the faces that take the player's color a material named {TEAM_MATERIAL!r}."
        )
    if not images and not blockout:
        raise ValueError(
            "The export has no image textures. docs/ART_DIRECTION.md calls for painted detail, and "
            "procedural shaders do not survive export, so bake them. Pass --blockout to stage an untextured blockout."
        )
    if set_settings(root, place)["glow"] and not glowing and not blockout:
        raise ValueError(
            f"{model_set(place)} glows, but the export has no emissive texture. Map it with atlas_cards.py, "
            "whose material links the set's glow map."
        )
    size = " × ".join(f"{value:.3g}" for value in maximum - minimum)
    stage = ", untextured blockout" if blockout else ""
    rig = f", {rig}" if rig else ""
    note = finish_export(root, place, output, destination, collection, minimum, maximum)
    return f"{summary}, {share}, {size} Blender units (width × depth × height){rig}{stage}{note}"


def refresh_set(root, place_set):
    """Fit every card-mapped mesh in a set's sources, in every kind, to the set atlas's current card positions."""
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    import atlas_cards

    kind_set, name = place_set.parts
    which = {"theme" if kind_set == THEMES.name else "faction": name}
    refreshed = []
    for kind in KINDS:
        for source in sorted((root / LIBRARY / kind / place_set).glob("*.blend")):
            bpy.ops.wm.open_mainfile(filepath=str(source))
            for obj in bpy.data.objects:
                if obj.type == "MESH" and atlas_cards.CARD_RECORD in obj.data:
                    atlas_cards.refresh(obj, root=root, **which)
            bpy.ops.wm.save_mainfile()
            refreshed.append(f"{kind}/{source.stem}")
    return refreshed


def linear(color):
    channels = (int(color[index:index + 2], 16) / 255 for index in (1, 3, 5))
    return tuple(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in channels) + (1.0,)


# Review lighting. "day" mirrors packages/render/src/renderer.ts. Each set's atlas settings pick a default.
# three.js divides light intensities by pi where Blender does not.
LIGHTING = {
    "day": {"ground": "#40464f", "sky": "#ffffff", "sky_strength": 2 / math.pi,
            "sun": "#ffffff", "sun_strength": 1.5 / math.pi, "floor": "#3b4a3f"},
    "night": {"ground": "#0a0d12", "sky": "#3a5280", "sky_strength": 1.0,
              "sun": "#a9bcff", "sun_strength": 0.45, "floor": "#20262a"},
}


def stage_like_game(scene, lighting):
    """Light the scene with a review preset: the game's daylight, or a night city."""
    preset = LIGHTING[lighting]
    world = bpy.data.worlds.new("Game hemisphere")
    world.use_nodes = True
    nodes, links = world.node_tree.nodes, world.node_tree.links
    direction = nodes.new("ShaderNodeTexCoord")
    axes = nodes.new("ShaderNodeSeparateXYZ")
    height = nodes.new("ShaderNodeMapRange")
    height.inputs["From Min"].default_value = -1
    sky = nodes.new("ShaderNodeMix")
    sky.data_type = "RGBA"
    sky.inputs["A"].default_value = linear(preset["ground"])
    sky.inputs["B"].default_value = linear(preset["sky"])
    background = nodes["Background"]
    background.inputs["Strength"].default_value = preset["sky_strength"]
    links.new(direction.outputs["Generated"], axes.inputs["Vector"])
    links.new(axes.outputs["Z"], height.inputs["Value"])
    links.new(height.outputs["Result"], sky.inputs["Factor"])
    links.new(sky.outputs["Result"], background.inputs["Color"])
    scene.world = world

    sun = bpy.data.objects.new("Sun", bpy.data.lights.new("Sun", "SUN"))
    sun.data.energy = preset["sun_strength"]
    sun.data.color = linear(preset["sun"])[:3]
    # The game's sun sits at three.js (-0.4, 1, 0.6), which is Blender (-0.4, -0.6, 1).
    sun.rotation_euler = Vector((-0.4, -0.6, 1)).to_track_quat("Z", "Y").to_euler()
    scene.collection.objects.link(sun)

    ground_material = bpy.data.materials.new("Ground")
    ground_material.use_nodes = True
    # The game's ground is Lambert, so it has no reflections.
    surface = ground_material.node_tree.nodes["Principled BSDF"]
    surface.inputs["Base Color"].default_value = linear(preset["floor"])
    surface.inputs["Roughness"].default_value = 1
    surface.inputs["Specular IOR Level"].default_value = 0
    plane = bpy.data.meshes.new("Ground")
    plane.from_pydata([(-500, -500, 0), (500, -500, 0), (500, 500, 0), (-500, 500, 0)], [], [(0, 1, 2, 3)])
    plane.materials.append(ground_material)
    scene.collection.objects.link(bpy.data.objects.new("Ground", plane))

    engines = {item.identifier for item in scene.render.bl_rna.properties["engine"].enum_items}
    scene.render.engine = next(e for e in ("BLENDER_EEVEE_NEXT", "BLENDER_EEVEE", "CYCLES") if e in engines)
    scene.view_settings.view_transform = "Standard"
    scene.render.image_settings.file_format = "PNG"


def tint_team(objects):
    """Multiply the team material by a sample player color, as the game does with the real one."""
    for material in {slot.material for obj in objects for slot in obj.material_slots if slot.material}:
        if material.name.split(".")[0] != TEAM_MATERIAL or not material.use_nodes:
            continue
        nodes, links = material.node_tree.nodes, material.node_tree.links
        base = next(node for node in nodes if node.type == "BSDF_PRINCIPLED").inputs["Base Color"]
        tint = nodes.new("ShaderNodeMix")
        tint.data_type = "RGBA"
        tint.blend_type = "MULTIPLY"
        tint.inputs["Factor"].default_value = 1
        tint.inputs["B"].default_value = linear(TEAM_SAMPLE)
        if base.links:
            links.new(base.links[0].from_socket, tint.inputs["A"])
        else:
            tint.inputs["A"].default_value = base.default_value
        links.new(tint.outputs["Result"], base)


def import_glb(path, place):
    before = set(bpy.context.scene.objects)
    bpy.ops.import_scene.gltf(filepath=str(path))
    objects = [obj for obj in bpy.context.scene.objects if obj not in before]
    tint_team(objects)
    if place.parts[0] != "structures":
        turn = Matrix.Rotation(math.radians(UNIT_TURN), 4, "Z")
        for obj in objects:
            if obj.parent is None:
                obj.matrix_world = turn @ obj.matrix_world
        bpy.context.view_layer.update()
    corners = [corner for obj in objects for corner in mesh_corners(obj, obj.matrix_world)]
    return objects, *bounds(corners, path.stem)


def find_export(root, place, identifier):
    for folder in (RUNTIME, STAGING):
        path = root / folder / place / f"{identifier}.glb"
        if path.is_file():
            return path
    raise ValueError(
        f"No export of {identifier} in {RUNTIME / place} or {STAGING / place}"
    )


def shoot(scene, camera, target_x, away, width, height, path, *, target_z=0.0):
    pitch = math.radians(PITCH)
    camera.location = (target_x, -away * math.cos(pitch), target_z + away * math.sin(pitch))
    scene.render.resolution_x, scene.render.resolution_y = width, height
    scene.render.filepath = str(path)
    bpy.ops.render.render(write_still=True)


def read_png(path):
    image = bpy.data.images.load(str(path))
    width, height = image.size
    pixels = numpy.empty(width * height * 4, dtype=numpy.float32)
    image.pixels.foreach_get(pixels)
    bpy.data.images.remove(image)
    # Blender stores rows bottom up. Arrays here run top down.
    return numpy.flipud(pixels.reshape(height, width, 4))


def write_png(array, path):
    height, width = array.shape[:2]
    image = bpy.data.images.new("Review sheet", width, height, alpha=False)
    image.pixels.foreach_set(numpy.ascontiguousarray(numpy.flipud(array)).ravel())
    image.filepath_raw = str(path)
    image.file_format = "PNG"
    image.save()


def asset_crop(scene, camera, minimum, maximum, pixels, limit):
    """Crop a render around the asset at its true pixel size, padded and capped at `limit`."""
    height, width = pixels.shape[:2]
    corners = [Vector((x, y, z)) for x in (minimum.x, maximum.x) for y in (minimum.y, maximum.y) for z in (minimum.z, maximum.z)]
    points = [world_to_camera_view(scene, camera, corner) for corner in corners]
    left, right = min(p.x for p in points) * width, max(p.x for p in points) * width
    top, bottom = (1 - max(p.y for p in points)) * height, (1 - min(p.y for p in points)) * height
    pad = max(16, 0.25 * max(right - left, bottom - top))
    crop_width = min(limit[0], width, round(right - left + 2 * pad))
    crop_height = min(limit[1], height, round(bottom - top + 2 * pad))
    x = min(max(0, round((left + right - crop_width) / 2)), width - crop_width)
    y = min(max(0, round((top + bottom - crop_height) / 2)), height - crop_height)
    return pixels[y:y + crop_height, x:x + crop_width]


def render_model(root, place, identifier, neighbors, distance, lighting):
    """Render the staged GLB, not the source, so anything the exporter dropped shows."""
    source = root / STAGING / place / f"{identifier}.glb"
    if not source.is_file():
        raise ValueError(f"Export {identifier} before rendering it. Missing {source}")
    scene = bpy.context.scene
    _, minimum, maximum = import_glb(source, place)

    # Line neighbors up to the right of the asset, left to right in the order given.
    lineup = [(minimum, maximum)]
    hidden = []
    edge, gap = maximum.x, max(1.0, (maximum - minimum).x * 0.3)
    for neighbor_place, neighbor in neighbors:
        objects, low, high = import_glb(find_export(root, neighbor_place, neighbor), neighbor_place)
        shift = edge + gap - low.x
        for obj in objects:
            if obj.parent is None:
                obj.location.x += shift
            obj.hide_render = True
        hidden += objects
        lineup.append((low + Vector((shift, 0, 0)), high + Vector((shift, 0, 0))))
        edge = high.x + shift
    default = set_settings(root, place)["lighting"]
    stage_like_game(scene, lighting or default)

    camera = bpy.data.objects.new("Game camera", bpy.data.cameras.new("Game camera"))
    camera.data.sensor_fit = "VERTICAL"
    camera.data.angle_y = math.radians(FIELD_OF_VIEW)
    camera.data.clip_end = 2000
    camera.rotation_euler = (math.radians(90 - PITCH), 0, 0)
    scene.collection.objects.link(camera)
    scene.camera = camera

    # The game camera only pans and zooms, so every view looks at the front (-Y) from above it.
    half_angle = math.tan(math.radians(FIELD_OF_VIEW) / 2)
    reach = (maximum - minimum).length / 2
    close = max(MIN_DISTANCE, reach / math.sin(math.radians(FIELD_OF_VIEW) / 2) * 1.15)
    folder = root / RENDERS / place
    folder.mkdir(parents=True, exist_ok=True)
    # A lighting other than the set's default gets its own files, so both sheets can sit side by side.
    stem = identifier if lighting in (None, default) else f"{identifier}-{lighting}"
    path = {name: folder / f"{stem}-{name}.png" for name in ("close", "desktop", "phone", "review")}
    shoot(scene, camera, 0, close, 1024, 1024, path["close"], target_z=(minimum.z + maximum.z) / 2)
    shoot(scene, camera, 0, distance, 1920, 1080, path["desktop"])
    desktop = asset_crop(scene, camera, minimum, maximum, read_png(path["desktop"]), (CROP_WIDTH, SHEET_CROP_HEIGHT))
    shoot(scene, camera, 0, distance, 844, 390, path["phone"])
    phone = asset_crop(scene, camera, minimum, maximum, read_png(path["phone"]), (CROP_WIDTH, SHEET_CROP_HEIGHT))

    for obj in hidden:
        obj.hide_render = False
    left, right = lineup[0][0].x, lineup[-1][1].x
    target_x = (left + right) / 2
    lineup_width = SHEET_WIDTH - SHEET_ROW - SHEET_GAP
    horizontal = half_angle * lineup_width / SHEET_ROW
    pitch = math.radians(PITCH)
    rise, run = math.sin(pitch), math.cos(pitch)
    away = MIN_DISTANCE
    # Fit all bounds corners in the perspective frustum, including tall near edges.
    for low, high in lineup:
        across = max(abs(low.x - target_x), abs(high.x - target_x))
        for y in (low.y, high.y):
            for z in (low.z, high.z):
                up = abs(y * rise + z * run)
                depth_offset = y * run - z * rise
                away = max(away, max(across / horizontal, up / half_angle) / 0.92 - depth_offset)
    with TemporaryDirectory() as temporary:
        lineup_path = Path(temporary) / "lineup.png"
        shoot(scene, camera, target_x, away, lineup_width, SHEET_ROW, lineup_path)
        lineup_pixels = read_png(lineup_path)

    sheet = numpy.empty((SHEET_ROW + SHEET_GAP + max(len(desktop), len(phone)), SHEET_WIDTH, 4), numpy.float32)
    sheet[:] = [int(SHEET_BACKGROUND[i:i + 2], 16) / 255 for i in (1, 3, 5)] + [1]
    halved = read_png(path["close"]).reshape(SHEET_ROW, 2, SHEET_ROW, 2, 4).mean(axis=(1, 3))
    sheet[:SHEET_ROW, :SHEET_ROW] = halved
    sheet[:SHEET_ROW, SHEET_ROW + SHEET_GAP:] = lineup_pixels
    below = SHEET_ROW + SHEET_GAP
    sheet[below:below + len(desktop), :desktop.shape[1]] = desktop
    start = CROP_WIDTH + SHEET_GAP
    sheet[below:below + len(phone), start:start + phone.shape[1]] = phone
    write_png(sheet, path["review"])
    return [str(path[name]) for name in ("review", "close", "desktop", "phone")]


def add_budget_arguments(command):
    command.add_argument("--hero", action="store_true", help=f"Use the hero budget of {HERO_BUDGET:,} triangles")
    command.add_argument(
        "--over-budget", metavar="REASON", help="Allow an export over its budget, recording why in the summary"
    )


def main():
    if not bpy.app.background:
        raise SystemExit("Run this helper with Blender's --background flag")

    arguments = argparse.ArgumentParser(description=__doc__)
    commands = arguments.add_subparsers(dest="command", required=True)
    for command in (commands.add_parser("gallery"), commands.add_parser("export")):
        command.add_argument("--replace", action="store_true", help="Replace the generated output")
    commands.choices["export"].add_argument("asset_id", type=asset_id)
    commands.choices["export"].add_argument(
        "--blockout", action="store_true", help="Allow an untextured export for shape review"
    )
    add_budget_arguments(commands.choices["export"])
    refresh = commands.add_parser("refresh", help="Refit every source of a set to its repainted atlas")
    audit = commands.add_parser("audit", help="List a set's exports that embed an older atlas")
    for command in (refresh, audit):
        which = command.add_mutually_exclusive_group(required=True)
        which.add_argument("--theme", type=asset_id, help="A theme, the look of a map")
        which.add_argument("--faction", type=asset_id, help="A faction, the look of one side")
    render = commands.add_parser("render", help="Render a staged export from the game camera")
    render.add_argument("asset_id", type=asset_id)
    for command in (commands.choices["export"], render):
        which = command.add_mutually_exclusive_group(required=True)
        which.add_argument("--theme", type=asset_id, help="A theme, the look of a map")
        which.add_argument("--faction", type=asset_id, help="A faction, the look of one side")
        command.add_argument(
            "--kind",
            choices=RIGID_KINDS,
            default="structures",
            help="What the model is. Skeletal kinds use the blender-rts-creatures skill.",
        )
    render.add_argument(
        "--with",
        dest="neighbors",
        default="",
        help="Comma-separated IDs in the same kind and set, theme/ID, or factions/<faction>/ID references to "
        "approved or staged models, each optionally after another kind, as in structures:war-factory",
    )
    render.add_argument(
        "--lighting", choices=sorted(LIGHTING), help="Review lighting, instead of the set's default"
    )
    render.add_argument(
        "--distance", type=float, default=30, help="Camera distance for the desktop and phone views"
    )
    for command in commands.choices.values():
        command.add_argument("--root", type=Path, default=Path.cwd())
    options = arguments.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])
    root = options.root.resolve()
    if not (root / LIBRARY).is_dir():
        arguments.error(f"{root} has no {LIBRARY} folder. Run from the web-rts root or pass --root.")
    bpy.ops.wm.read_factory_settings(use_empty=True)
    if options.command in ("refresh", "audit"):
        place_set = THEMES / options.theme if options.theme else FACTIONS / options.faction
        if options.command == "refresh":
            print("\n".join(f"refreshed {item}" for item in refresh_set(root, place_set)))
        stale = stale_exports(root, place_set)
        print("\n".join(f"stale {path}" for path in stale) or f"Every export of {place_set} embeds its current atlas")
        if options.command == "audit" and stale:
            raise SystemExit(1)
        return
    if options.command != "gallery":
        place = Path(options.kind) / (THEMES / options.theme if options.theme else FACTIONS / options.faction)

    if options.command == "render":
        try:
            neighbors = [
                model_ref(item.strip(), place) for item in options.neighbors.split(",")
            ] if options.neighbors else []
        except argparse.ArgumentTypeError as error:
            render.error(str(error))
        print("\n".join(render_model(
            root, place, options.asset_id, neighbors, options.distance, options.lighting
        )))
        return
    if options.command == "gallery":
        destination = root / "art/blender/gallery.blend"
    else:
        destination = root / STAGING / place / f"{options.asset_id}.glb"

    if not options.replace and destination.exists():
        arguments.error(f"{destination} already exists. Pass --replace to overwrite it.")

    destination.parent.mkdir(parents=True, exist_ok=True)
    with TemporaryDirectory(dir=destination.parent) as temporary:
        output = Path(temporary) / destination.name
        if options.command == "gallery":
            summary = build_gallery(root, output, destination)
        else:
            summary = export_model(
                root, place, options.asset_id, output, destination, options.blockout, options.hero,
                options.over_budget,
            )
        if options.replace:
            output.replace(destination)
        else:
            os.link(output, destination)

    print(f"{destination} ({summary})")


if __name__ == "__main__":
    main()
