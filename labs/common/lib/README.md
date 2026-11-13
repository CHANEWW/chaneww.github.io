# Self-hosted 3D libraries

These files are kept inside this repository so the labs run without any external CDN
(CDN 접속이 차단된 학교 전산망에서도 3D 실험이 동작하도록 저장소 안에 직접 보관합니다).

| File | Version | Original source |
| --- | --- | --- |
| `three.min.js` | r128 (build 128) | https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js |
| `OrbitControls.js` | r128 (`three@0.128.0`) | https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js |
| `qrcode.min.js` | 1.0.0 (master) | https://cdn.jsdelivr.net/gh/davidshimjs/qrcodejs@master/qrcode.min.js |
| `jsQR.js` | 1.4.0 | https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js |

Downloaded 2026-11-08 (`qrcode.min.js` 2026-11-09, `jsQR.js` 2026-11-14). Do not edit these files; replace them only as a pair with a
matching version from the same release.

All lab pages load them with relative paths, e.g. from `labs/physics/mechanics/sho.html`:

```html
<script src="../../common/lib/three.min.js"></script>
<script src="../../common/lib/OrbitControls.js"></script>
```

## License

Three.js and OrbitControls are released under the MIT License.

```
The MIT License

Copyright © 2010-2021 three.js authors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

The three.js license above also covers `OrbitControls.js`.

`qrcode.min.js` is [davidshimjs/qrcodejs](https://github.com/davidshimjs/qrcodejs),
released under the MIT License.

```
The MIT License (MIT)
----------------------
Copyright (c) 2012 davidshimjs

Permission is hereby granted, free of charge,
to any person obtaining a copy of this software and associated documentation files (the "Software"),
to deal in the Software without restriction,
including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense,
and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so,
subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
```

## jsQR (worksheet AR)

`jsQR.js` is [cozmo/jsQR](https://github.com/cozmo/jsQR) 1.4.0, released under the
Apache License 2.0. It decodes QR codes from a canvas ImageData buffer in the browser,
which is what the worksheet camera AR mode (`labs/test/qr_3d_viewer.html`) uses.

```
Apache License, Version 2.0 (http://www.apache.org/licenses/LICENSE-2.0)
Copyright (c) 2016 Cosmo Wolfe

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
```
