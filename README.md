# `assets` — binaires de la page MICCAI 2026

Branche orpheline : elle n'a aucun historique commun avec `main` et n'est jamais
fusionnée. Elle ne contient que les données 3D lourdes de `miccai-2026/`, sorties
de l'historique du site pour qu'il reste léger.

Les fichiers sont servis au navigateur par jsDelivr, qui renvoie les en-têtes CORS
dont `fetch()` a besoin (les assets de release GitHub, eux, ne le font pas) :

    https://cdn.jsdelivr.net/gh/hadrienbigoballand/website@<tag>/data/atlas.bin

Le tag rend le cache jsDelivr permanent. Pour publier une nouvelle version des
binaires : commiter ici, poser un nouveau tag `assets-vN`, et bumper `ASSETS_TAG`
dans `miccai-2026/js/asset-base.js` sur `main`.

Les vidéos du hero ne sont pas ici : elles passent par la release
`miccai-2026-assets-v1`, car une balise `<video>` n'a pas besoin de CORS.
