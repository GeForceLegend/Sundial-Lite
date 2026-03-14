# Sundial Lite

Sundial Lite is the free and open source version of Sundial. It's using [GNU General Public Licence 3.0](./LICENSE). For the full and paid version, visit [Aifadian](https://afdian.com/a/geforcelegend). For legit issues, I'll try avoid using platforms blocked by GFW like Patreon, so sorry for some users having issue signing in this site.

## Features

Sundial Lite contains most features from the full version, excepting path tracing stuff like path traced global illumination and reflection. It also reduced reflection and volumetric light (and fog) from calculating 2 times to 1 time.

Sundial Lite is using [visibility bitmask from shadertoy (CC0)](https://www.shadertoy.com/view/XcdBWf) as global illumination and ambient occlusion solution. Noise is expected.

## Supported versions

Optifine released after 04.12.2019 (1.8.9 L5) is supported.

Iris above 1.7.0 may be supported with some artifacts, not tested yet.

**Currently most latest Iris is not compatible due to [IrisShaders/Iris#3018](https://github.com/IrisShaders/Iris/issues/3018). If this is fixed, I'll remove this line.**
