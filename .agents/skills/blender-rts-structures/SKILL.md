---
name: blender-rts-structures
description: Create or revise original RTS buildings and structures in Blender, match the existing asset family's style and scale, organize linked source assets in the project library, and export individual web-ready GLBs. Use for structure blockouts, modular kits, library maintenance, and asset export.
---

# Blender RTS structures

Read [the project pipeline](references/pipeline.md) for source and export paths, Blender conventions, and helper commands. Resolve paths from the web-rts workspace root. For an asset revision, open its existing source first and preserve its asset ID, anchor, and intentional dimensions.

## Build the asset

1. Establish the structure's role, faction or visual family, world-space footprint, main entrance or front, and any required moving parts. Take gameplay dimensions from the matching project definition or placement rules when available. When none exist, record provisional dimensions in the source collection and describe the assumption when delivering.
2. Compare against the closest approved assets at the actual game camera angle and representative desktop and phone zoom levels. Match their scale, shape language, material palette, bevel treatment, and detail density. If the library is empty, use an original prototype with broad forms, readable roof shapes, and a restrained material palette. Treat that look as provisional until approved.
3. Block out the footprint, primary mass, and one or two features that identify the role from above. Inspect the silhouette and separation from neighboring buildings before adding vents, trim, or other small details. Reuse matching modular geometry and materials where they already exist. Place smaller details where the gameplay camera can resolve them.
4. Save the editable model in its canonical source file. Put the render meshes for the default state in the named asset collection, with helpers and experiments in sibling collections. Mark the render collection as an Asset and give it a useful description. Keep procedural modeling modifiers editable in the source.
5. When the request includes runtime delivery, isolate and export the named asset as GLB. Verify its footprint, ground contact, orientation, material appearance, and silhouette after import. Report the export's size, triangles, and primitives. Compare these with neighboring assets and the expected repetition on a typical map. Use staged exports until the asset is ready to ship.
6. Refresh the linked gallery when creating or reorganizing assets if the user wants a current side-by-side view. Save source changes first. Use the source files to edit geometry and materials.

For simple structures, use reusable Principled BSDF materials with matching viewport colors. Read the texture guidance in the pipeline when baking or introducing image textures. Keep terrain, selection overlays, and gameplay collision or navigation in their existing project systems. Use the Blender connector for an existing scene when helpful, or Blender's background CLI with `bpy` for repeatable modeling, export, and verification.
