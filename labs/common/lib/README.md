# Self-hosted 3D libraries

These files are kept inside this repository so the labs run without any external CDN
(CDN 접속이 차단된 학교 전산망에서도 3D 실험이 동작하도록 저장소 안에 직접 보관합니다).

| File | Version | Original source |
| --- | --- | --- |
| `three.min.js` | r128 (build 128) | https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js |
| `OrbitControls.js` | r128 (`three@0.128.0`) | https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js |
| `qrcode.min.js` | 1.0.0 (master) | https://cdn.jsdelivr.net/gh/davidshimjs/qrcodejs@master/qrcode.min.js |

Downloaded 2026-11-08 (`qrcode.min.js` 2026-11-09). Do not edit these files; replace them only as a pair with a
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
