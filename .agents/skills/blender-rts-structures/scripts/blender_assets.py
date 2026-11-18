"""Build a linked review gallery or stage one static structure GLB."""
import argparse
import json
import math
import os
from pathlib import Path
import re
import struct
import sys
from tempfile import TemporaryDirectory

import bpy
from mathutils import Vector


LIBRARY = Path("art/blender/library")
CATEGORIES = ("structures", "units", "creatures")
ASSET_ID = re.compile(r"[a-z0-9]+(?:-[a-z0-9]+)*")
# A foundation may sink this far below Z=0 to meet uneven terrain.
GROUND_SKIRT = 0.25
# The footprint center may drift this fraction of the asset's width or depth, for overhangs.
CENTER_TOLERANCE = 0.1


def asset_id(value):
    if not ASSET_ID.fullmatch(value):
        raise argparse.ArgumentTypeError(f"Expected a lowercase kebab-case asset ID, got {value!r}")
    return value


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
    for category in CATEGORIES:
        instances = []
        for source in sorted((library / category).glob("*.blend")):
            asset_id(source.stem)
            collection = load_asset(source, link=True)
            instance = bpy.data.objects.new(f"{category}/{collection.name}", None)
            instance.instance_type = "COLLECTION"
            instance.instance_collection = collection
            instances.append(instance)
        if instances:
            display = bpy.data.collections.new(category.title())
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
                view.shading.color_type = "MATERIAL"
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
    return f"{length:,} bytes, {triangles:,} triangles in mesh data, {len(primitives)} primitives"


def export_structure(root, identifier, output):
    source = root / LIBRARY / "structures" / f"{identifier}.blend"
    collection = load_asset(source, link=False)
    objects = set(collection.all_objects)
    bpy.context.scene.collection.children.link(collection)
    bpy.context.view_layer.update()

    for obj in objects:
        if (
            obj.type not in {"MESH", "EMPTY"}
            or obj.instance_type != "NONE"
            or obj.animation_data
            or (obj.parent is not None and obj.parent not in objects)
        ):
            raise ValueError(f"{obj.name} requires a specialized export or belongs outside the asset collection")

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
    size = " × ".join(f"{value:.3g}" for value in maximum - minimum)
    return f"{glb_summary(output)}, {size} Blender units (width × depth × height)"


def main():
    if not bpy.app.background:
        raise SystemExit("Run this helper with Blender's --background flag")

    arguments = argparse.ArgumentParser(description=__doc__)
    commands = arguments.add_subparsers(dest="command", required=True)
    for command in (commands.add_parser("gallery"), commands.add_parser("export")):
        command.add_argument("--root", type=Path, default=Path.cwd())
        command.add_argument("--replace", action="store_true", help="Replace the generated output")
    commands.choices["export"].add_argument("asset_id", type=asset_id)
    options = arguments.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])
    root = options.root.resolve()
    if not (root / LIBRARY).is_dir():
        arguments.error(f"{root} has no {LIBRARY} folder. Run from the web-rts root or pass --root.")
    if options.command == "gallery":
        destination = root / "art/blender/gallery.blend"
    else:
        destination = root / "art/staging/models/structures" / f"{options.asset_id}.glb"

    if not options.replace and destination.exists():
        arguments.error(f"{destination} already exists. Pass --replace to overwrite it.")

    bpy.ops.wm.read_factory_settings(use_empty=True)
    destination.parent.mkdir(parents=True, exist_ok=True)
    with TemporaryDirectory(dir=destination.parent) as temporary:
        output = Path(temporary) / destination.name
        if options.command == "gallery":
            summary = build_gallery(root, output, destination)
        else:
            summary = export_structure(root, options.asset_id, output)
        if options.replace:
            output.replace(destination)
        else:
            os.link(output, destination)

    print(f"{destination} ({summary})")


if __name__ == "__main__":
    main()
