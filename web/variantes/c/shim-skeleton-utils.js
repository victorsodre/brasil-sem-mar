// O GLTFLoader vendorizado importa ../utils/SkeletonUtils.js, que não foi copiado
// para web/vendor/three/addons/utils/. O importmap da variante C aponta esse URL
// para cá: `clone` só é chamado quando um nó aparece em mais de uma cena, o que
// não acontece com a régua (uma cena, um nó, sem esqueleto).
export function clone(source) { return source.clone(); }
