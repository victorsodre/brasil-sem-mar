# Por que há um GLTFLoader aqui

O `web/vendor/three/addons/loaders/GLTFLoader.js` (three 0.185.1) importa `../utils/SkeletonUtils.js`, que não foi vendorizado em `web/vendor/three/addons/utils/`. Sem esse arquivo o módulo inteiro falha (404) e a página nem chega a criar `window.__bsm`.

Esta pasta tem uma cópia do `GLTFLoader.js` e do `SkeletonUtils.js` de `node_modules/three/examples/jsm/` (mesma versão), com dois caminhos ajustados:

- `../utils/BufferGeometryUtils.js` → `../../../vendor/three/addons/utils/BufferGeometryUtils.js` (o vendorizado)
- `../utils/SkeletonUtils.js` → `./SkeletonUtils.js` (a cópia ao lado)

Quando `SkeletonUtils.js` entrar no vendor comum, basta trocar o import em `app.js` para `three/addons/loaders/GLTFLoader.js` e apagar esta pasta.
