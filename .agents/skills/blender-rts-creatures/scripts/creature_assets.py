"""Bake a rigged creature's clips into vertex frames and stage its GLB, or render a staged creature for review."""
import argparse
import json
import math
import os
from pathlib import Path
import struct
import sys
from tempfile import TemporaryDirectory

import bpy
from mathutils import Vector
import numpy

# Paths, set settings, export checks, lighting, and the review sheet are shared with the rigid models skill.
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "blender-rts-models" / "scripts"))
import blender_assets as shared  # noqa: E402


# Clips in the order the clip sheet shows them. The first four are required.
REQUIRED_CLIPS = ("idle", "move", "attack", "die")
OPTIONAL_CLIPS = ("gather", "cast", "build")
LOOPS = {"idle", "move", "gather", "build"}
RATE = 20
# Each glTF vertex names the baked vertex it plays by this attribute. Blender writes "_vertex" as "_VERTEX".
VERTEX_ATTRIBUTE = "_vertex"
GLTF_ATTRIBUTE = "_VERTEX"
# A loop's last pose may differ from its first by this fraction of the creature's height.
LOOP_TOLERANCE = 0.03
# Move plays in place, since the game moves the unit. The body may sway this fraction of its width or depth.
DRIFT_TOLERANCE = 0.15
CLIP_CELL = 320
CLIP_COLUMNS = 4


def to_gltf(points):
    return numpy.stack((points[..., 0], points[..., 2], -points[..., 1]), axis=-1)


def from_gltf(points):
    return numpy.stack((points[..., 0], -points[..., 2], points[..., 1]), axis=-1)


def open_source(root, place, identifier):
    source = root / shared.LIBRARY / place / f"{identifier}.blend"
    if not source.is_file():
        raise ValueError(f"Missing source file: {source}")
    bpy.ops.wm.open_mainfile(filepath=str(source))
    collection = bpy.data.collections.get(identifier)
    if collection is None or collection.asset_data is None:
        raise ValueError(f"{source} needs a collection named {identifier!r} marked as an Asset")

    objects = set(collection.all_objects)
    unknown = [obj.name for obj in objects if obj.type not in {"MESH", "ARMATURE", "EMPTY"}]
    rigs = [obj for obj in objects if obj.type == "ARMATURE"]
    meshes = [obj for obj in objects if obj.type == "MESH"]
    if unknown or len(rigs) != 1 or len(meshes) != 1:
        raise ValueError(
            "Expected one armature, one mesh skinned to it, and socket empties. "
            "Join the creature's parts into one mesh and move helpers to a sibling collection"
        )
    rig, mesh = rigs[0], meshes[0]
    if not any(modifier.type == "ARMATURE" and modifier.object == rig for modifier in mesh.modifiers):
        raise ValueError(f"Skin {mesh.name} to {rig.name} with an Armature modifier")
    if rig.matrix_world.translation.xy.length > 0.001:
        raise ValueError(f"Put {rig.name}'s origin at the world origin, where the footprint is centered")
    sockets = sorted((obj for obj in objects if obj.type == "EMPTY"), key=lambda obj: obj.name)
    for socket in sockets:
        if not shared.ASSET_ID.fullmatch(socket.name) or socket.parent != rig or socket.parent_type != "BONE":
            raise ValueError(
                f"Parent the socket {socket.name!r} to a bone of {rig.name} and name it in kebab-case, such as muzzle"
            )
    scene = bpy.context.scene
    return collection, rig, mesh, sockets, scene.render.fps / scene.render.fps_base


def find_clips(blockout):
    clips = []
    for name in REQUIRED_CLIPS + OPTIONAL_CLIPS:
        action = bpy.data.actions.get(name)
        if action is None:
            if name in REQUIRED_CLIPS and not blockout:
                raise ValueError(f"Missing the {name!r} action. Every creature has {', '.join(REQUIRED_CLIPS)}")
            continue
        # Blender 5.1 crashes when an action without slots is assigned, so refuse it first.
        slot = next((slot for slot in action.slots if slot.target_id_type == "OBJECT"), None)
        if slot is None:
            raise ValueError(f"The {name!r} action has no keys for an object. Key the rig's pose bones in it")
        clips.append((name, action, slot))
    return clips


def pose(mesh, sockets, frame):
    """Vertex positions and normals, and socket positions, in Blender world space."""
    whole = math.floor(frame)
    bpy.context.scene.frame_set(whole, subframe=frame - whole)
    depsgraph = bpy.context.evaluated_depsgraph_get()
    evaluated = mesh.evaluated_get(depsgraph)
    data = evaluated.to_mesh()
    points = numpy.empty(len(data.vertices) * 3, numpy.float32)
    normals = numpy.empty(len(data.vertices) * 3, numpy.float32)
    data.vertices.foreach_get("co", points)
    data.vertex_normals.foreach_get("vector", normals)
    evaluated.to_mesh_clear()
    matrix = numpy.array(evaluated.matrix_world, numpy.float32)
    points = points.reshape(-1, 3) @ matrix[:3, :3].T + matrix[:3, 3]
    normals = normals.reshape(-1, 3) @ numpy.linalg.inv(matrix[:3, :3])
    normals /= numpy.maximum(numpy.linalg.norm(normals, axis=1, keepdims=True), 1e-8)
    marks = numpy.array(
        [socket.evaluated_get(depsgraph).matrix_world.translation for socket in sockets], numpy.float32
    ).reshape(-1, 3)
    return points, normals, marks


def play(rig, action, slot):
    """Assign a clip from the rest pose, since bones a clip doesn't key keep whatever pose they had."""
    for bone in rig.pose.bones:
        bone.location = (0, 0, 0)
        bone.rotation_quaternion = (1, 0, 0, 0)
        bone.rotation_euler = (0, 0, 0)
        bone.rotation_axis_angle = (0, 0, 1, 0)
        bone.scale = (1, 1, 1)
    animation = rig.animation_data or rig.animation_data_create()
    animation.use_nla = False
    animation.action = action
    animation.action_slot = slot


def bake(rig, mesh, sockets, fps, name, action, slot):
    """Sample a clip at RATE. A loop leaves out its end, which repeats its start."""
    play(rig, action, slot)
    start, end = action.frame_range
    seconds = (end - start) / fps
    loop = name in LOOPS
    count = max(1, round(seconds * RATE)) if loop else round(seconds * RATE) + 1
    poses = [pose(mesh, sockets, start + index / RATE * fps) for index in range(count)]
    closing = pose(mesh, sockets, end) if loop and count > 1 else None
    return poses, closing


def check_clip(name, action, poses, closing, height, footprint, blockout):
    points = numpy.stack([points for points, _, _ in poses])
    if len({len(frame) for frame in points}) != 1:
        raise ValueError(f"The {name!r} clip changes the vertex count. Keep topology fixed while it plays")
    lowest = points[..., 2].min()
    if lowest < -shared.GROUND_SKIRT - 0.001:
        raise ValueError(f"The {name!r} clip sinks to Z={lowest:g}, below the ground")
    if closing is not None:
        gap = numpy.linalg.norm(closing[0] - points[0], axis=1).max()
        if gap > LOOP_TOLERANCE * height:
            raise ValueError(f"The {name!r} loop ends {gap:.3g} units from its first pose. Key its end like its start")
    if name == "move":
        drift = numpy.linalg.norm(points[:, :, :2].mean(axis=1) - points[0, :, :2].mean(axis=0), axis=1).max()
        if drift > DRIFT_TOLERANCE * footprint:
            raise ValueError(f"The move clip travels {drift:.3g} units. Animate it in place, since the game moves the unit")
        if not blockout and not action.get("stride", 0) > 0:
            raise ValueError(
                "Give the move action a custom property 'stride': the ground one cycle covers, in units, "
                "so the game can match the cycle to the unit's speed"
            )


def static_mesh(rig, mesh, sockets, clips, identifier):
    """A copy of the mesh in the first idle pose, numbering each vertex for the baked frames."""
    if clips:
        _, action, slot = clips[0]
        play(rig, action, slot)
        pose(mesh, sockets, action.frame_range[0])
    depsgraph = bpy.context.evaluated_depsgraph_get()
    evaluated = mesh.evaluated_get(depsgraph)
    data = bpy.data.meshes.new_from_object(evaluated, preserve_all_data_layers=True, depsgraph=depsgraph)
    data.transform(evaluated.matrix_world)
    numbers = data.attributes.new(VERTEX_ATTRIBUTE, "FLOAT", "POINT")
    numbers.data.foreach_set("value", numpy.arange(len(data.vertices), dtype=numpy.float32))
    return bpy.data.objects.new(identifier, data)


def append_frames(path, frames, blobs):
    """Add the baked frames to the GLB's binary chunk, and describe them in the mesh node's extras."""
    data = path.read_bytes()
    json_length = struct.unpack_from("<I", data, 12)[0]
    document = json.loads(data[20:20 + json_length])
    binary_length, binary_type = struct.unpack_from("<I4s", data, 20 + json_length)
    if binary_type != b"BIN\0":
        raise ValueError("Expected the GLB's second chunk to hold its binary data")
    binary = bytearray(data[28 + json_length:28 + json_length + binary_length])
    views = document.setdefault("bufferViews", [])
    indices = {}
    for name, blob in blobs.items():
        binary += b"\0" * (-len(binary) % 4)
        indices[name] = len(views)
        views.append({"buffer": 0, "byteOffset": len(binary), "byteLength": len(blob)})
        binary += blob
    binary += b"\0" * (-len(binary) % 4)
    document["buffers"][0]["byteLength"] = len(binary)
    frames["positions"] = indices.pop("positions")
    frames["normals"] = indices.pop("normals")
    frames["sockets"] = indices
    node = next(node for node in document["nodes"] if "mesh" in node)
    node.setdefault("extras", {})["frames"] = frames
    text = json.dumps(document, separators=(",", ":")).encode()
    text += b" " * (-len(text) % 4)
    length = 12 + 8 + len(text) + 8 + len(binary)
    path.write_bytes(
        struct.pack("<4sII", b"glTF", 2, length)
        + struct.pack("<I4s", len(text), b"JSON") + text
        + struct.pack("<I4s", len(binary), b"BIN\0") + bytes(binary)
    )


def read_frames(path):
    """The baked frames of a staged GLB in glTF space: positions, normals, sockets, and their description."""
    data = path.read_bytes()
    json_length = struct.unpack_from("<I", data, 12)[0]
    document = json.loads(data[20:20 + json_length])
    start = 28 + json_length
    frames = next(node["extras"]["frames"] for node in document["nodes"] if "frames" in node.get("extras", {}))

    def view(index, dtype):
        item = document["bufferViews"][index]
        count = item["byteLength"] // numpy.dtype(dtype).itemsize
        return numpy.frombuffer(data, dtype, count, start + item.get("byteOffset", 0)).astype(numpy.float32)

    vertices = frames["vertices"]
    positions = view(frames["positions"], "<f2").reshape(-1, vertices, 4)[..., :3]
    normals = view(frames["normals"], "<f2").reshape(-1, vertices, 4)[..., :3]
    sockets = {name: view(index, "<f4").reshape(-1, 3) for name, index in frames["sockets"].items()}
    return frames, positions, normals, sockets


def export_creature(root, place, identifier, output, destination, blockout, hero=False, over=None):
    collection, rig, mesh, sockets, fps = open_source(root, place, identifier)
    clips = find_clips(blockout)

    baked = []
    if clips:
        for name, action, slot in clips:
            poses, closing = bake(rig, mesh, sockets, fps, name, action, slot)
            baked.append((name, action, poses, closing))
    else:
        # A blockout without clips bakes its current pose as a one-frame idle.
        baked.append(("idle", None, [pose(mesh, sockets, bpy.context.scene.frame_current)], None))

    first = baked[0][2][0][0]
    minimum, maximum = first.min(axis=0), first.max(axis=0)
    extent = maximum - minimum
    if not -shared.GROUND_SKIRT - 0.001 <= minimum[2] <= 0.001:
        raise ValueError(f"Stand the first {baked[0][0]} pose on the ground at Z=0, measured lowest Z={minimum[2]:g}")
    for name, action, poses, closing in baked:
        check_clip(name, action, poses, closing, extent[2], max(extent[0], extent[1]), blockout)

    static = static_mesh(rig, mesh, sockets, clips, identifier)
    scene = bpy.context.scene
    for child in list(scene.collection.children):
        scene.collection.children.unlink(child)
    for obj in list(scene.collection.objects):
        scene.collection.objects.unlink(obj)
    scene.collection.objects.link(static)
    if len(static.data.vertices) != len(first):
        raise ValueError("The exported mesh and the baked frames differ in vertex count")

    status = bpy.ops.export_scene.gltf(
        filepath=str(output),
        export_format="GLB",
        export_yup=True,
        export_animations=False,
        export_skins=False,
        export_morph=False,
        export_attributes=True,
        use_active_scene=True,
    )
    if "FINISHED" not in status:
        raise ValueError("Blender could not export the creature")
    summary, images, glowing, team, triangles = shared.glb_summary(output)
    share = shared.budget(place, triangles, hero=hero, over=over, blockout=blockout)
    if not blockout:
        if not team:
            raise ValueError(
                f"A unit shows its owner. Give the faces that take the player's color a material named "
                f"{shared.TEAM_MATERIAL!r}."
            )
        if not images:
            raise ValueError("The export has no image textures. Map the mesh onto the set's atlas cards first.")
        if shared.set_settings(root, place)["glow"] and not glowing:
            raise ValueError(f"{shared.model_set(place)} glows, but the export has no emissive texture.")

    positions, normals, clip_table, socket_tracks = [], [], {}, {socket.name: [] for socket in sockets}
    for name, action, poses, _ in baked:
        clip_table[name] = {"start": len(positions), "frames": len(poses), "loop": name in LOOPS}
        if action is not None and "stride" in action:
            clip_table[name]["stride"] = float(action["stride"])
        for points, vectors, marks in poses:
            positions.append(to_gltf(points))
            normals.append(to_gltf(vectors))
            for socket, mark in zip(sockets, marks):
                socket_tracks[socket.name].append(to_gltf(mark))
    if len(positions) > shared.FRAME_BUDGET and not over and not blockout:
        raise ValueError(
            f"{len(positions)} baked frames is over the budget of {shared.FRAME_BUDGET}. "
            "Shorten the clips, idle first, or pass --over-budget with the reason it needs more"
        )
    padded = lambda frames: numpy.pad(numpy.stack(frames), ((0, 0), (0, 0), (0, 1))).astype("<f2").tobytes()
    blobs = {"positions": padded(positions), "normals": padded(normals)}
    blobs.update({name: numpy.array(track, "<f4").tobytes() for name, track in socket_tracks.items()})
    frames = {"attribute": GLTF_ATTRIBUTE, "rate": RATE, "vertices": len(first), "clips": clip_table}
    append_frames(output, frames, blobs)
    note = shared.finish_export(root, place, output, destination, collection, Vector(minimum), Vector(maximum))

    memory = (len(blobs["positions"]) + len(blobs["normals"])) / 1e6
    clip_list = ", ".join(f"{name} {clip['frames']}" for name, clip in clip_table.items())
    size = " × ".join(f"{value:.3g}" for value in extent)
    stage = ", untextured blockout" if blockout else ""
    return (
        f"{summary}, {share}, {size} Blender units (width × depth × height), {len(first):,} baked vertices, "
        f"clips: {clip_list} frames at {RATE} a second, {len(positions)} of {shared.FRAME_BUDGET} frames, "
        f"{memory:.2f} MB of frames on the GPU, "
        f"sockets: {', '.join(socket_tracks) or 'none'}{stage}{note}"
    )


def render_clips(root, place, identifier, lighting):
    """A sheet with a row per clip and four poses across, rendered from the baked frames in the GLB."""
    path = root / shared.STAGING / place / f"{identifier}.glb"
    frames, positions, normals, socket_tracks = read_frames(path)
    scene = bpy.context.scene
    objects, _, _ = shared.import_glb(path, place)
    body = next(obj for obj in objects if obj.type == "MESH")
    numbers = numpy.empty(len(body.data.vertices), numpy.float32)
    body.data.attributes[GLTF_ATTRIBUTE].data.foreach_get("value", numbers)
    numbers = numbers.round().astype(int)

    markers = []
    for name in socket_tracks:
        bpy.ops.mesh.primitive_uv_sphere_add(radius=0.06, segments=12, ring_count=6)
        marker = bpy.context.object
        marker.name = f"socket {name}"
        glow = bpy.data.materials.new(f"socket {name}")
        node = glow.node_tree.nodes["Principled BSDF"]
        node.inputs["Emission Color"].default_value = (1, 0, 1, 1)
        node.inputs["Emission Strength"].default_value = 4
        marker.data.materials.append(glow)
        markers.append((marker, socket_tracks[name]))

    matrix = numpy.array(body.matrix_world, numpy.float32)
    world = from_gltf(positions) @ matrix[:3, :3].T + matrix[:3, 3]
    minimum, maximum = world.reshape(-1, 3).min(axis=0), world.reshape(-1, 3).max(axis=0)
    default = shared.set_settings(root, place)["lighting"]
    shared.stage_like_game(scene, lighting or default)
    camera = bpy.data.objects.new("Game camera", bpy.data.cameras.new("Game camera"))
    camera.data.sensor_fit = "VERTICAL"
    camera.data.angle_y = math.radians(shared.FIELD_OF_VIEW)
    camera.rotation_euler = (math.radians(90 - shared.PITCH), 0, 0)
    scene.collection.objects.link(camera)
    scene.camera = camera
    reach = numpy.linalg.norm(maximum - minimum) / 2
    away = max(2.0, reach / math.sin(math.radians(shared.FIELD_OF_VIEW) / 2) * 0.85)
    center = (minimum + maximum) / 2

    clips = list(frames["clips"].items())
    gap = shared.SHEET_GAP
    width = CLIP_COLUMNS * CLIP_CELL + (CLIP_COLUMNS - 1) * gap
    sheet = numpy.empty((len(clips) * (CLIP_CELL + gap) - gap, width, 4), numpy.float32)
    sheet[:] = [int(shared.SHEET_BACKGROUND[i:i + 2], 16) / 255 for i in (1, 3, 5)] + [1]
    with TemporaryDirectory() as temporary:
        cell = Path(temporary) / "cell.png"
        for row, (_, clip) in enumerate(clips):
            count = clip["frames"]
            # A loop shows quarters of its cycle. A one-shot shows its start, its end, and two poses between.
            picks = [count * column // CLIP_COLUMNS if clip["loop"] else round(column * (count - 1) / (CLIP_COLUMNS - 1))
                     for column in range(CLIP_COLUMNS)]
            for column, pick in enumerate(picks):
                index = clip["start"] + pick
                body.data.vertices.foreach_set("co", from_gltf(positions[index][numbers]).ravel())
                body.data.normals_split_custom_set_from_vertices(from_gltf(normals[index][numbers]))
                body.data.update()
                for marker, track in markers:
                    marker.location = body.matrix_world @ Vector(from_gltf(track[index]))
                shared.shoot(scene, camera, float(center[0]), away, CLIP_CELL, CLIP_CELL, cell, target_z=float(center[2]))
                top, left = row * (CLIP_CELL + gap), column * (CLIP_CELL + gap)
                sheet[top:top + CLIP_CELL, left:left + CLIP_CELL] = shared.read_png(cell)
    stem = identifier if lighting in (None, default) else f"{identifier}-{lighting}"
    output = root / shared.RENDERS / place / f"{stem}-clips.png"
    shared.write_png(sheet, output)
    return f"{output} (rows: {', '.join(name for name, _ in clips)})"


def main():
    if not bpy.app.background:
        raise SystemExit("Run this helper with Blender's --background flag")

    arguments = argparse.ArgumentParser(description=__doc__)
    commands = arguments.add_subparsers(dest="command", required=True)
    export = commands.add_parser("export", help="Bake the clips and stage the GLB")
    export.add_argument("--replace", action="store_true", help="Replace the staged GLB")
    export.add_argument("--blockout", action="store_true", help="Allow missing clips, textures, and team color")
    shared.add_budget_arguments(export)
    render = commands.add_parser("render", help="Render the review sheet and the clip sheet of a staged export")
    render.add_argument(
        "--with",
        dest="neighbors",
        default="",
        help="Comma-separated IDs in the same kind and set, theme/ID, or factions/<faction>/ID references, "
        "each optionally after another kind, as in structures:barracks",
    )
    render.add_argument("--lighting", choices=sorted(shared.LIGHTING), help="Review lighting, instead of the set's")
    render.add_argument("--distance", type=float, default=30, help="Camera distance for the desktop and phone views")
    for command in (export, render):
        command.add_argument("asset_id", type=shared.asset_id)
        which = command.add_mutually_exclusive_group(required=True)
        which.add_argument("--theme", type=shared.asset_id, help="A theme, the look of a map")
        which.add_argument("--faction", type=shared.asset_id, help="A faction, the look of one side")
        command.add_argument("--kind", choices=shared.SKELETAL_KINDS, default="infantry", help="What the creature is")
        command.add_argument("--root", type=Path, default=Path.cwd())
    options = arguments.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])
    root = options.root.resolve()
    if not (root / shared.LIBRARY).is_dir():
        arguments.error(f"{root} has no {shared.LIBRARY} folder. Run from the web-rts root or pass --root.")
    kind_set = shared.THEMES / options.theme if options.theme else shared.FACTIONS / options.faction
    place = Path(options.kind) / kind_set

    if options.command == "render":
        try:
            neighbors = [
                shared.model_ref(item.strip(), place) for item in options.neighbors.split(",")
            ] if options.neighbors else []
        except argparse.ArgumentTypeError as error:
            render.error(str(error))
        bpy.ops.wm.read_factory_settings(use_empty=True)
        print("\n".join(shared.render_model(
            root, place, options.asset_id, neighbors, options.distance, options.lighting
        )))
        bpy.ops.wm.read_factory_settings(use_empty=True)
        print(render_clips(root, place, options.asset_id, options.lighting))
        return

    destination = root / shared.STAGING / place / f"{options.asset_id}.glb"
    if not options.replace and destination.exists():
        arguments.error(f"{destination} already exists. Pass --replace to overwrite it.")
    destination.parent.mkdir(parents=True, exist_ok=True)
    with TemporaryDirectory(dir=destination.parent) as temporary:
        output = Path(temporary) / destination.name
        summary = export_creature(
            root, place, options.asset_id, output, destination, options.blockout, options.hero, options.over_budget
        )
        if options.replace:
            output.replace(destination)
        else:
            os.link(output, destination)
    print(f"{destination} ({summary})")


if __name__ == "__main__":
    main()
