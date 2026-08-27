# Change log

Change log file for tracking changes for myself.

The format is based on [Keep a Changelog](http://keepachangelog.com/en/1.0.0/)

## [Unreleased]

### Added

- Added end flash effect on supported Iris versions;
- Added ENTITY_VERTEX_TBN option, can provide smooth normal look on some mod entities;
- Added TAA_HISTORY_WEIGHT and TAA_HISTORY_CLIP_VARIANCE option;
- Added water fog scatting options;
- Added GT7 tonemapping;

### Changed

- Adjusted default water look;

### Fixed

- Fixed particle rendering in 1.12.2 (and maybe 1.8.9);
- Fixed top and bottom face normal of item models using `builtin/generated` in 1.12.2 (and maybe 1.8.9);
- Fixed objects with strange `mc_midTexCoord` may break translucent check in shadow;

## [1.1.0] - 2026-08-10

### Added

- Added SuperResolution mod compat;
- Added 26.2 new blocks to needed hardcoded support list;
- Added 26.3 (up to 26.3 snapshot 3) new blocks to needed hardcoded support list;
- Added physics ocean v2 compat (require Physics Mod Pro v185c or later versions);
- Added normal clamping to physics ocean wave (already exist on common/DH/Voxy water);
- Added PARALLAX_DOF support for DoF focus point (previously it does not run on focus point depth);

### Changed

- Reworked water wave on default WATER_TYPE, and added some customize options for it;
- Normalized colorwheel light level;
- Adjusted sky lighting strength to fit some option change during rain;
- HARDCODED_EMISSIVE now only applies on blocks;
- Using sky light level of start block instead of camera in light leaking fix for reflection;
- Updated sky light fading curve;
- Using rendered sun but not specular in smooth reflection;
- Adjusted sunlight shadow outside shadowmapping;
- Adjusted rainy volumetric light/fog lighting;
- Adjusted water/powder snow fog during rain;
- Try to avoid allocating main/alt shadowcolor1 to reduce VRAM usage;
- Remapped gbuffer data storage to improve performance on certain effects;

### Fixed

- Fixed anisotropic filter issue on terrain far away caused by interpolation on `coordRange`;
- Fixed self hit on solid reflection near screen edge;
- Fixed color interpolation in refraction (#14);
- Fixed voxy water when setting WATER_TYPE to 1 (Vanilla);
- Fixed sunlight color will contribute to sky lighting on translucent particles in the end;
- Fixed realistic cloud will ignore hit result of last step;
- Fixed DoF when DOF_FOCUS_TEXTURE is not depthtex2, CORRECT_DOF_HAND_DEPTH is on, and focusing on held object;
- Fixed translucent shadow does not consider vertex color;
- Fixed rain puddle on cauldron water may become weaker when setting RAIN_PUDDLE to high below 26.1;

## [1.0.0] - 2026-06-02

### Added

- First release.
