# Sundial Lite

Sundial Lite is the free and open source version of Sundial, using [GNU General Public Licence 3.0](./LICENSE). It's designed to make the balance between quality, performance and compatibility. For the full version which is still not complete and need subscription for early testing versions, visit [Aifadian](https://afdian.com/a/geforcelegend). For legit issues, I'll try avoid using platforms blocked by GFW like Patreon, so sorry for some users having issue signing in this site.

[![Modrinth](https://img.shields.io/modrinth/dt/sundial-lite?color=00AF5C&label=Modrinth&logo=modrinth)](https://modrinth.com/shader/sundial-lite)
[![CurseForge](https://img.shields.io/curseforge/dt/1562387?color=F16436&label=CurseForge&logo=curseforge)](https://www.curseforge.com/minecraft/shaders/sundial-lite)

## Supported versions

Optifine released after 04.12.2019 (1.8.9 L5) is supported.

Theoretically can run on Iris 1.5.0 and above, but for less bugs, latest Iris is suggested.

## Features

Sundial Lite contains most features from the full version and with some extra features, including but not limits to:

- Shadowmapping, including transparent shadow and water caustics
- Waving plants
- Full LabPBR support (LabPBR AO is disabled by default) and some optional builtin PBR material for certain blocks
- Builtin anisotropic filtering, does not need vanilla/Optifine's anisotropic enabled
- Smooth parallax for smoothed surface, and voxel parallax for exact cubic surface
- Parallax based normal for unified parallax and normal experience
- Percentage closer soft shadow, screen space shadow and cloud shadow
- Noisy SSGI and SSAO based on [screen space visibility bitmask from shadertoy (CC0)](https://www.shadertoy.com/view/XcdBWf)
- Screen space reflection with reflection filter
- Physical based atmosphere that considers player height
- Switchable blocky and realistic cloud, both can occlude ground if you fly high enough, and extra 2D plane cloud
- Vanilla weather rendering
- Switchable realistic and vanilla style water type
- Refraction based on one time offset
- Sunlight specular on transparent objects
- Water fog, nether fog and the end fog, also include galaxy for the end
- Volumetric light and volumetric fog
- Depth of Field
- Temporal anti aliasing
- Motion blur
- Bloom
- Average exposure
- Barrel/pincushion disortion
- Chromatic dispersion
- Tonemapping and some final color adjustments
- FidelityFX RCAS final sharpening
- Lots of configurable shader options for above features
- Correct held object support for SSGI, SSAO, Screen space shadow, reflection, DoF and TAA
- Compatible with Distant Horizons, Voxy, Colorwheel and Physics Mod Pro

As a compartion to the full version, it does not use voxelization and world space ray tracing, reducing volumetric light and reflection from computing 2 times to 1 time, losing multiple bounce reflection, but have much better performance and mod compatibility.

## Known issues

- As a deferred-rendering shaders, it does not work well on mods that use transparent objects without writing to depth, and can only see the closest transparent objects, like you cannot see water behind stained glass blocks
- Due to terrain culling in shadow and render distance limit, sometimes you may see sunlight leaks in caves and buildings, this is not that resolvable on shader side
- Minecraft 26.1's rendering order is very bad, causing some overlay designed to decorate solid object are rendering with transparent obejcts, causing enchantment glint, horse marking, banner pattern, spider/enderman eyes and so on cannot rendered correctly on deferred-rendering shaders, and very expensive to resolve on shader side
- Certain versions of Optifine (like 1.21.2 to 1.21.8 J6 Pre15) cannot use vanilla light texture in deferred pipeline correctly, disable `Mod support > Mod night vision compat` can fix it on those versions
